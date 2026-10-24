/**
 * Outline-detection stress test: scenes where the card's outer edge is hard to
 * see. The card touches or overlaps objects of similar brightness (other cards,
 * a phone, a deck box), lies on a dark table with a black border, or sits away
 * from the centre so the guide-box fallback cannot help.
 *
 *   node --experimental-strip-types bench/detect-bench.ts [--photos 300] [--cards 200] [--seed 11] [--scene all|touch|dark|offcenter] [--dump dir]
 *
 * Reports how often the best outline (and any of the top 3) lands on the true
 * corners, and the end-to-end identification rate with the full Scanner.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { CARD_H, CARD_W, decodeScanIndex, encodeScanIndex, hashCard } from '@spelldex/shared/scan';
import { detectCandidates, type Corners } from '../src/detect.ts';
import { Scanner } from '../src/scanner.ts';
import { loadCvNode } from './cv-node.ts';
import { makeCard, rng, type Rng } from './synth.ts';

const argv = process.argv.slice(2);
const arg = (k: string, d: string | number) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1]! : String(d);
};
const NPHOTOS = +arg('photos', 300);
const NCARDS = +arg('cards', 200);
const SEED = +arg('seed', 11);
const SCENE = arg('scene', 'all');
const DUMP = argv.includes('--dump') ? arg('dump', 'bench/results/detect') : null;

const cv = await loadCvNode();
type Scene = 'touch' | 'dark' | 'offcenter';
type Pt = [number, number];

const specs = Array.from({ length: NCARDS }, (_, i) => ({
  artSeed: 10_000 + i, frameSeed: 20_000 + i, set: 'DET', number: String(i + 1), style: (i % 6 === 0 ? 'old' : 'modern') as 'old' | 'modern',
}));
const cards = specs.map((s) => makeCard(cv, s));
const ids = specs.map((_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
const index = decodeScanIndex(encodeScanIndex(cards.map((c, i) => ({
  scryfallId: ids[i]!, hashes: hashCard(c), group: i, set: 'DET', collectorNumber: String(i + 1),
}))));

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const gray = (cv: any, v: number, r: Rng, spread = 12) => new cv.Scalar(clamp(v + r.int(-spread, spread)), clamp(v + r.int(-spread, spread)), clamp(v + r.int(-spread, spread)), 255);

/** Fill a rotated rectangle (centre, size, angle) into an RGBA Mat. */
function fillRotRect(m: any, c: Pt, w: number, h: number, ang: number, col: any) {
  const co = Math.cos(ang), si = Math.sin(ang);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].flatMap(([x, y]) => [
    Math.round(c[0] + x! * co - y! * si), Math.round(c[1] + x! * si + y! * co)]);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, pts);
  const mv = new cv.MatVector();
  mv.push_back(poly);
  cv.fillPoly(m, mv, col, cv.LINE_AA);
  mv.delete(); poly.delete();
}

