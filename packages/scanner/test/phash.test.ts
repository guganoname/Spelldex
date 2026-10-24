import { describe, expect, it } from 'vitest';
import {
  CARD_H, CARD_W, decodeScanIndex, encodeScanIndex, hamming, hashCard, hashesAt, hashToHex, hexToHash,
  popcount32, rotate180, scryfallIdAt,
} from '@spelldex/shared/scan';

/** Deterministic test card: smooth gradients plus a few blocks, no randomness. */
export function patternCard(seed: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(CARD_W * CARD_H * 4);
  for (let y = 0; y < CARD_H; y++)
    for (let x = 0; x < CARD_W; x++) {
      const i = (y * CARD_W + x) * 4;
      const a = Math.sin((x * (seed % 7 + 1)) / 60 + seed) * 0.5 + 0.5;
      const b = Math.cos((y * (seed % 5 + 1)) / 45 - seed) * 0.5 + 0.5;
      const block = ((x >> 6) + (y >> 6) * seed) % 3 === 0 ? 60 : 0;
      px[i] = 200 * a + block;
      px[i + 1] = 180 * b;
      px[i + 2] = 120 * a * b + block;
      px[i + 3] = 255;
    }
  return px;
}

describe('phash', () => {
  it('is deterministic and has the documented sizes', () => {
    const h1 = hashCard(patternCard(3));
    const h2 = hashCard(patternCard(3));
    expect(h1.art.length).toBe(8);
    expect(h1.full.length).toBe(2);
    expect(hashToHex(h1.art)).toBe(hashToHex(h2.art));
  });

  // Golden values: if these change, every shipped scan-index.bin is invalid and must be rebuilt
  // (bump SCAN_INDEX_VERSION). Build and worker run this same code on the same 488x680 RGBA.
  it('matches the golden hashes', () => {
    const h = hashCard(patternCard(11));
    expect({ art: hashToHex(h.art), full: hashToHex(h.full) }).toMatchSnapshot();
  });

  it('separates different images and tolerates small changes', () => {
    const a = patternCard(1);
    const noisy = new Uint8ClampedArray(a);
    for (let i = 0; i < noisy.length; i += 4) noisy[i] = Math.min(255, noisy[i]! + ((i * 7919) % 9) - 4);
    expect(hamming(hashCard(a).art, hashCard(noisy).art)).toBeLessThan(12);
    expect(hamming(hashCard(a).art, hashCard(patternCard(2)).art)).toBeGreaterThan(60);
  });

  it('is invariant to a colour cast (gray-world white balance)', () => {
    const a = patternCard(4);
    const cast = new Uint8ClampedArray(a);
    for (let i = 0; i < cast.length; i += 4) { cast[i] = cast[i]! * 0.8; cast[i + 2] = Math.min(255, cast[i + 2]! * 1.15); }
    expect(hamming(hashCard(a).art, hashCard(cast).art)).toBeLessThan(16);
  });

  it('rotate180 twice is the identity', () => {
    const a = patternCard(5);
    expect(Buffer.from(rotate180(rotate180(a))).equals(Buffer.from(a))).toBe(true);
  });

  it('hex round trip and popcount', () => {
    const h = hashCard(patternCard(6)).art;
    expect(hexToHash(hashToHex(h))).toEqual(h);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0x80000001)).toBe(2);
  });
});

describe('scan-index codec', () => {
  it('round-trips entries, faces and groups', () => {
    const entries = [1, 2, 3].map((k) => ({
      scryfallId: `0000000${k}-aaaa-bbbb-cccc-0123456789ab`,
      hashes: hashCard(patternCard(k)),
      group: k === 3 ? 0 : k - 1,
      set: ['MOM', 'ONE', 'MOM'][k - 1]!,
      collectorNumber: String(k * 10),
      back: k === 2,
    }));
    const bin = encodeScanIndex(entries);
    expect(String.fromCharCode(...bin.slice(0, 4))).toBe('SPLX');
    const idx = decodeScanIndex(bin.slice().buffer);
    expect(idx.n).toBe(3);
    expect(scryfallIdAt(idx, 1)).toBe(entries[1]!.scryfallId);
    expect(idx.back).toEqual([false, true, false]);
    expect(Array.from(idx.group)).toEqual([0, 1, 0]);
    expect(idx.collectorNumber[2]).toBe('30');
    expect(hashesAt(idx, 2)).toEqual(entries[2]!.hashes);
  });

  it('rejects foreign files', () => {
    expect(() => decodeScanIndex(new Uint8Array(16))).toThrow(/magic/);
  });
});
