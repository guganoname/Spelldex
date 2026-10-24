/**
 * Scanner benchmark with real cards.
 *
 *   node --experimental-strip-types bench/real.ts [--sets M10,ISD,DSK] [--unknown WOE,MKM]
 *     [--photos 600] [--ocr 1] [--seed 7] [--cache ../../.data-cache/scan-bench] [--out bench/results-real]
 *
 * Builds the scan index exactly like the data build (MTGJSON set files -> catalog.db ->
 * Scryfall "normal" images -> hashSources), then sends real card images through the camera
 * simulator (synth.ts photograph()) and runs Scanner.identify(). Faces from --unknown sets
 * whose artwork is not in the index measure false accepts. A threshold sweep over the
 * recorded neighbours shows how acceptDistance / minMargin trade hits against false accepts,
 * with an estimate of the false-accept rate for an index of --full-size entries.
 *
 * Downloads (MTGJSON set files, card images) are cached in --cache, so reruns are offline.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { HASH_STRIDE, decodeScanIndex, popcount32, scryfallIdAt, type CardHashes, type ScanIndex } from '@spelldex/shared/scan';
import { DEFAULT_RULES, DEFAULT_SCORE } from '@spelldex/shared/rules';
import { buildCatalog } from '../../data-build/src/catalog.ts';
import type { MtgjsonSet } from '../../data-build/src/mtgjson.ts';
import { Throttle, fetchImage, hashSources, loadCardRgba, scryfallImageUrl, sourcesFromCatalog, type CardSource } from '../../data-build/src/scan-index/index.ts';
import { loadCvNode } from './cv-node.ts';
import { createOcrNode } from './ocr-node.ts';
import { photograph, rng, type PhotoParams } from './synth.ts';
import { DEFAULT_OPTIONS, Scanner } from '../src/scanner.ts';
import { guideQuad, warpCard, type Corners } from '../src/detect.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const argv = process.argv.slice(2);
const arg = (k: string, d: number | string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1]! : String(d);
};
const SETS = arg('sets', 'M10,ISD,DSK').split(',').filter(Boolean);
const UNKNOWN = arg('unknown', 'WOE,MKM').split(',').filter(Boolean);
const NPHOTOS = Number(arg('photos', 600));
const UNKNOWN_SHARE = Number(arg('unknown-share', 0.2));
const USE_OCR = arg('ocr', 1) === '1';
const SEED = Number(arg('seed', 7));
const FULL_SIZE = Number(arg('full-size', 100_000));
const CACHE = resolve(arg('cache', join(here, '../../../.data-cache/scan-bench')));
const OUT = arg('out', 'bench/results-real');

const imagePath = (s: { scryfallId: string; back: boolean }) => join(CACHE, 'images', `${s.scryfallId}${s.back ? '-back' : ''}.jpg`);

// ---- 1. data ---------------------------------------------------------------
async function mtgjsonSet(code: string): Promise<MtgjsonSet> {
  const file = join(CACHE, 'mtgjson', `${code}.json`);
  if (!existsSync(file)) {
    const r = await fetch(`https://mtgjson.com/api/v5/${code}.json.gz`);
    if (!r.ok) throw new Error(`MTGJSON ${code}: HTTP ${r.status}`);
    await writeFile(file, gunzipSync(Buffer.from(await r.arrayBuffer())));
  }
  return (JSON.parse(await readFile(file, 'utf8')) as { data: MtgjsonSet }).data;
}

async function* sets(codes: string[]) {
  for (const c of codes) yield await mtgjsonSet(c);
}

/** Catalog for a list of sets, then every card face in it, exactly as the data build sees them. */
async function sourcesFor(codes: string[], name: string): Promise<CardSource[]> {
  const db = join(CACHE, `${name}-${process.pid}.db`);
  rmSync(db, { force: true });
  await buildCatalog(db, { sets: sets(codes), rules: DEFAULT_RULES, score: DEFAULT_SCORE, version: 'bench' });
  const out = sourcesFromCatalog(db);
  rmSync(db, { force: true });
  return out;
}

