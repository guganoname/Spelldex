/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Synthetic test data for the scanner, used until real card photos exist.
 *
 *  - makeCard(): a 488x680 "card" with a shared frame template (border, title,
 *    art box, type line, text box, collector line), so full-card hashes cluster
 *    the way real cards do, and procedurally generated artwork.
 *  - photograph(): puts a card into a 1280x720 camera frame with background,
 *    rotation, perspective, lighting, colour cast, glare, sleeve sheen, blur,
 *    noise and JPEG compression.
 *
 * This measures the pipeline's robustness, NOT real-world accuracy: real art is
 * more varied, real photos have different failure modes.
 */
import sharp from 'sharp';
import { CARD_H, CARD_W } from '@spelldex/shared/scan';

export type CV = any;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(f, {
    range: (lo: number, hi: number) => lo + f() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + f() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(f() * xs.length)]!,
    normal: () => Math.sqrt(-2 * Math.log(f() + 1e-12)) * Math.cos(2 * Math.PI * f()),
  });
}
export type Rng = ReturnType<typeof rng>;

const FRAME_COLORS: [number, number, number][] = [
  [220, 210, 170], // white
  [70, 110, 190], // blue
  [60, 50, 60], // black
  [190, 70, 50], // red
  [70, 140, 80], // green
  [200, 170, 90], // gold
  [150, 150, 160], // artifact
];

/** Gaussian noise on the RGB channels of an 8-bit RGBA Mat, in place. */
function addNoise(m: any, sigma: number, r: Rng): void {
  const d: Uint8Array = m.data;
  for (let i = 0; i < d.length; i += 4)
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, d[i + c]! + r.normal() * sigma));
}

const scalar = (cv: CV, c: number[]) => new cv.Scalar(c[0], c[1], c[2], 255);

/** Procedural artwork: smooth colour field + shapes + texture. */
export function makeArt(cv: CV, r: Rng, w: number, h: number): any {
  const gw = r.int(3, 7), gh = r.int(3, 6);
  const grid = new cv.Mat(gh, gw, cv.CV_8UC4);
  const base = [r.int(0, 255), r.int(0, 255), r.int(0, 255)];
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const p = grid.ucharPtr(y, x);
      for (let c = 0; c < 3; c++) p[c] = Math.max(0, Math.min(255, base[c]! + r.int(-110, 110)));
      p[3] = 255;
    }
  const art = new cv.Mat();
  cv.resize(grid, art, new cv.Size(w, h), 0, 0, cv.INTER_CUBIC);
  grid.delete();
  const shapes = r.int(3, 14);
  for (let i = 0; i < shapes; i++) {
    const col = scalar(cv, [r.int(0, 255), r.int(0, 255), r.int(0, 255)]);
    const kind = r.int(0, 3);
    if (kind === 0) cv.circle(art, new cv.Point(r.int(0, w), r.int(0, h)), r.int(8, w / 3), col, -1, cv.LINE_AA);
    else if (kind === 1) cv.rectangle(art, new cv.Point(r.int(0, w), r.int(0, h)), new cv.Point(r.int(0, w), r.int(0, h)), col, -1);
    else if (kind === 2) cv.line(art, new cv.Point(r.int(0, w), r.int(0, h)), new cv.Point(r.int(0, w), r.int(0, h)), col, r.int(2, 18), cv.LINE_AA);
    else {
      const n = r.int(3, 6);
      const pts: number[] = [];
      const cx = r.int(0, w), cy = r.int(0, h), rad = r.int(15, w / 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r.range(-0.3, 0.3);
        pts.push(Math.round(cx + Math.cos(a) * rad * r.range(0.4, 1)), Math.round(cy + Math.sin(a) * rad * r.range(0.4, 1)));
      }
      const poly = cv.matFromArray(n, 1, cv.CV_32SC2, pts);
      const mv = new cv.MatVector();
      mv.push_back(poly);
      cv.fillPoly(art, mv, col, cv.LINE_AA);
      mv.delete(); poly.delete();
    }
  }
  // Soft painterly blur on part of the shapes, fine noise texture on top.
  if (r() < 0.6) cv.GaussianBlur(art, art, new cv.Size(0, 0), r.range(1, 6));
  addNoise(art, 12, r);
  return art;
}

export interface CardSpec {
  artSeed: number;
  frameSeed: number;
  set: string;
  number: string;
  /** 'modern' black border, 'old' different art box & white border. */
  style: 'modern' | 'old';
}

