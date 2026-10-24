/**
 * Synthetic scanner benchmark.
 *
 *   tsx bench/run.ts [--cards 3000] [--photos 1200] [--distractors 97000] [--ocr 1] [--seed 7] [--out bench/results]
 *
 * Builds an index from synthetic cards (same hashing path as the real build:
 * JPEG -> sharp -> hashCard), pads it with random hashes to real-world size,
 * then runs Scanner.identify() on simulated camera frames and reports
 * per-frame accuracy and timing by difficulty.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { loadCvNode } from './cv-node.ts';
import { makeCard, photograph, rng, type CardSpec, type PhotoParams } from './synth.ts';
import { CARD_H, CARD_W, hashCard } from '@spelldex/shared/scan';
import { decodeScanIndex, encodeScanIndex, scryfallIdAt, type ScanIndexEntry } from '@spelldex/shared/scan';
import { loadCardRgba } from '../../data-build/src/scan-index/index.ts';
import { Scanner } from '../src/scanner.ts';
import { searchIndex } from '../src/matcher.ts';
import type { OcrFn } from '../src/ocr.ts';

const argv = process.argv.slice(2);
const arg = (k: string, d: number | string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1]! : String(d);
};
const NCARDS = Number(arg('cards', 3000));
const NPHOTOS = Number(arg('photos', 1200));
const NDISTRACT = Number(arg('distractors', 97000));
const USE_OCR = arg('ocr', 1) === '1';
const SEED = Number(arg('seed', 7));
const OUT = arg('out', 'bench/results');

const cv = await loadCvNode();
const r = rng(SEED);
const SETS = ['MOM', 'ONE', 'DMU', 'BRO', 'WOE', 'LCI', 'MKM', 'OTJ', 'BLB', 'DSK', 'FDN', 'DFT', 'TDM', 'M21', 'KHM'];

const uuid = (n: number) => {
  const h = (n >>> 0).toString(16).padStart(8, '0') + rng(n * 31 + 1)().toString(16).slice(2, 10).padEnd(8, '0');
  const s = (h + h.split('').reverse().join('')).slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

// ---- 1. synthetic catalogue ------------------------------------------------
interface Print { id: string; spec: CardSpec; group: number; kind: 'single' | 'reprint' | 'twin' }
const prints: Print[] = [];
let groupNo = 0;
for (let i = 0; i < NCARDS; i++) {
  const g = groupNo++;
  const base: CardSpec = { artSeed: 1000 + i, frameSeed: 50000 + i, set: r.pick(SETS), number: String(r.int(1, 399)).padStart(4, '0'), style: r() < 0.15 ? 'old' : 'modern' };
  const roll = r();
  prints.push({ id: uuid(prints.length + 1), spec: base, group: g, kind: roll < 0.12 ? 'reprint' : roll < 0.15 ? 'twin' : 'single' });
  if (roll < 0.12) {
    // Reprint: same art, new frame colour/style, other set.
    prints.push({ id: uuid(prints.length + 1), group: g, kind: 'reprint',
      spec: { ...base, frameSeed: 90000 + i, set: r.pick(SETS), number: String(r.int(1, 399)).padStart(4, '0'), style: r() < 0.5 ? 'old' : 'modern' } });
  } else if (roll < 0.15) {
    // Twin: pixel-identical except the collector line. Only OCR can tell.
    let set = r.pick(SETS);
    while (set === base.set) set = r.pick(SETS);
    prints.push({ id: uuid(prints.length + 1), group: g, kind: 'twin', spec: { ...base, set, number: String(r.int(1, 399)).padStart(4, '0') } });
  }
}

console.error(`rendering + hashing ${prints.length} synthetic prints ...`);
const t0 = performance.now();
const cardCache = new Map<string, Uint8ClampedArray>();
const entries: ScanIndexEntry[] = [];
for (const p of prints) {
  const rgba = makeCard(cv, p.spec);
  cardCache.set(p.id, rgba);
  // Same path as the real build: a JPEG from the CDN, decoded by sharp.
  const jpg = await sharp(Buffer.from(rgba.buffer), { raw: { width: CARD_W, height: CARD_H, channels: 4 } }).jpeg({ quality: 85 }).toBuffer();
  entries.push({ scryfallId: p.id, hashes: hashCard(await loadCardRgba(jpg)), group: p.group, set: p.spec.set, collectorNumber: p.spec.number });
}
const tHash = (performance.now() - t0) / prints.length;
const rr = rng(SEED + 99);
for (let i = 0; i < NDISTRACT; i++) {
  const u = () => (rr() * 2 ** 32) >>> 0;
  entries.push({ scryfallId: uuid(10_000_000 + i), hashes: { art: Uint32Array.from({ length: 8 }, u), full: Uint32Array.from({ length: 2 }, u) }, group: groupNo++, set: 'XXX', collectorNumber: String(i) });
}
const bin = encodeScanIndex(entries);
const index = decodeScanIndex(bin);
console.error(`index: ${index.n} entries, ${(bin.length / 1e6).toFixed(2)} MB, hashing ${tHash.toFixed(1)} ms/card`);

// ---- 2. OCR (Tesseract.js, bundled English model) -------------------------
let ocr: OcrFn | undefined;
let ocrWorker: { terminate(): Promise<unknown> } | undefined;
if (USE_OCR) {
  const { createWorker, PSM } = await import('tesseract.js');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace('package.json', '4.0.0_best_int');
  const w = await createWorker('eng', 1, { langPath, gzip: true, cacheMethod: 'none' });
  await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.- ', tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  ocrWorker = w;
  ocr = async (img) => {
    const png = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
      .grayscale().normalize().png().toBuffer();
    return (await w.recognize(png)).data.text;
  };
}

// ---- 3. photos -------------------------------------------------------------
const scanner = new Scanner(cv, index, {}, ocr);
type Outcome = 'correct' | 'other-print' | 'ambiguous-ok' | 'wrong' | 'missed' | 'rejected' | 'false-accept' | 'ambiguous-unknown';
interface Row { nn?: string; targetGroup?: number; difficulty: string; kind: string; upsideDown: boolean; sleeve: boolean; glare: boolean; outcome: Outcome; ms: number; distance?: number; detected: boolean }
const rows: Row[] = [];
const pr = rng(SEED + 1234);
const byId = new Map(prints.map((p) => [p.id, p]));
const twins = prints.filter((p) => p.kind === 'twin');

for (let k = 0; k < NPHOTOS; k++) {
  const unknown = pr() < 0.1;
  let target: Print | null = null;
  let rgba: Uint8ClampedArray;
  if (unknown) {
    rgba = makeCard(cv, { artSeed: 5_000_000 + k, frameSeed: 6_000_000 + k, set: 'UNK', number: '0001', style: 'modern' });
  } else {
    // Oversample twins a little so the OCR path gets enough samples.
    target = pr() < 0.08 && twins.length ? pr.pick(twins) : pr.pick(prints);
    rgba = cardCache.get(target.id)!;
  }
  const d = pr();
  const params: PhotoParams = {
    difficulty: d < 0.4 ? 'easy' : d < 0.8 ? 'medium' : 'hard',
    upsideDown: pr() < 0.2,
    sleeve: pr() < 0.15,
    glare: pr() < 0.25,
  };
  const photo = await photograph(cv, rgba, pr, params);
  const t = performance.now();
  const res = await scanner.identify(photo);
  const ms = performance.now() - t;
  let outcome: Outcome;
  if (!target) outcome = res.kind === 'match' ? 'false-accept' : res.kind === 'ambiguous' ? 'ambiguous-unknown' : 'rejected';
  else if (res.kind === 'match') outcome = res.match.scryfallId === target.id ? 'correct'
    : res.match.otherPrints?.some((o) => o.scryfallId === target!.id) ? 'other-print' : 'wrong';
  else if (res.kind === 'ambiguous') outcome = res.candidates.some((c) => c.scryfallId === target!.id) ? 'ambiguous-ok' : 'wrong';
  else outcome = 'missed';
  if (process.env.DUMP && target && outcome === 'missed' && res.quad) {
    const { warpCard } = await import('../src/detect.ts');
    const m = cv.matFromImageData(photo);
    const w = warpCard(cv, m, res.quad);
    m.delete();
    mkdirSync(process.env.DUMP, { recursive: true });
    await sharp(Buffer.from(photo.data.buffer, photo.data.byteOffset, photo.data.byteLength), { raw: { width: 1280, height: 720, channels: 4 } }).jpeg().toFile(`${process.env.DUMP}/${k}-photo.jpg`);
    await sharp(Buffer.from(w.buffer), { raw: { width: CARD_W, height: CARD_H, channels: 4 } }).png().toFile(`${process.env.DUMP}/${k}-warp.png`);
    console.error('dump', k, JSON.stringify(res.quad.map((p) => p.map(Math.round))), JSON.stringify(photo.corners.map((p) => p.map(Math.round))));
  }
  rows.push({ ...params, kind: target ? target.kind : 'unknown', outcome, ms, detected: !!res.quad,
    distance: res.kind === 'match' ? res.match.distance : undefined,
    targetGroup: target?.group, nn: res.nn?.slice(0, 5).map((n) => `${index.group[n.i]}${n.i < prints.length && prints[n.i]!.id === target?.id ? '*' : ''}:${n.dArt}+${n.dFull}`).join(' ') });
  if ((k + 1) % 100 === 0) console.error(`${k + 1}/${NPHOTOS}`);
}
await ocrWorker?.terminate();

// ---- 4. pure search speed over the full index ------------------------------
const q = Scanner.queriesFor(cardCache.get(prints[0]!.id)!);
const reps = 200;
const ts = performance.now();
for (let i = 0; i < reps; i++) searchIndex(index, q, 12);
const searchMs = (performance.now() - ts) / reps;
void byId; void scryfallIdAt;

// ---- 5. report -------------------------------------------------------------
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + ' %' : '-');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.95)]! : 0; };
function summary(sel: Row[]) {
  const known = sel.filter((x) => x.kind !== 'unknown');
  const c = (o: Outcome) => known.filter((x) => x.outcome === o).length;
  return { n: known.length, correct: pct(c('correct'), known.length), otherPrintOffered: pct(c('other-print'), known.length), ambiguousOk: pct(c('ambiguous-ok'), known.length),
    wrong: pct(c('wrong'), known.length), missed: pct(c('missed'), known.length) };
}
const report = {
  config: { cards: prints.length, photos: NPHOTOS, indexEntries: index.n, indexMB: +(bin.length / 1e6).toFixed(2), ocr: USE_OCR, seed: SEED },
  overall: summary(rows),
  byDifficulty: Object.fromEntries(['easy', 'medium', 'hard'].map((d) => [d, summary(rows.filter((x) => x.difficulty === d))])),
  byCondition: {
    upsideDown: summary(rows.filter((x) => x.upsideDown)),
    sleeve: summary(rows.filter((x) => x.sleeve)),
    glare: summary(rows.filter((x) => x.glare)),
    reprintDifferentFrame: summary(rows.filter((x) => x.kind === 'reprint')),
    twinOnlyCollectorLineDiffers: summary(rows.filter((x) => x.kind === 'twin')),
  },
  unknownCards: (() => {
    const u = rows.filter((x) => x.kind === 'unknown');
    return { n: u.length, correctlyRejected: pct(u.filter((x) => x.outcome !== 'false-accept').length, u.length),
      falseAccept: pct(u.filter((x) => x.outcome === 'false-accept').length, u.length) };
  })(),
  timingMs: {
    identifyMedian: +median(rows.map((x) => x.ms)).toFixed(1),
    identifyP95: +p95(rows.map((x) => x.ms)).toFixed(1),
    searchFullIndex: +searchMs.toFixed(2),
    hashBuildPerCard: +tHash.toFixed(1),
  },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows));
console.log(JSON.stringify(report, null, 2));
