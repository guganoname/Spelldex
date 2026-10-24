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
import { readFile } from 'node:fs/promises';
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

async function fetchImage(url: string, tries = 4): Promise<Buffer> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Spelldex/0.1 (scan index build)', Accept: 'image/*' } }).catch((e: unknown) => e as Error);
    if (!(r instanceof Error) && r.ok) return Buffer.from(await r.arrayBuffer());
    const why = r instanceof Error ? r.message : `HTTP ${r.status}`;
    if (i + 1 >= tries || (!(r instanceof Error) && r.status === 404)) throw new Error(`${why} ${url}`);
    await sleep(1000 * 2 ** i);
  }
}

export interface HashOptions {
  previous?: Map<string, CardHashes>;
  imagesDir?: string;
  concurrency?: number;
  /** Minimum gap between CDN requests, ms (politeness towards Scryfall). */
  requestGapMs?: number;
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
  const gap = opts.requestGapMs ?? 60;
  let next = 0, done = 0, lastRequest = 0;
  const work = async () => {
    while (next < todo.length) {
      const s = todo[next++]!;
      try {
        let input: Buffer | string;
        if (opts.imagesDir) input = join(opts.imagesDir, `${s.scryfallId}${s.back ? '-back' : ''}.jpg`);
        else {
          const wait = lastRequest + gap - Date.now();
          lastRequest = Math.max(Date.now(), lastRequest + gap);
          if (wait > 0) await sleep(wait);
          input = await fetchImage(scryfallImageUrl(s.scryfallId, s.back));
        }
        hashes.set(faceKey(s), hashCard(await loadCardRgba(input)));
      } catch (e) {
        failed.push(`${faceKey(s)} ${(e as Error).message}`);
      }
      if (++done % 1000 === 0) opts.log?.(`scan index: hashed ${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 8 }, work));

  const groups = new Map<string, number>();
  const entries: ScanIndexEntry[] = [];
  for (const s of sources) {
    const h = hashes.get(faceKey(s));
    if (!h) continue;
    if (!groups.has(s.artKey)) groups.set(s.artKey, groups.size);
    entries.push({ scryfallId: s.scryfallId, hashes: h, group: groups.get(s.artKey)!, set: s.set, collectorNumber: s.collectorNumber, back: s.back });
  }
  return { bin: encodeScanIndex(entries), entries, failed };
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
  const res = await hashSources(sources, {
    previous: await loadPrevious(input.previousIndexPath),
    imagesDir: process.env.SCAN_INDEX_IMAGES,
    log,
  });
  if (res.failed.length) log(`scan index: ${res.failed.length} faces failed, e.g. ${res.failed.slice(0, 3).join('; ')}`);
  // Nothing reachable at all (offline fixture build, CDN blocked): skip the artifact, the app
  // keeps the scanner disabled. A partly empty index would silently break scanning: fail instead.
  if (res.entries.length === 0) {
    log('scan index: skipped, no card image could be loaded (offline?)');
    return null;
  }
  if (res.entries.length < sources.length * 0.9) throw new Error(`scan index: only ${res.entries.length}/${sources.length} faces hashed`);
  return writeArtifact(input.outDir, 'scan-index.bin', res.bin);
}
