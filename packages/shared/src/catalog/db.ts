/**
 * Minimal synchronous DB interface. The worker adapts sqlite-wasm to it, tests and the data build
 * adapt better-sqlite3. Query code depends only on this.
 */
export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): void;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlParams): T[];
  get<T = Record<string, SqlValue>>(sql: string, params?: SqlParams): T | undefined;
  transaction<T>(fn: () => T): T;
}