const WORDS = ['Dragon', 'Shivan', 'Llanowar', 'Elf', 'Counter', 'Spell', 'Bolt', 'Serra', 'Angel', 'Sol', 'Ring', 'Wrath', 'Island', 'Goblin', 'Guide', 'Thought', 'Seize', 'Path', 'Exile'];

/** Render a full 488x680 RGBA card. */
export function makeCard(cv: CV, spec: CardSpec): Uint8ClampedArray {
  const r = rng(spec.frameSeed);
  const W = CARD_W, H = CARD_H;
  const card = new cv.Mat(H, W, cv.CV_8UC4, spec.style === 'old' ? new cv.Scalar(240, 238, 230, 255) : new cv.Scalar(15, 15, 15, 255));
  const fc = r.pick(FRAME_COLORS);
  const m = spec.style === 'old' ? 34 : 22;
  cv.rectangle(card, new cv.Point(m, m), new cv.Point(W - m, H - m), scalar(cv, fc), -1);
  const light = fc.map((c) => Math.min(255, c + 60));
  // Title bar
  cv.rectangle(card, new cv.Point(m + 10, m + 10), new cv.Point(W - m - 10, m + 46), scalar(cv, light), -1);
  const name = `${r.pick(WORDS)} ${r.pick(WORDS)}`;
  cv.putText(card, name, new cv.Point(m + 18, m + 38), cv.FONT_HERSHEY_SIMPLEX, 0.8, new cv.Scalar(10, 10, 10, 255), 2, cv.LINE_AA);
  // Art: generated from artSeed only, so reprints share it exactly.
  const ax = spec.style === 'old' ? 58 : 44, ay = spec.style === 'old' ? 96 : 80;
  const aw = W - 2 * ax, ah = spec.style === 'old' ? 280 : 300;
  const art = makeArt(cv, rng(spec.artSeed), aw, ah);
  const roi = card.roi(new cv.Rect(ax, ay, aw, ah));
  art.copyTo(roi);
  roi.delete();
  art.delete();
  // Type line
  const ty = ay + ah + 8;
  cv.rectangle(card, new cv.Point(m + 10, ty), new cv.Point(W - m - 10, ty + 34), scalar(cv, light), -1);
  cv.putText(card, `Creature - ${r.pick(WORDS)}`, new cv.Point(m + 18, ty + 25), cv.FONT_HERSHEY_SIMPLEX, 0.65, new cv.Scalar(10, 10, 10, 255), 1, cv.LINE_AA);
  // Text box
  const by = ty + 42;
  cv.rectangle(card, new cv.Point(m + 14, by), new cv.Point(W - m - 14, H - m - 40), new cv.Scalar(235, 228, 210, 255), -1);
  for (let l = 0; l < r.int(2, 6); l++)
    cv.putText(card, Array.from({ length: r.int(3, 6) }, () => r.pick(WORDS).toLowerCase()).join(' '),
      new cv.Point(m + 24, by + 28 + l * 26), cv.FONT_HERSHEY_SIMPLEX, 0.55, new cv.Scalar(20, 20, 20, 255), 1, cv.LINE_AA);
  // Collector line, bottom left, in the border (like the 2015+ frame).
  const ink = spec.style === 'old' ? new cv.Scalar(20, 20, 20, 255) : new cv.Scalar(235, 235, 235, 255);
  cv.putText(card, `${spec.number} R`, new cv.Point(22, H - 22), cv.FONT_HERSHEY_SIMPLEX, 0.38, ink, 1, cv.LINE_AA);
  cv.putText(card, `${spec.set} . EN`, new cv.Point(22, H - 8), cv.FONT_HERSHEY_SIMPLEX, 0.38, ink, 1, cv.LINE_AA);
  const out = new Uint8ClampedArray(card.data);
  card.delete();
  return out;
}

export interface PhotoParams {
  difficulty: 'easy' | 'medium' | 'hard';
  upsideDown: boolean;
  sleeve: boolean;
  glare: boolean;
}

