/**
 * Builds scan-index.bin (format: @spelldex/shared/scan, index-codec.ts): one perceptual-hash
 * entry per printed card face in the catalog.
 *
 * Images come from Scryfall's image CDN ("normal", 488x680, the size the scanner warps camera
 * frames to). They are hashed in memory and discarded; only hashes are shipped. Hashes of
 * printings already in the previous index are reused, so the nightly build only downloads new
 * prints. Set SCAN_INDEX_IMAGES=<dir> to hash local files `<dir>/<scryfallId>[-back].jpg`
 * instead (tests, offline runs).
 */
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import type { ArtifactFile } from '@spelldex/shared/contracts';
import {
  CARD_H, CARD_W, decodeScanIndex, encodeScanIndex, hashCard, hashesAt, scryfallIdAt,
  type CardHashes, type ScanIndexEntry,
} from '@spelldex/shared/scan';
import { writeArtifact } from '../artifacts.ts';

export interface ScanIndexInput {
  /** Path of the finished catalog.db (read-only). */
  catalogPath: string;
  outDir: string;
  /** Previous index to reuse hashes for unchanged printings (incremental nightly build). */
  previousIndexPath?: string;
}

export interface CardSource {
  scryfallId: string;
  /** Prints sharing one illustration get the same key. */
  artKey: string;
  set: string;
  collectorNumber: string;
  back: boolean;
}

export function scryfallImageUrl(id: string, back = false): string {
  return `https://cards.scryfall.io/normal/${back ? 'back' : 'front'}/${id[0]}/${id[1]}/${id}.jpg`;
}

