/**
 * Perceptual hash (pHash) shared by the data build and the scan worker.
 *
 * Both sides MUST feed the same input: an RGBA card image of exactly
 * CARD_W x CARD_H (the size of Scryfall's "normal" images). The build gets it
 * from the image CDN, the worker from the perspective-corrected camera frame.
 * Everything after that point is this file, so both produce identical bits
 * (see the golden test).
 */

export const CARD_W = 488;
export const CARD_H = 680;

/** Region of the card as fractions of width/height. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Illustration box. Chosen slightly inside the art of the modern (2015+) frame
 * so that it still lands on the art for the 1993/1997/2003 frames, which place
 * the art a little differently. Identical across all languages of a print.
 */
export const ART_REGION: Region = { x: 0.11, y: 0.135, w: 0.78, h: 0.38 };

/** Whole card, minus a thin margin that absorbs corner-detection error. */
export const FULL_REGION: Region = { x: 0.035, y: 0.025, w: 0.93, h: 0.95 };

/**
 * A hash as unsigned 32-bit words, most significant bit first.
 * Art: 256 bits (16x16 DCT block of a 64x64 image), enough separation for
 * ~100k prints. Full card: 64 bits (8x8 of 32x32); the shared frame layout
 * makes it weakly discriminative, it mainly separates reprints with other frames.
 */
export type Hash = Uint32Array;

export interface CardHashes {
  art: Hash;
  full: Hash;
}

export const ART_HASH = { n: 64, k: 16, words: 8 } as const;
export const FULL_HASH = { n: 32, k: 8, words: 2 } as const;

// DCT-II basis, rounded to float32 so that engines whose Math.cos differs in
// the last ulp (V8 vs JavaScriptCore) still agree bit for bit.
const cosTables = new Map<string, Float64Array>();
function cosTable(n: number, k: number): Float64Array {
  const key = `${n}x${k}`;
  let t = cosTables.get(key);
  if (!t) {
    t = new Float64Array(k * n);
    for (let u = 0; u < k; u++)
      for (let x = 0; x < n; x++) t[u * n + x] = Math.fround(Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)));
    cosTables.set(key, t);
  }
  return t;
}

/**
 * Box-filter a region of an RGBA image down to n x n luma values.
 * Every source pixel is weighted by how much of it falls into each output cell,
 * so the result does not depend on how the region aligns with the pixel grid.
 */
export function regionToLuma(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  region: Region,
  n: number,
  gains: readonly [number, number, number] = [1, 1, 1],
): Float64Array {
  const x0 = region.x * width;
  const y0 = region.y * height;
  const cw = (region.w * width) / n;
  const ch = (region.h * height) / n;
  const out = new Float64Array(n * n);
  const rowAcc = new Float64Array(n);
  // BT.601 luma weights, folded together with the white-balance gains.
  const wr = (77 / 256) * gains[0], wg = (150 / 256) * gains[1], wb = (29 / 256) * gains[2];
  for (let oy = 0; oy < n; oy++) {
    const sy0 = y0 + oy * ch;
    const sy1 = sy0 + ch;
    rowAcc.fill(0);
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
      const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
      if (wy <= 0 || sy < 0 || sy >= height) continue;
      const rowOff = sy * width * 4;
      for (let ox = 0; ox < n; ox++) {
        const sx0 = x0 + ox * cw;
        const sx1 = sx0 + cw;
        let acc = 0;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0 || sx < 0 || sx >= width) continue;
          const i = rowOff + sx * 4;
          const l = rgba[i]! * wr + rgba[i + 1]! * wg + rgba[i + 2]! * wb;
          acc += l * wx;
        }
        rowAcc[ox]! += acc * wy;
      }
    }
    const area = cw * ch;
    for (let ox = 0; ox < n; ox++) out[oy * n + ox] = rowAcc[ox]! / area;
  }
  return out;
}

/** pHash of an n x n luma block: k x k lowest DCT frequencies against their median. */
export function phashLuma(luma: Float64Array, n: number, k: number): Hash {
  const cos = cosTable(n, k);
  const tmp = new Float64Array(k * n); // DCT over y
  for (let v = 0; v < k; v++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += cos[v * n + y]! * luma[y * n + x]!;
      tmp[v * n + x] = s;
    }
  const bits = k * k;
  const coeff = new Float64Array(bits);
  for (let v = 0; v < k; v++)
    for (let u = 0; u < k; u++) {
      let s = 0;
      for (let x = 0; x < n; x++) s += cos[u * n + x]! * tmp[v * n + x]!;
      coeff[v * k + u] = s;
    }
  // Median of the AC coefficients; the DC term only encodes overall brightness.
  const ac = Array.from(coeff.subarray(1)).sort((a, b) => a - b);
  const median = ac[Math.floor(ac.length / 2)]!;
  const out = new Uint32Array(bits / 32);
  // Bit 0 is the DC term, which sits far above the AC median and is always 1.
  for (let i = 0; i < bits; i++) if (coeff[i]! > median) out[i >>> 5]! |= 1 << (31 - (i & 31));
  return out;
}

export function hashRegion(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  region: Region,
  spec: { n: number; k: number },
  gains?: readonly [number, number, number],
): Hash {
  return phashLuma(regionToLuma(rgba, width, height, region, spec.n, gains), spec.n, spec.k);
}

/**
 * Gray-world white balance: per-channel gains that bring each channel's mean
 * over the card to the same value. Cancels the camera's colour cast, which
 * would otherwise change which coloured areas look brighter than others.
 */
export function whiteBalanceGains(rgba: Uint8Array | Uint8ClampedArray): [number, number, number] {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < rgba.length; i += 16) { r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!; }
  const m = (r + g + b) / 3;
  return [r ? m / r : 1, g ? m / g : 1, b ? m / b : 1];
}

/** Both hashes for a CARD_W x CARD_H RGBA card image. */
export function hashCard(rgba: Uint8Array | Uint8ClampedArray, width = CARD_W, height = CARD_H): CardHashes {
  const gains = whiteBalanceGains(rgba);
  return {
    art: hashRegion(rgba, width, height, ART_REGION, ART_HASH, gains),
    full: hashRegion(rgba, width, height, FULL_REGION, FULL_HASH, gains),
  };
}

export function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hamming(a: Hash, b: Hash): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += popcount32(a[i]! ^ b[i]!);
  return d;
}

export function hashToHex(h: Hash): string {
  return Array.from(h, (w) => w.toString(16).padStart(8, '0')).join('');
}

export function hexToHash(s: string): Hash {
  const out = new Uint32Array(s.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return out;
}

/** Rotate an RGBA image by 180 degrees (card held upside down). */
export function rotate180(rgba: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length / 4;
  const src = new Uint32Array(rgba.buffer, rgba.byteOffset, n);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = src[n - 1 - i]!;
  return new Uint8ClampedArray(out.buffer);
}