function background(cv: CV, r: Rng, w: number, h: number): any {
  const kind = r.int(0, 2);
  const g = new cv.Mat(r.int(2, 5), r.int(2, 6), cv.CV_8UC4);
  const base = r() < 0.5 ? [r.int(20, 90), r.int(20, 90), r.int(20, 90)] : [r.int(140, 230), r.int(130, 220), r.int(110, 210)];
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const p = g.ucharPtr(y, x);
      for (let c = 0; c < 3; c++) p[c] = Math.max(0, Math.min(255, base[c]! + r.int(-30, 30)));
      p[3] = 255;
    }
  const bg = new cv.Mat();
  cv.resize(g, bg, new cv.Size(w, h), 0, 0, cv.INTER_CUBIC);
  g.delete();
  if (kind === 1) {
    // Wood-like stripes
    for (let i = 0; i < 60; i++) {
      const y = r.int(0, h);
      const d = r.int(-25, 25);
      cv.line(bg, new cv.Point(0, y), new cv.Point(w, y + r.int(-40, 40)), new cv.Scalar(base[0]! + d, base[1]! + d, base[2]! + d, 255), r.int(1, 6), cv.LINE_AA);
    }
    cv.GaussianBlur(bg, bg, new cv.Size(0, 0), 1.5);
  } else if (kind === 2) {
    // Clutter: other objects / cards partially in view
    for (let i = 0; i < r.int(1, 4); i++) {
      cv.rectangle(bg, new cv.Point(r.int(-100, w), r.int(-100, h)), new cv.Point(r.int(0, w + 100), r.int(0, h + 100)),
        new cv.Scalar(r.int(0, 255), r.int(0, 255), r.int(0, 255), 255), -1);
    }
  }
  addNoise(bg, 8, r);
  return bg;
}

