/**
 * scan-index.bin: the scanner's lookup table, written by data-build and read
 * by the scan worker. Little endian, columnar, every column 4-byte aligned.
 *
 *   magic "SPLX" | u16 version | u16 flags | u32 n | u32 stringBytes
 *   ids      n * 16 bytes   Scryfall UUID, raw bytes
 *   hashes   n * 10 u32     art hash (8 words, 256 bit), full-card hash (2 words, 64 bit)
 *   group    n * u32        illustration group: prints sharing one artwork
 *   strings  stringBytes    UTF-8 "SET/NUMBER" per entry ("SET/NUMBER/b" for a back
 *                           face), joined by "\n"
 *                           (padded to 4 bytes)
 */
import { ART_HASH, FULL_HASH, type CardHashes } from './phash.ts';

/** u32 words per entry in the hash column. */
export const HASH_STRIDE = ART_HASH.words + FULL_HASH.words;

export const SCAN_INDEX_MAGIC = 'SPLX';
export const SCAN_INDEX_VERSION = 1;
const HEADER_BYTES = 16;

export interface ScanIndexEntry {
  scryfallId: string;
  hashes: CardHashes;
  /** Same value for every print that reuses the same illustration. */
  group: number;
  set: string;
  collectorNumber: string;
  /** Back face of a double-faced card (same Scryfall id, other image). */
  back?: boolean;
}

export interface ScanIndex {
  n: number;
  ids: Uint8Array;
  /** HASH_STRIDE u32 per entry: art words, then full words. */
  hashes: Uint32Array;
  group: Uint32Array;
  set: string[];
  collectorNumber: string[];
  back: boolean[];
}

function uuidToBytes(id: string, out: Uint8Array, off: number): void {
  const hex = id.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`bad uuid ${id}`);
  for (let i = 0; i < 16; i++) out[off + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
}

export function scryfallIdAt(index: ScanIndex, i: number): string {
  let s = '';
  for (let b = 0; b < 16; b++) {
    s += index.ids[i * 16 + b]!.toString(16).padStart(2, '0');
    if (b === 3 || b === 5 || b === 7 || b === 9) s += '-';
  }
  return s;
}

const pad4 = (n: number) => (n + 3) & ~3;

export function encodeScanIndex(entries: ScanIndexEntry[]): Uint8Array {
  const n = entries.length;
  const strings = new TextEncoder().encode(entries.map((e) => `${e.set}/${e.collectorNumber}${e.back ? '/b' : ''}`).join('\n'));
  const total = HEADER_BYTES + n * 16 + n * HASH_STRIDE * 4 + n * 4 + pad4(strings.length);
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < 4; i++) buf[i] = SCAN_INDEX_MAGIC.charCodeAt(i);
  dv.setUint16(4, SCAN_INDEX_VERSION, true);
  dv.setUint16(6, 0, true);
  dv.setUint32(8, n, true);
  dv.setUint32(12, strings.length, true);
  let off = HEADER_BYTES;
  entries.forEach((e, i) => uuidToBytes(e.scryfallId, buf, off + i * 16));
  off += n * 16;
  entries.forEach((e, i) => {
    const words = [...e.hashes.art, ...e.hashes.full];
    if (words.length !== HASH_STRIDE) throw new Error('scan index: wrong hash size');
    words.forEach((w, j) => dv.setUint32(off + (i * HASH_STRIDE + j) * 4, w, true));
  });
  off += n * HASH_STRIDE * 4;
  entries.forEach((e, i) => dv.setUint32(off + i * 4, e.group, true));
  off += n * 4;
  buf.set(strings, off);
  return buf;
}

export function decodeScanIndex(input: ArrayBuffer | Uint8Array): ScanIndex {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Typed-array views below need 4-byte alignment; copy if the caller handed us an odd slice.
  const bytes = buf.byteOffset % 4 === 0 ? buf : buf.slice();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== SCAN_INDEX_MAGIC) throw new Error(`scan index: bad magic ${magic}`);
  const version = dv.getUint16(4, true);
  if (version !== SCAN_INDEX_VERSION) throw new Error(`scan index: unsupported version ${version}`);
  const n = dv.getUint32(8, true);
  const stringBytes = dv.getUint32(12, true);
  let off = bytes.byteOffset + HEADER_BYTES;
  const ids = new Uint8Array(bytes.buffer, off, n * 16);
  off += n * 16;
  // Little-endian hosts only (every browser and Node target we ship to).
  const hashes = new Uint32Array(bytes.buffer, off, n * HASH_STRIDE);
  off += n * HASH_STRIDE * 4;
  const group = new Uint32Array(bytes.buffer, off, n);
  off += n * 4;
  const lines = n === 0 ? [] : new TextDecoder().decode(new Uint8Array(bytes.buffer, off, stringBytes)).split('\n');
  if (lines.length !== n) throw new Error('scan index: string table does not match entry count');
  const set: string[] = new Array(n);
  const collectorNumber: string[] = new Array(n);
  const back: boolean[] = new Array(n);
  lines.forEach((l, i) => {
    const [s, num, face] = l.split('/');
    set[i] = s!;
    collectorNumber[i] = num ?? '';
    back[i] = face === 'b';
  });
  return { n, ids, hashes, group, set, collectorNumber, back };
}

/** Hashes of entry `i` (copies), e.g. to reuse them in an incremental build. */
export function hashesAt(index: ScanIndex, i: number): CardHashes {
  const o = i * HASH_STRIDE;
  return {
    art: index.hashes.slice(o, o + ART_HASH.words),
    full: index.hashes.slice(o + ART_HASH.words, o + HASH_STRIDE),
  };
}
