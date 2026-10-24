import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import type { ArtifactFile } from '@spelldex/shared/contracts';

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Writes `buf` (gzip if asked) to outDir and returns its manifest entry. The file name carries
 * the content hash (immutable, cacheable forever). Gzipped files get the extension ".gzip", not
 * ".gz": static servers and CDNs often add `Content-Encoding: gzip` for ".gz", the browser then
 * inflates transparently and the client-side hash check fails.
 */
export async function writeArtifact(outDir: string, name: string, buf: Uint8Array, gzip = false): Promise<ArtifactFile> {
  const data = gzip ? gzipSync(buf, { level: 9 }) : buf;
  const dot = name.lastIndexOf('.');
  const hashed = `${name.slice(0, dot)}.${sha256(data).slice(0, 12)}${name.slice(dot)}`;
  const file = gzip ? `${hashed}.gzip` : hashed;
  await writeFile(`${outDir}/${file}`, data);
  return { path: basename(file), bytes: data.byteLength, sha256: sha256(data), ...(gzip ? { encoding: 'gzip' as const } : {}) };
}

export async function fileArtifact(outDir: string, srcPath: string, name: string, gzip = false): Promise<ArtifactFile> {
  return writeArtifact(outDir, name, await readFile(srcPath), gzip);
}