/** Decode any image to exactly CARD_W x CARD_H RGBA, the same input the camera warp produces. */
export async function loadCardRgba(input: Buffer | string): Promise<Uint8ClampedArray> {
  const data = await sharp(input)
    .resize(CARD_W, CARD_H, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .ensureAlpha(1)
    .raw()
    .toBuffer();
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

/** Every card face of the catalog, front and back. */
export function sourcesFromCatalog(catalogPath: string): CardSource[] {
  const db = new DatabaseSync(catalogPath, { readOnly: true });
  try {
    const cols = new Set((db.prepare('PRAGMA table_info(printing)').all() as { name: string }[]).map((c) => c.name));
    // Scryfall's illustration id is the exact key; without it, same card + same artist is a close proxy.
    const artExpr = cols.has('illustration_id')
      ? "COALESCE(illustration_id, oracle_id || '|' || COALESCE(artist, ''))"
      : "oracle_id || '|' || COALESCE(artist, '')";
    const rows = db
      .prepare(`SELECT scryfall_id, set_code, collector_number, has_back_face, ${artExpr} AS art_key FROM printing ORDER BY set_code, number_sort, collector_number`)
      .all() as { scryfall_id: string; set_code: string; collector_number: string; has_back_face: number; art_key: string }[];
    const out: CardSource[] = [];
    for (const r of rows) {
      const base = { scryfallId: r.scryfall_id, set: r.set_code, collectorNumber: r.collector_number };
      out.push({ ...base, artKey: r.art_key, back: false });
      // Back faces have their own art; key them by print so they never merge with other cards.
      if (r.has_back_face) out.push({ ...base, artKey: `${r.scryfall_id}|back`, back: true });
    }
    return out;
  } finally {
    db.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Spaces CDN requests and lets one worker's 429/503 pause all of them, so a throttling CDN sees
 * the whole build slow down instead of eight workers retrying in parallel.
 */
export class Throttle {
  private next = 0;
  private readonly gapMs: number;
  constructor(gapMs: number) {
    this.gapMs = gapMs;
  }
  async slot(): Promise<void> {
    const at = Math.max(Date.now(), this.next);
    this.next = at + this.gapMs;
    if (at > Date.now()) await sleep(at - Date.now());
  }
  pause(ms: number): void {
    this.next = Math.max(this.next, Date.now() + ms);
  }
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchImage(url: string, throttle: Throttle, tries = 8, baseDelayMs = 2000): Promise<Buffer> {
  for (let i = 0; ; i++) {
    await throttle.slot();
    const r = await fetch(url, { headers: { 'User-Agent': 'Spelldex/0.1 (scan index build)', Accept: 'image/*' } }).catch((e: unknown) => e as Error);
    if (!(r instanceof Error) && r.ok) return Buffer.from(await r.arrayBuffer());
    const why = r instanceof Error ? r.message : `HTTP ${r.status}`;
    const retryable = r instanceof Error || RETRY_STATUS.has(r.status);
    // A network error (DNS, refused, offline) rarely heals within seconds: give it 3 tries only.
    if (!retryable || i + 1 >= (r instanceof Error ? Math.min(tries, 3) : tries)) throw new Error(`${why} ${url}`);
    // Honour Retry-After (seconds) when the CDN sends it, else exponential backoff capped at 60 s.
    const retryAfter = r instanceof Error ? NaN : Number(r.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(60_000, baseDelayMs * 2 ** i);
    if (!(r instanceof Error) && (r.status === 429 || r.status === 503)) throttle.pause(delay);
    await sleep(delay);
  }
}

export interface HashOptions {
  previous?: Map<string, CardHashes>;
  imagesDir?: string;
  concurrency?: number;
  /** Minimum gap between CDN requests, ms (politeness towards Scryfall). */
  requestGapMs?: number;
  /** First retry delay for throttled/failed requests, doubled per try (capped at 60 s). */
  retryBaseMs?: number;
  /** Called with the index so far every `checkpointEvery` newly hashed faces (survives a timeout). */
  checkpoint?: (bin: Uint8Array) => void | Promise<void>;
  checkpointEvery?: number;
  log?: (msg: string) => void;
}

const faceKey = (s: { scryfallId: string; back: boolean }) => `${s.scryfallId}:${s.back ? 'b' : 'f'}`;

/** Hashes all sources (reusing `previous`), then assigns art groups and encodes the index. */
export async function hashSources(sources: CardSource[], opts: HashOptions = {}) {
  const hashes = new Map<string, CardHashes>();
  const failed: string[] = [];
  const todo = sources.filter((s) => {
    const prev = opts.previous?.get(faceKey(s));
    if (prev) hashes.set(faceKey(s), prev);
    return !prev;
  });
  opts.log?.(`scan index: ${sources.length - todo.length} reused, ${todo.length} to hash`);
  const throttle = new Throttle(opts.requestGapMs ?? 60);
  const every = opts.checkpointEvery ?? 5000;
  let next = 0, done = 0, ok = 0;
  const work = async () => {
    while (next < todo.length) {
      const s = todo[next++]!;
      try {
        let input: Buffer | string;
        if (opts.imagesDir) input = join(opts.imagesDir, `${s.scryfallId}${s.back ? '-back' : ''}.jpg`);
        else input = await fetchImage(scryfallImageUrl(s.scryfallId, s.back), throttle, 8, opts.retryBaseMs);
        hashes.set(faceKey(s), hashCard(await loadCardRgba(input)));
        ok++;
      } catch (e) {
        failed.push(`${faceKey(s)} ${(e as Error).message}`);
        // Offline or blocked: stop after the first handful instead of trying every print.
        if (ok === 0 && failed.length >= 10) next = todo.length;
      }
      if (++done % 1000 === 0) opts.log?.(`scan index: hashed ${done}/${todo.length}`);
      if (opts.checkpoint && done % every === 0) await opts.checkpoint(encode(sources, hashes).bin);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 8 }, work));
  return { ...encode(sources, hashes), failed };
}

function encode(sources: CardSource[], hashes: Map<string, CardHashes>) {
  const groups = new Map<string, number>();
  const entries: ScanIndexEntry[] = [];
  for (const s of sources) {
    const h = hashes.get(faceKey(s));
    if (!h) continue;
    if (!groups.has(s.artKey)) groups.set(s.artKey, groups.size);
    entries.push({ scryfallId: s.scryfallId, hashes: h, group: groups.get(s.artKey)!, set: s.set, collectorNumber: s.collectorNumber, back: s.back });
  }
  return { bin: encodeScanIndex(entries), entries };
}

async function loadPrevious(path: string | undefined): Promise<Map<string, CardHashes> | undefined> {
  if (!path || !existsSync(path)) return undefined;
  const idx = decodeScanIndex(await readFile(path));
  const m = new Map<string, CardHashes>();
  for (let i = 0; i < idx.n; i++) m.set(faceKey({ scryfallId: scryfallIdAt(idx, i), back: idx.back[i]! }), hashesAt(idx, i));
  return m;
}

export async function buildScanIndex(input: ScanIndexInput): Promise<ArtifactFile | null> {
  const log = (m: string) => console.log(m);
  const sources = sourcesFromCatalog(input.catalogPath);
  if (!sources.length) return null;
  // Progress is checkpointed to scan-index.partial.bin; pass it as previousIndexPath next time
  // (e.g. via the CI cache) and an interrupted first full build resumes instead of starting over.
  const partial = join(input.outDir, 'scan-index.partial.bin');
  const previous = await loadPrevious(input.previousIndexPath);
  const res = await hashSources(sources, {
    previous,
    imagesDir: process.env.SCAN_INDEX_IMAGES,
    log,
    checkpoint: (bin) => writeFile(partial, bin),
  });
  if (res.failed.length) log(`scan index: ${res.failed.length} faces failed, e.g. ${res.failed.slice(0, 3).join('; ')}`);
  // Nothing reachable at all (offline fixture build, CDN blocked): skip the artifact, the app
  // keeps the scanner disabled. A partly empty index would silently break scanning: fail instead.
  if (res.entries.length === 0) {
    log('scan index: skipped, no card image could be loaded (offline?)');
    return null;
  }
  if (res.entries.length < sources.length * 0.9) {
    await writeFile(partial, res.bin);
    throw new Error(`scan index: only ${res.entries.length}/${sources.length} faces hashed; progress kept in ${partial}`);
  }
  await rm(partial, { force: true });
  return writeArtifact(input.outDir, 'scan-index.bin', res.bin);
}
