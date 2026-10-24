/**
 * Catalog install/update: fetch manifest, download the catalog with progress, verify SHA-256,
 * gunzip straight into OPFS under a versioned name, then swap. A failed or interrupted update
 * never touches the installed catalog.
 */
import { CATALOG_SCHEMA } from '@spelldex/shared/catalog';
import type { ArtifactFile, CatalogStatus, DataManifest } from '@spelldex/shared/contracts';
import { importDb, listFiles, openDb, removeFile, type OpenDb, type SqliteEnv } from './sqlite.ts';

const PREFIX = '/catalog-';
export const catalogFile = (version: string) => `${PREFIX}${version.replace(/[^\w.-]/g, '_')}.db`;

export async function fetchManifest(url: string): Promise<DataManifest> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
  const m = (await res.json()) as DataManifest;
  if (m.minAppSchema > CATALOG_SCHEMA) throw new Error('Die Daten brauchen eine neuere App-Version.');
  return m;
}

async function download(url: string, art: ArtifactFile, onProgress: (p: number) => void): Promise<Uint8Array[]> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${art.path}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onProgress(Math.min(1, got / art.bytes));
  }
  return chunks;
}

async function sha256Hex(chunks: Uint8Array[]): Promise<string> {
  const buf = await new Blob(chunks as BlobPart[]).arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Finds the newest catalog that opens and has a compatible schema; removes broken or old ones. */
export function openInstalled(env: SqliteEnv): { db: OpenDb; version: string } | null {
  const files = listFiles(env).filter((f) => f.startsWith(PREFIX)).sort().reverse();
  let found: { db: OpenDb; version: string } | null = null;
  for (const f of files) {
    if (found) {
      removeFile(env, f);
      continue;
    }
    try {
      const db = openDb(env, f, 'r');
      const schema = db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema'`)?.value;
      const version = db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'version'`)?.value;
      if (Number(schema) !== CATALOG_SCHEMA || !version) throw new Error('incompatible');
      found = { db, version };
    } catch {
      removeFile(env, f);
    }
  }
  return found;
}

export async function installCatalog(
  env: SqliteEnv,
  manifestUrl: string,
  manifest: DataManifest,
  report: (s: Partial<CatalogStatus>) => void,
): Promise<string> {
  const art = manifest.artifacts.catalog;
  const url = new URL(art.path, new URL(manifestUrl, self.location.href)).href;
  report({ phase: 'downloading', progress: 0 });
  const chunks = await download(url, art, (progress) => report({ phase: 'downloading', progress }));

  report({ phase: 'verifying' });
  const hash = await sha256Hex(chunks);
  if (hash !== art.sha256) throw new Error('Katalog-Download beschädigt (Prüfsumme stimmt nicht).');

  report({ phase: 'installing' });
  const name = catalogFile(manifest.version);
  let stream = new Blob(chunks as BlobPart[]).stream() as ReadableStream<Uint8Array>;
  if (art.encoding === 'gzip') stream = stream.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  await importDb(env, name, async () => (await reader.read()).value);
  return name;
}

/** Deletes every catalog file except `keep` (call after the swap, when the old DB is closed). */
export function removeCatalogsExcept(env: SqliteEnv, keep: string): void {
  for (const f of listFiles(env)) if (f.startsWith(PREFIX) && f !== keep) removeFile(env, f);
}