async function scene(kind: Scene, card: Uint8ClampedArray, oldStyle: boolean, r: Rng, W = 1280, H = 720) {
  // Table: dark for black borders (the hard case), mid otherwise.
  const tableV = kind === 'dark' ? r.int(8, 45) : r.int(30, 200);
  const frame = new cv.Mat(H, W, cv.CV_8UC4, gray(cv, tableV, r, 8));
  // Low-frequency texture.
  const g = new cv.Mat(r.int(2, 5), r.int(2, 6), cv.CV_8UC4);
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) { const p = g.ucharPtr(y, x); const d = r.int(-12, 12); for (let k = 0; k < 3; k++) p[k] = clamp(tableV + d); p[3] = 255; }
  cv.resize(g, frame, new cv.Size(W, H), 0, 0, cv.INTER_CUBIC);
  g.delete();

  // Card pose.
  const lvl = r.int(0, 2);
  const ch = H * (kind === 'offcenter' ? r.range(0.42, 0.6) : r.range(0.5, 0.85));
  const cw = (ch * 63) / 88;
  const ang = (r.range(-1, 1) * 25 + (r() < 0.2 ? 180 : 0)) * (Math.PI / 180);
  const halfDiag = Math.hypot(cw, ch) / 2;
  const cx = kind === 'offcenter'
    ? (r() < 0.5 ? r.range(halfDiag * 0.75, W * 0.3) : r.range(W * 0.7, W - halfDiag * 0.75))
    : W / 2 + r.range(-1, 1) * W * 0.12;
  const cy = kind === 'offcenter' ? r.range(halfDiag * 0.7, H - halfDiag * 0.7) : H / 2 + r.range(-1, 1) * H * 0.06;
  const tilt = [0.02, 0.05, 0.08][lvl]!;
  const corners = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]].map(([x, y]) => {
    const jx = x! + r.normal() * tilt * cw, jy = y! + r.normal() * tilt * ch;
    return [cx + jx * Math.cos(ang) - jy * Math.sin(ang), cy + jx * Math.sin(ang) + jy * Math.cos(ang)] as Pt;
  });

  // Objects under/next to the card, brightness close to the card border.
  const borderV = oldStyle ? 235 : 18;
  const nObj = kind === 'touch' ? r.int(1, 3) : kind === 'dark' ? r.int(0, 2) : r.int(0, 2);
  for (let i = 0; i < nObj; i++) {
    // Pick a card side and put the object against it, overlapping slightly.
    const s = r.int(0, 3);
    const a = corners[s]!, b = corners[(s + 1) % 4]!;
    const t = r.range(0.1, 0.9);
    const mx = a[0] + (b[0] - a[0]) * t, my = a[1] + (b[1] - a[1]) * t;
    const ox = mx - cx, oy = my - cy, on = Math.hypot(ox, oy);
    const ow = r.range(0.4, 1.2) * cw, oh = r.range(0.4, 1.4) * ch;
    const push = r.range(0.25, 0.5) * Math.min(ow, oh);
    const oc: Pt = [mx + (ox / on) * push, my + (oy / on) * push];
    const v = r() < 0.75 ? borderV + r.int(-15, 25) : r.int(20, 230);
    fillRotRect(frame, oc, ow, oh, ang + r.range(-0.6, 0.6), gray(cv, v, r, 10));
  }

  const src = cv.matFromImageData({ data: card, width: CARD_W, height: CARD_H });
  const mask = new cv.Mat(CARD_H, CARD_W, cv.CV_8UC1, new cv.Scalar(0));
  const rad = 22;
  cv.rectangle(mask, new cv.Point(rad, 0), new cv.Point(CARD_W - rad, CARD_H), new cv.Scalar(255), -1);
  cv.rectangle(mask, new cv.Point(0, rad), new cv.Point(CARD_W, CARD_H - rad), new cv.Scalar(255), -1);
  for (const [x, y] of [[rad, rad], [CARD_W - rad, rad], [CARD_W - rad, CARD_H - rad], [rad, CARD_H - rad]])
    cv.circle(mask, new cv.Point(x, y), rad, new cv.Scalar(255), -1, cv.LINE_AA);
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_W, 0, CARD_W, CARD_H, 0, CARD_H]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const M = cv.getPerspectiveTransform(from, to);
  const warped = new cv.Mat(), wmask = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
  cv.warpPerspective(mask, wmask, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0));
  warped.copyTo(frame, wmask);

  // Light gradient, gain, blur, noise, JPEG.
  const fd: Uint8Array = frame.data;
  const gx = r.range(-0.3, 0.3), gy = r.range(-0.3, 0.3), gain = r.range(0.7, 1.15);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, l = gain * (1 + gx * (x / W - 0.5) * 2 + gy * (y / H - 0.5) * 2);
      for (let c = 0; c < 3; c++) fd[i + c] = clamp(fd[i + c]! * l + r.normal() * 3);
      fd[i + 3] = 255;
    }
  const blur = r.range(0, 1.6);
  if (blur > 0.3) cv.GaussianBlur(frame, frame, new cv.Size(0, 0), blur);
  const jpg = await sharp(Buffer.from(frame.data), { raw: { width: W, height: H, channels: 4 } }).jpeg({ quality: r.int(70, 92) }).toBuffer();
  const back = await sharp(jpg).ensureAlpha(1).raw().toBuffer();
  [frame, src, mask, from, to, M, warped, wmask].forEach((m) => m.delete());
  return { data: new Uint8ClampedArray(back.buffer, back.byteOffset, back.byteLength), width: W, height: H, corners, jpg };
}