/** Card images into the cache, politely (same throttle as the data build). */
async function download(list: CardSource[]): Promise<void> {
  const todo = list.filter((s) => !existsSync(imagePath(s)));
  const throttle = new Throttle(60);
  let next = 0, done = 0;
  const work = async () => {
    while (next < todo.length) {
      const s = todo[next++]!;
      try {
        await writeFile(imagePath(s), await fetchImage(scryfallImageUrl(s.scryfallId, s.back), throttle));
      } catch (e) {
        console.error(`image failed: ${(e as Error).message}`);
      }
      if (++done % 500 === 0) console.error(`images ${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, work));
}

type Outcome = 'correct' | 'other-print' | 'ambiguous-ok' | 'wrong' | 'missed' | 'rejected' | 'false-accept' | 'ambiguous-unknown';
/** Nearest neighbours: group, score, is the photographed face. */
type NN = [group: number, score: number, target: 0 | 1];
interface Row {
  card: string; kind: 'single' | 'reprint' | 'unknown'; back: boolean; difficulty: string; upsideDown: boolean; sleeve: boolean; glare: boolean;
  outcome: Outcome; ms: number; viaGuide: boolean; targetGroup: number; nn: NN[];
  /** Unknown cards: per accept limit, share of index entries within it (for the full-size estimate). */
  within?: number[];
}
interface Meta { sets: string[]; unknownSets: string[]; indexEntries: number; indexKB: number }
const SWEEP_ACCEPT = [60, 70, 80, 90, 100, 110, 120, 130];
const SWEEP_MARGIN = [0, 8, 12, 16, 20, 24, 32];

const sameQuad = (a: Corners | null, b: Corners) => !!a && a.every((p, i) => Math.abs(p[0] - b[i]![0]) < 0.5 && Math.abs(p[1] - b[i]![1]) < 0.5);

/** Score (art + full, best orientation) against every entry. */
function allScores(idx: ScanIndex, queries: CardHashes[]): Uint16Array {
  const q = queries.map((c) => Uint32Array.from([...c.art, ...c.full]));
  const out = new Uint16Array(idx.n);
  for (let i = 0, o = 0; i < idx.n; i++, o += HASH_STRIDE) {
    let best = 1e9;
    for (const qq of q) {
      let d = 0;
      for (let w = 0; w < HASH_STRIDE; w++) d += popcount32(idx.hashes[o + w]! ^ qq[w]!);
      if (d < best) best = d;
    }
    out[i] = best;
  }
  return out;
}

/** Builds the index, photographs real cards and identifies them. */
async function measure(): Promise<{ rows: Row[]; meta: Meta }> {
  for (const d of ['mtgjson', 'images']) mkdirSync(join(CACHE, d), { recursive: true });
  const indexSources = await sourcesFor(SETS, 'index');
  console.error(`index: ${SETS.length} sets, ${indexSources.length} faces`);
  await download(indexSources);
  const built = await hashSources(indexSources, { imagesDir: join(CACHE, 'images') });
  if (built.failed.length) console.error(`index: ${built.failed.length} faces without image`);
  const index = decodeScanIndex(built.bin);
  const groupSize = new Map<number, number>();
  for (const g of index.group) groupSize.set(g, (groupSize.get(g) ?? 0) + 1);

  // Unknown cards: other sets, minus every artwork that is also in the index (reprints).
  const r = rng(SEED);
  const indexArt = new Set(indexSources.map((s) => s.artKey));
  const indexIds = new Set(indexSources.map((s) => s.scryfallId));
  const unknownPool = (await sourcesFor(UNKNOWN, 'unknown')).filter((s) => !indexArt.has(s.artKey) && !indexIds.has(s.scryfallId));
  const unknownPick: CardSource[] = [];
  for (const s of [...unknownPool].sort(() => r() - 0.5)) if (unknownPick.length < Math.round(NPHOTOS * UNKNOWN_SHARE * 1.2)) unknownPick.push(s);
  await download(unknownPick);
  const unknownCards = unknownPick.filter((s) => existsSync(imagePath(s)));
  console.error(`unknown: ${unknownPool.length} faces with art outside the index, ${unknownCards.length} sampled`);

  // ---- 2. photos -----------------------------------------------------------
  const cv = await loadCvNode();
  const ocrNode = USE_OCR ? await createOcrNode() : undefined;
  const scanner = new Scanner(cv, index, {}, ocrNode?.ocr);
  const rows: Row[] = [];
  const pr = rng(SEED + 1234);
  const guide = guideQuad(1280, 720);
  let nextUnknown = 0;
  const t0 = performance.now();
  for (let k = 0; k < NPHOTOS; k++) {
    const unknown = unknownCards.length > 0 && pr() < UNKNOWN_SHARE;
    let src: CardSource;
    let target = -1;
    if (unknown) src = unknownCards[nextUnknown++ % unknownCards.length]!;
    else {
      target = Math.floor(pr() * index.n);
      src = { scryfallId: scryfallIdAt(index, target), back: index.back[target]!, artKey: '', set: index.set[target]!, collectorNumber: index.collectorNumber[target]! };
    }
    const d = pr();
    const params: PhotoParams = {
      difficulty: d < 0.4 ? 'easy' : d < 0.8 ? 'medium' : 'hard',
      upsideDown: pr() < 0.2,
      sleeve: pr() < 0.15,
      glare: pr() < 0.25,
    };
    const photo = await photograph(cv, await loadCardRgba(imagePath(src)), pr, params);
    const t = performance.now();
    const res = await scanner.identify(photo);
    const ms = performance.now() - t;
    const id = src.scryfallId;
    let outcome: Outcome;
    if (unknown) outcome = res.kind === 'match' ? 'false-accept' : res.kind === 'ambiguous' ? 'ambiguous-unknown' : 'rejected';
    else if (res.kind === 'match') outcome = res.match.scryfallId === id ? 'correct' : res.match.otherPrints?.some((o) => o.scryfallId === id) ? 'other-print' : 'wrong';
    else if (res.kind === 'ambiguous') outcome = res.candidates.some((c) => c.scryfallId === id) ? 'ambiguous-ok' : 'wrong';
    else outcome = 'missed';
    const targetGroup = unknown ? -1 : index.group[target]!;
    const row: Row = {
      card: `${src.set}/${src.collectorNumber}${src.back ? '/b' : ''}`, kind: unknown ? 'unknown' : groupSize.get(targetGroup)! > 1 ? 'reprint' : 'single', back: src.back,
      ...params, outcome, ms, viaGuide: res.kind === 'none' ? !res.quad : sameQuad(res.quad, guide), targetGroup,
      nn: (res.nn ?? []).map((n) => [index.group[n.i]!, n.score, scryfallIdAt(index, n.i) === id && !unknown ? 1 : 0]),
    };
    if (unknown) {
      const m = cv.matFromImageData(photo);
      const scores = allScores(index, Scanner.queriesFor(warpCard(cv, m, res.quad ?? guide)));
      m.delete();
      row.within = SWEEP_ACCEPT.map((t) => scores.reduce((a, s) => a + (s <= t ? 1 : 0), 0) / index.n);
    }
    // DUMP=<dir>: failed photos as PNG plus the true corners, as test material for the detector.
    if (process.env.DUMP && outcome !== 'correct' && outcome !== 'rejected') {
      const { default: sharp } = await import('sharp');
      mkdirSync(process.env.DUMP, { recursive: true });
      await sharp(Buffer.from(photo.data.buffer, photo.data.byteOffset, photo.data.byteLength), { raw: { width: 1280, height: 720, channels: 4 } })
        .png().toFile(`${process.env.DUMP}/${k}-photo.png`);
      writeFileSync(`${process.env.DUMP}/${k}.json`, JSON.stringify({
        scryfallId: id, back: src.back, card: row.card, outcome, outlineFound: !row.viaGuide, ...params,
        corners: photo.corners, detected: res.quad, nn: row.nn.slice(0, 3),
      }, null, 1));
    }
    rows.push(row);
    if ((k + 1) % 50 === 0) console.error(`${k + 1}/${NPHOTOS} (${((performance.now() - t0) / (k + 1)).toFixed(0)} ms/photo)`);
  }
  await ocrNode?.terminate();
  return { rows, meta: { sets: SETS, unknownSets: UNKNOWN, indexEntries: index.n, indexKB: Math.round(built.bin.length / 1024) } };
}

// --from a/rows.json,b/rows.json: re-analyse earlier runs (e.g. several seeds run in parallel) without measuring.
let rows: Row[] = [];
let meta: Meta;
const FROM = arg('from', '');
if (FROM) {
  for (const f of FROM.split(',')) {
    const saved = JSON.parse(readFileSync(f, 'utf8')) as { meta: Meta; rows: Row[] };
    rows.push(...saved.rows);
    meta = saved.meta;
  }
} else ({ rows, meta } = await measure());

// ---- 3. threshold sweep ----------------------------------------------------
/** Replays the accept / margin decision of Scanner.identify() on the recorded neighbours. */
function decide(x: Row, accept: number, margin: number): 'hit' | 'ambiguous-ok' | 'ambiguous-bad' | 'wrong' | 'none' {
  const best = x.nn[0];
  const o = DEFAULT_OPTIONS;
  const limit = x.viaGuide ? accept - (o.acceptDistance - o.guideAcceptDistance) : accept;
  if (!best || best[1] > limit) return 'none';
  const other = x.nn.find((n) => n[0] !== best[0]);
  const m = other ? other[1] - best[1] : 64;
  // The strict zone keeps its distance to the accept limit.
  if (m < (best[1] > accept - (o.acceptDistance - o.strictAbove) ? Math.max(margin, o.strictMargin) : margin)) return x.nn.filter((n) => n[1] <= limit).slice(0, 3).some((n) => n[0] === x.targetGroup) ? 'ambiguous-ok' : 'ambiguous-bad';
  return best[0] === x.targetGroup ? 'hit' : 'wrong';
}
const known = rows.filter((x) => x.kind !== 'unknown');
const unknownRows = rows.filter((x) => x.kind === 'unknown');
const pct = (a: number, b: number) => (b ? +((100 * a) / b).toFixed(1) : 0);
const sweep = SWEEP_ACCEPT.flatMap((accept, ai) => SWEEP_MARGIN.map((margin) => {
  const dk = known.map((x) => decide(x, accept, margin));
  const du = unknownRows.map((x) => decide(x, accept, margin));
  // P(some entry of a full-size index lands within the limit) per unknown card, averaged.
  const full = unknownRows.length
    ? unknownRows.reduce((a, x) => a + 1 - Math.pow(1 - x.within![ai]!, FULL_SIZE), 0) / unknownRows.length : 0;
  return {
    accept, margin,
    hit: pct(dk.filter((v) => v === 'hit').length, dk.length),
    ambiguousOk: pct(dk.filter((v) => v === 'ambiguous-ok').length, dk.length),
    wrong: pct(dk.filter((v) => v === 'wrong' || v === 'ambiguous-bad').length, dk.length),
    missed: pct(dk.filter((v) => v === 'none').length, dk.length),
    falseAccept: pct(du.filter((v) => v === 'wrong').length, du.length),
    unknownAmbiguous: pct(du.filter((v) => v === 'ambiguous-bad').length, du.length),
    falseAcceptFullIndexEst: +(100 * full).toFixed(1),
  };
}));

// ---- 4. report -------------------------------------------------------------
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.95)]! : 0; };
function summary(sel: Row[]) {
  const k = sel.filter((x) => x.kind !== 'unknown');
  const c = (o: Outcome) => pct(k.filter((x) => x.outcome === o).length, k.length);
  return { n: k.length, correct: c('correct'), otherPrintOffered: c('other-print'), ambiguousOk: c('ambiguous-ok'), wrong: c('wrong'), missed: c('missed') };
}
const correctScores = known.filter((x) => x.outcome === 'correct' || x.outcome === 'other-print').map((x) => x.nn[0]![1]);
const unknownBest = unknownRows.map((x) => x.nn[0]?.[1] ?? 999);
const report = {
  config: { ...meta!, photos: rows.length, unknownPhotos: unknownRows.length, ocr: USE_OCR, seed: SEED, options: DEFAULT_OPTIONS },
  overall: summary(rows),
  byDifficulty: Object.fromEntries(['easy', 'medium', 'hard'].map((d) => [d, summary(rows.filter((x) => x.difficulty === d))])),
  byCondition: {
    upsideDown: summary(rows.filter((x) => x.upsideDown)),
    sleeve: summary(rows.filter((x) => x.sleeve)),
    glare: summary(rows.filter((x) => x.glare)),
    backFace: summary(rows.filter((x) => x.back)),
    artInSeveralPrints: summary(rows.filter((x) => x.kind === 'reprint')),
  },
  unknownCards: {
    n: unknownRows.length,
    rejected: pct(unknownRows.filter((x) => x.outcome === 'rejected').length, unknownRows.length),
    ambiguous: pct(unknownRows.filter((x) => x.outcome === 'ambiguous-unknown').length, unknownRows.length),
    falseAccept: pct(unknownRows.filter((x) => x.outcome === 'false-accept').length, unknownRows.length),
  },
  distances: {
    correctMedian: median(correctScores), correctP95: p95(correctScores),
    unknownBestMin: Math.min(...unknownBest), unknownBestP05: [...unknownBest].sort((a, b) => a - b)[Math.floor(unknownBest.length * 0.05)] ?? null, unknownBestMedian: median(unknownBest),
  },
  timingMs: { identifyMedian: +median(rows.map((x) => x.ms)).toFixed(1), identifyP95: +p95(rows.map((x) => x.ms)).toFixed(1) },
  sweep,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/rows.json`, JSON.stringify({ meta: meta!, rows }));
const { sweep: _s, ...head } = report;
console.log(JSON.stringify(head, null, 2));
console.log('accept margin |   hit amb-ok wrong missed | unknown: accept ambig (within limit, full index est.)');
for (const s of sweep)
  console.log(`${String(s.accept).padStart(6)} ${String(s.margin).padStart(6)} | ${[s.hit, s.ambiguousOk, s.wrong, s.missed].map((v) => v.toFixed(1).padStart(5)).join(' ')} | ${[s.falseAccept, s.unknownAmbiguous].map((v) => v.toFixed(1).padStart(5)).join(' ')} (${s.falseAcceptFullIndexEst.toFixed(1)})`);
