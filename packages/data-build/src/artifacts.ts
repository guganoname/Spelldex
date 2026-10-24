import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import type { ArtifactFile } from '@spelldex/shared/contracts';

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Writes `buf` (gzip if asked) to outDir/name and returns its manifest entry. */
export async function writeArtifact(outDir: string, name: string, buf: Uint8Array, gzip = false): Promise<ArtifactFile> {
  const data = gzip ? gzipSync(buf, { level: 9 }) : buf;
  const file = gzip ? `${name}.gz` : name;
  await writeFile(`${outDir}/${file}`, data);
  return { path: basename(file), bytes: data.byteLength, sha256: sha256(data), ...(gzip ? { encoding: 'gzip' as const } : {}) };
}

export async function fileArtifact(outDir: string, srcPath: string, name: string, gzip = false): Promise<ArtifactFile> {
  return writeArtifact(outDir, name, await readFile(srcPath), gzip);
}