/** Mean corner error relative to the diagonal, best over the 4 cyclic orderings (orientation is ambiguous). */
function cornerError(q: Corners, truth: Pt[]): number {
  const diag = Math.hypot(truth[0]![0] - truth[2]![0], truth[0]![1] - truth[2]![1]);
  let best = Infinity;
  for (let s = 0; s < 4; s++) {
    let e = 0;
    for (let i = 0; i < 4; i++) e += Math.hypot(q[(i + s) % 4]![0] - truth[i]![0], q[(i + s) % 4]![1] - truth[i]![1]);
    best = Math.min(best, e / 4 / diag);
  }
  return best;
}

const scenes: Scene[] = SCENE === 'all' ? ['touch', 'dark', 'offcenter'] : [SCENE as Scene];
const scanner = new Scanner(cv, index);
const r = rng(SEED);
const stats = new Map<Scene, { n: number; top1: number; top3: number; none: number; correct: number; wrong: number; ms: number[] }>();
if (DUMP) mkdirSync(DUMP, { recursive: true });

for (let k = 0; k < NPHOTOS; k++) {
  const kind = scenes[k % scenes.length]!;
  // Dark tables are only hard for black borders.
  let t = r.int(0, NCARDS - 1);
  if (kind === 'dark') while (specs[t]!.style === 'old') t = r.int(0, NCARDS - 1);
  const photo = await scene(kind, cards[t]!, specs[t]!.style === 'old', r);
  const st = stats.get(kind) ?? { n: 0, top1: 0, top3: 0, none: 0, correct: 0, wrong: 0, ms: [] };
  stats.set(kind, st);
  st.n++;
  const m = cv.matFromImageData(photo);
  const cands = detectCandidates(cv, m, 3);
  m.delete();
  const errs = cands.map((q) => cornerError(q, photo.corners));
  if (!cands.length) st.none++;
  if (errs[0] !== undefined && errs[0] < 0.02) st.top1++;
  if (errs.some((e) => e < 0.02)) st.top3++;
  const t0 = performance.now();
  const d = await scanner.identify(photo);
  st.ms.push(performance.now() - t0);
  if (d.kind === 'match') d.match.scryfallId === ids[t] ? st.correct++ : st.wrong++;
  if (process.env.DEBUG)
    console.error(k, kind, 'cands', errs.map((e) => e.toFixed(3)).join(' '), 'final', d.quad ? cornerError(d.quad, photo.corners).toFixed(3) : '-',
      'nn', d.nn?.slice(0, 2).map((n) => `${n.i === t ? '*' : ''}${n.score}`).join(' '));
  if (DUMP && !(d.kind === 'match' && d.match.scryfallId === ids[t]))
    await sharp(photo.jpg).toFile(`${DUMP}/${k}-${kind}${cands.length ? '' : '-none'}.jpg`);
}

const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)} %`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const rows = [...stats].map(([kind, s]) => ({
  scene: kind, n: s.n, outlineTop1: pct(s.top1, s.n), outlineTop3: pct(s.top3, s.n), noOutline: pct(s.none, s.n),
  identified: pct(s.correct, s.n), wrong: pct(s.wrong, s.n), msMedian: +median(s.ms).toFixed(0),
}));
console.table(rows);
