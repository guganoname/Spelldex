/**
 * Replays dumped misses (simulated photos of real Scryfall cards) through the
 * detector and Scanner.identify(), against an index of the shipped card images.
 *
 *   node --experimental-strip-types bench/real-misses.ts <dir with misses/ and cards/> [--photos N]
 *
 * With --photos, it instead takes N fresh simulated photos of the sample cards
 * (seed 5) and reports the overall rate, to check that nothing regressed.
 *
 * Per case: outline found, corner error of the chosen quad, distance to the
 * true card, outcome. The index holds only the sample cards, so margins are
 * optimistic; the distance to the true card is the number to watch.
 */
import { readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { decodeScanIndex, encodeScanIndex, hashCard } from '@spelldex/shared/scan';
import { detectCandidates, type Corners } from '../src/detect.ts';
import { Scanner } from '../src/scanner.ts';
import { searchIndex } from '../src/matcher.ts';
import { loadCvNode } from './cv-node.ts';

const dir = process.argv[2] ?? '/mnt/project-files/scanner';
const pi = process.argv.indexOf('--photos');
const NPHOTOS = pi > 0 ? +process.argv[pi + 1]! : 0;
const cv = await loadCvNode();

async function rgba(path: string, w?: number, h?: number) {
  let img = sharp(path).ensureAlpha(1);
  if (w && h) img = img.resize(w, h, { fit: 'fill' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
}

const cardFiles = readdirSync(`${dir}/cards`).filter((f) => f.endsWith('.jpg')).sort();
const keys = cardFiles.map((f) => f.replace(/\.jpg$/, ''));
const entries = [];
for (const [i, f] of cardFiles.entries()) {
  const img = await rgba(`${dir}/cards/${f}`, 488, 680);
  entries.push({ scryfallId: keys[i]!.slice(0, 36), hashes: hashCard(img.data), group: i, set: 'X', collectorNumber: String(i), back: keys[i]!.endsWith('-back') });
}
const index = decodeScanIndex(encodeScanIndex(entries));
const scanner = new Scanner(cv, index);

type Pt = [number, number];
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

if (NPHOTOS) {
  const { photograph, rng } = await import('./synth.ts');
  const r = rng(5);
  let ok = 0, bad = 0, outl = 0;
  const times: number[] = [];
  const cardImgs = [];
  for (const f of cardFiles) cardImgs.push((await rgba(`${dir}/cards/${f}`, 488, 680)).data);
  for (let k = 0; k < NPHOTOS; k++) {
    const t = r.int(0, cardFiles.length - 1);
    const d0 = r();
    const photo = await photograph(cv, cardImgs[t]!, r, {
      difficulty: d0 < 0.4 ? 'easy' : d0 < 0.8 ? 'medium' : 'hard', upsideDown: r() < 0.2, sleeve: r() < 0.15, glare: r() < 0.25,
    });
    const t0 = performance.now();
    const d = await scanner.identify(photo);
    times.push(performance.now() - t0);
    if (d.quad && cornerError(d.quad, photo.corners as Pt[]) < 0.01) outl++;
    if (d.kind === 'match') d.match.scryfallId === keys[t]!.slice(0, 36) ? ok++ : bad++;
  }
  const s = [...times].sort((a, b) => a - b);
  console.log(`${NPHOTOS} photos: correct ${(100 * ok / NPHOTOS).toFixed(1)} %, wrong ${(100 * bad / NPHOTOS).toFixed(1)} %, quad within 1 % ${(100 * outl / NPHOTOS).toFixed(1)} %, median ${s[s.length >> 1]!.toFixed(0)} ms, p95 ${s[Math.floor(s.length * 0.95)]!.toFixed(0)} ms`);
  process.exit(0);
}

const cases = readdirSync(`${dir}/misses`).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort((a, b) => +a - +b);
let outline = 0, outlineBefore = 0, good = 0, correct = 0, wrong = 0;
const ms: number[] = [];
for (const k of cases) {
  const meta = JSON.parse(readFileSync(`${dir}/misses/${k}.json`, 'utf8'));
  const key = meta.scryfallId + (meta.back ? '-back' : '');
  const ti = keys.indexOf(key);
  const photo = await rgba(`${dir}/misses/${k}-photo.png`);
  const m = cv.matFromImageData(photo);
  const cands = detectCandidates(cv, m, 3);
  m.delete();
  if (cands.length) outline++;
  if (meta.outlineFound) outlineBefore++;
  const t0 = performance.now();
  const d = await scanner.identify(photo);
  ms.push(performance.now() - t0);
  const err = d.quad ? cornerError(d.quad, meta.corners) : NaN;
  if (err < 0.01) good++;
  // Distance of the true card through the chosen quad.
  let dTrue = NaN;
  if (d.quad) {
    const { warpCard } = await import('../src/detect.ts');
    const mm = cv.matFromImageData(photo);
    const nn = searchIndex(index, Scanner.queriesFor(warpCard(cv, mm, d.quad)), index.n);
    mm.delete();
    dTrue = nn.find((n) => n.i === ti)?.score ?? NaN;
  }
  const ok = d.kind === 'match' && d.match.scryfallId === meta.scryfallId && ti >= 0;
  if (ok) correct++;
  else if (d.kind === 'match') wrong++;
  if (process.env.VERBOSE || !ok)
    console.log(k.padStart(4), meta.outlineFound ? 'had ' : 'none', cands.length ? 'found' : '  -  ', `err ${err.toFixed(3)}`, `dTrue ${dTrue}`, d.kind, `[${meta.difficulty}${meta.sleeve ? ' sleeve' : ''}${meta.glare ? ' glare' : ''}]`);
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
console.log(`\n${cases.length} former misses: outline ${outlineBefore} -> ${outline}, quad within 1 % ${good}, now identified ${correct}, wrong ${wrong}, median ${median(ms).toFixed(0)} ms`);