/** Simulate one camera frame (1280x720 RGBA) of a card. Returns the frame and true corners. */
export async function photograph(cv: CV, cardRgba: Uint8ClampedArray, r: Rng, p: PhotoParams, W = 1280, H = 720) {
  const lvl = { easy: 0, medium: 1, hard: 2 }[p.difficulty];
  const frame = background(cv, r, W, H);

  // Card placement.
  const ch = H * r.range(0.55 - 0.05 * lvl, 0.9);
  const cw = (ch * 63) / 88;
  const cx = W / 2 + r.range(-1, 1) * (W / 2 - cw / 2) * 0.5;
  const cy = H / 2 + r.range(-1, 1) * Math.max(0, H / 2 - ch / 2) * 0.6;
  const ang = (r.range(-1, 1) * [6, 18, 30][lvl]! + (p.upsideDown ? 180 : 0)) * (Math.PI / 180);
  const tilt = [0.02, 0.06, 0.11][lvl]!;
  const corners = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]].map(([x, y]) => {
    const jx = x! + r.normal() * tilt * cw, jy = y! + r.normal() * tilt * ch;
    return [cx + jx * Math.cos(ang) - jy * Math.sin(ang), cy + jx * Math.sin(ang) + jy * Math.cos(ang)];
  });

  // Users aim at the card: keep it (almost) inside the frame by shrinking around its centre.
  const xs = corners.map((c) => c[0]!), ys = corners.map((c) => c[1]!);
  const over = Math.max((Math.max(...xs) - Math.min(...xs)) / (W * 0.98), (Math.max(...ys) - Math.min(...ys)) / (H * 0.98), 1);
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
  for (const c of corners) { c[0] = mx + (c[0]! - mx) / over; c[1] = my + (c[1]! - my) / over; }
  const xs2 = corners.map((c) => c[0]!), ys2 = corners.map((c) => c[1]!);
  const sx = Math.min(0, W - 2 - Math.max(...xs2)) + Math.max(0, 2 - Math.min(...xs2));
  const sy = Math.min(0, H - 2 - Math.max(...ys2)) + Math.max(0, 2 - Math.min(...ys2));
  for (const c of corners) { c[0]! += sx; c[1]! += sy; }

  const card = cv.matFromImageData({ data: cardRgba, width: CARD_W, height: CARD_H });
  // Rounded corners via alpha mask.
  const mask = new cv.Mat(CARD_H, CARD_W, cv.CV_8UC1, new cv.Scalar(0));
  const rad = 22;
  cv.rectangle(mask, new cv.Point(rad, 0), new cv.Point(CARD_W - rad, CARD_H), new cv.Scalar(255), -1);
  cv.rectangle(mask, new cv.Point(0, rad), new cv.Point(CARD_W, CARD_H - rad), new cv.Scalar(255), -1);
  for (const [x, y] of [[rad, rad], [CARD_W - rad, rad], [CARD_W - rad, CARD_H - rad], [rad, CARD_H - rad]])
    cv.circle(mask, new cv.Point(x, y), rad, new cv.Scalar(255), -1, cv.LINE_AA);

  // Sleeve: slightly washed out card with a transparent margin.
  if (p.sleeve) {
    const gray = new cv.Mat(CARD_H, CARD_W, cv.CV_8UC4, new cv.Scalar(200, 200, 205, 255));
    cv.addWeighted(card, 0.88, gray, 0.12, 0, card);
    gray.delete();
  }

  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const M = cv.getPerspectiveTransform(src, dst);
  const warped = new cv.Mat();
  const warpedMask = new cv.Mat();
  cv.warpPerspective(card, warped, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
  cv.warpPerspective(mask, warpedMask, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0));
  // Soft shadow under the card.
  if (r() < 0.7) {
    const sh = new cv.Mat();
    cv.GaussianBlur(warpedMask, sh, new cv.Size(0, 0), 8);
    const fd = frame.data, sd = sh.data;
    const ox = r.int(3, 12), oy = r.int(3, 12);
    for (let y = H - 1; y >= oy; y--)
      for (let x = W - 1; x >= ox; x--) {
        const a = sd[(y - oy) * W + (x - ox)]! / 255 * 0.45;
        if (a > 0) { const i = (y * W + x) * 4; fd[i] *= 1 - a; fd[i + 1] *= 1 - a; fd[i + 2] *= 1 - a; }
      }
    sh.delete();
  }
  warped.copyTo(frame, warpedMask);

  // Lighting: directional gradient, gamma, colour cast.
  const fd = frame.data;
  const gx = r.range(-1, 1) * [0.15, 0.3, 0.5][lvl]!, gy = r.range(-1, 1) * [0.15, 0.3, 0.5][lvl]!;
  const gain = r.range([0.9, 0.7, 0.45][lvl]!, [1.1, 1.2, 1.3][lvl]!);
  const cast = [0, 1, 2].map(() => 1 + r.range(-1, 1) * [0.04, 0.1, 0.18][lvl]!);
  const gamma = r.range(1 - 0.15 * lvl, 1 + 0.15 * lvl);
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, gamma);
  // Glare: bright blob (lamp reflection), stronger on sleeves.
  const glare = p.glare || p.sleeve ? { x: r.range(0.2, 0.8) * W, y: r.range(0.2, 0.8) * H, s: r.range(40, 160), a: r.range(0.3, p.sleeve ? 0.9 : 0.6) } : null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const l = gain * (1 + gx * (x / W - 0.5) * 2 + gy * (y / H - 0.5) * 2);
      let gl = 0;
      if (glare) { const d2 = (x - glare.x) ** 2 + (y - glare.y) ** 2; gl = glare.a * 255 * Math.exp(-d2 / (2 * glare.s ** 2)); }
      for (let c = 0; c < 3; c++) fd[i + c] = Math.min(255, lut[fd[i + c]!]! * l * cast[c]! + gl);
    }

  // Optics: defocus or motion blur, sensor noise.
  const blur = r.range(0, [0.8, 1.6, 2.8][lvl]!);
  if (blur > 0.3) cv.GaussianBlur(frame, frame, new cv.Size(0, 0), blur);
  if (lvl === 2 && r() < 0.4) {
    const k = r.int(5, 11);
    const kernel = cv.Mat.zeros(k, k, cv.CV_32F);
    for (let i = 0; i < k; i++) kernel.floatPtr(Math.floor(k / 2), i)[0] = 1 / k;
    cv.filter2D(frame, frame, -1, kernel);
    kernel.delete();
  }
  addNoise(frame, [2, 5, 9][lvl]!, r);
  for (let i = 3; i < fd.length; i += 4) fd[i] = 255;

  // JPEG round trip like a real camera pipeline.
  const rgba = new Uint8ClampedArray(frame.data);
  const jpg = await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: H, channels: 4 } })
    .jpeg({ quality: Math.round(r.range([88, 78, 65][lvl]!, 92)) }).toBuffer();
  const back = await sharp(jpg).ensureAlpha(1).raw().toBuffer();

  [card, mask, src, dst, M, warped, warpedMask, frame].forEach((m) => m.delete());
  return { data: new Uint8ClampedArray(back.buffer, back.byteOffset, back.byteLength), width: W, height: H, corners };
}
