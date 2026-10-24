/**
 * sqlite-wasm setup for the data worker. Databases live in OPFS via the "opfs-sahpool" VFS, which
 * needs no COOP/COEP headers and works in Safari 17+. Without OPFS (old browsers, private mode)
 * we fall back to memory: the app still works, but the catalog is downloaded again next start.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Db, SqlParams } from '@spelldex/shared/catalog';

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type OoDb = InstanceType<Sqlite3['oo1']['DB']>;
export type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>;

export interface SqliteEnv {
  sqlite3: Sqlite3;
  pool: Pool | null;
}

let envPromise: Promise<SqliteEnv> | null = null;

export function sqliteEnv(): Promise<SqliteEnv> {
  envPromise ??= (async () => {
    const sqlite3 = await sqlite3InitModule();
    let pool: Pool | null = null;
    try {
      // Catalog (current + incoming during an update) + collection + journals.
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'spelldex', initialCapacity: 8 });
    } catch (e) {
      console.warn('[data] OPFS not available, using memory', e);
    }
    return { sqlite3, pool };
  })();
  return envPromise;
}

export interface OpenDb extends Db {
  close(): void;
  raw: OoDb;
}

export function wrapDb(db: OoDb): OpenDb {
  const bind = (p?: SqlParams) => (p === undefined || (Array.isArray(p) && p.length === 0) ? undefined : p);
  const all = <T,>(sql: string, p?: SqlParams): T[] =>
    db.exec({ sql, bind: bind(p) as never, rowMode: 'object', returnValue: 'resultRows' }) as T[];
  return {
    raw: db,
    exec: (sql) => void db.exec(sql),
    run: (sql, p) => void db.exec({ sql, bind: bind(p) as never }),
    all,
    get: <T,>(sql: string, p?: SqlParams) => all<T>(sql, p)[0],
    transaction: <T,>(fn: () => T): T => db.transaction(() => fn()) as T,
    close: () => db.close(),
  };
}

export function openDb(env: SqliteEnv, name: string, mode: 'c' | 'r' = 'c'): OpenDb {
  if (env.pool) return wrapDb(new env.pool.OpfsSAHPoolDb(name) as unknown as OoDb);
  return wrapDb(new env.sqlite3.oo1.DB(name, mode === 'r' ? 'r' : 'c'));
}

/** Writes a downloaded database file (streamed in chunks) under `name`. */
export async function importDb(env: SqliteEnv, name: string, next: () => Promise<Uint8Array | undefined>): Promise<void> {
  if (env.pool) {
    await env.pool.importDb(name, next);
    return;
  }
  const chunks: Uint8Array[] = [];
  for (let c = await next(); c; c = await next()) chunks.push(c);
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  env.sqlite3.capi.sqlite3_js_posix_create_file(name, bytes);
}

export function listFiles(env: SqliteEnv): string[] {
  return env.pool ? env.pool.getFileNames() : [];
}

export function removeFile(env: SqliteEnv, name: string): void {
  if (env.pool) env.pool.unlink(name);
}
