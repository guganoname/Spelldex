/** Adapts node:sqlite to the shared Db interface (data build and tests). */
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParams } from '@spelldex/shared/catalog';

export function nodeDb(path: string, readOnly = false): Db & { close(): void } {
  const db = new DatabaseSync(path, { readOnly });
  const bind = (p?: SqlParams) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, p) => void db.prepare(sql).run(...(bind(p) as never[])),
    all: <T>(sql: string, p?: SqlParams) => db.prepare(sql).all(...(bind(p) as never[])) as T[],
    get: <T>(sql: string, p?: SqlParams) => db.prepare(sql).get(...(bind(p) as never[])) as T | undefined,
    transaction: (fn) => {
      db.exec('BEGIN');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => db.close(),
  };
}
