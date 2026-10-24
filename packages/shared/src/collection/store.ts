/**
 * Collection store (collection.db): "seen" and "owned" like a Pokédex, plus an append-only
 * event log that is the export format and the base for a later sync. Pure over the Db interface.
 * Kept separate from the catalog so catalog updates never touch user data.
 */
import type { Db } from '../catalog/db.ts';
import type {
  CollectionEvent, CollectionExport, CollectionStats, OwnedEntry, SeenResult, SeenSource,
} from '../contracts/data.ts';
import type { CardSummary, ScryfallId } from '../contracts/card.ts';

export const COLLECTION_SCHEMA = 1;

const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS seen (
  scryfall_id TEXT PRIMARY KEY,
  oracle_id   TEXT NOT NULL,
  set_code    TEXT NOT NULL,
  first_at    TEXT NOT NULL,
  last_at     TEXT NOT NULL,
  scans       INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS seen_oracle ON seen(oracle_id);
CREATE INDEX IF NOT EXISTS seen_set ON seen(set_code);
CREATE INDEX IF NOT EXISTS seen_last ON seen(last_at);
CREATE TABLE IF NOT EXISTS owned (
  scryfall_id TEXT NOT NULL,
  finish      TEXT NOT NULL,
  lang        TEXT NOT NULL,
  condition   TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  oracle_id   TEXT NOT NULL,
  set_code    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (scryfall_id, finish, lang, condition)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS owned_set ON owned(set_code);
CREATE TABLE IF NOT EXISTS goals (key TEXT PRIMARY KEY, scope TEXT NOT NULL, created_at TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL,
  type    TEXT NOT NULL,
  payload TEXT NOT NULL
);
`;

/** Resolves printings from the catalog (the store only keeps ids). */
export type SummaryLookup = (id: ScryfallId) => CardSummary | null;

export class CollectionStore {
  constructor(private readonly db: Db, private readonly now: () => string = () => new Date().toISOString()) {
    db.exec(DDL);
    db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema', ?)`, [String(COLLECTION_SCHEMA)]);
  }

  private log(e: CollectionEvent) {
    const { type, at, ...payload } = e;
    this.db.run('INSERT INTO events (at, type, payload) VALUES (?, ?, ?)', [at, type, JSON.stringify(payload)]);
  }

  private applySeen(card: Pick<CardSummary, 'scryfallId' | 'oracleId' | 'setCode'>, source: SeenSource, at: string): SeenResult {
    const newCard = !this.db.get('SELECT 1 FROM seen WHERE oracle_id = ? LIMIT 1', [card.oracleId]);
    const newPrinting = !this.db.get('SELECT 1 FROM seen WHERE scryfall_id = ?', [card.scryfallId]);
    this.db.run(
      `INSERT INTO seen (scryfall_id, oracle_id, set_code, first_at, last_at, scans, views)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scryfall_id) DO UPDATE SET last_at = excluded.last_at,
         scans = scans + excluded.scans, views = views + excluded.views`,
      [card.scryfallId, card.oracleId, card.setCode, at, at, source === 'scan' ? 1 : 0, source === 'view' ? 1 : 0],
    );
    return { newCard, newPrinting };
  }

  markSeen(card: CardSummary, source: SeenSource): SeenResult {
    const at = this.now();
    return this.db.transaction(() => {
      const r = this.applySeen(card, source, at);
      // Views of already-seen printings are not worth an event; scans and first sightings are.
      if (r.newPrinting || source !== 'view') {
        this.log({ type: 'seen', at, scryfallId: card.scryfallId, oracleId: card.oracleId, source });
      }
      return r;
    });
  }

  isSeen(ids: ScryfallId[]): Record<ScryfallId, boolean> {
    const out: Record<ScryfallId, boolean> = Object.fromEntries(ids.map((id) => [id, false]));
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const r of this.db.all<{ scryfall_id: string }>(
        `SELECT scryfall_id FROM seen WHERE scryfall_id IN (${chunk.map(() => '?').join(',')})`,
        chunk,
      )) out[r.scryfall_id] = true;
    }
    return out;
  }

  private applyOwned(e: OwnedEntry, card: Pick<CardSummary, 'oracleId' | 'setCode'>, at: string) {
    if (e.quantity <= 0) {
      this.db.run('DELETE FROM owned WHERE scryfall_id = ? AND finish = ? AND lang = ? AND condition = ?',
        [e.scryfallId, e.finish, e.lang, e.condition]);
    } else {
      this.db.run(
        `INSERT INTO owned (scryfall_id, finish, lang, condition, quantity, oracle_id, set_code, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scryfall_id, finish, lang, condition) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
        [e.scryfallId, e.finish, e.lang, e.condition, e.quantity, card.oracleId, card.setCode, at],
      );
    }
  }

  /** Sets the absolute quantity for one (printing, finish, language, condition); 0 removes it. Owning implies seen. */
  setOwned(entry: OwnedEntry, card: CardSummary): void {
    const at = this.now();
    this.db.transaction(() => {
      this.applySeen(card, 'import', at);
      this.applyOwned(entry, card, at);
      this.log({ type: 'owned', at, entry });
    });
  }

  getOwned(id: ScryfallId): OwnedEntry[] {
    return this.db.all<OwnedEntry>(
      `SELECT scryfall_id AS scryfallId, finish, lang, condition, quantity FROM owned WHERE scryfall_id = ? ORDER BY finish, lang`,
      [id],
    );
  }

  countSet(setCode: string): { seen: number; owned: number } {
    const code = setCode.toUpperCase();
    return {
      seen: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM seen WHERE set_code = ?', [code])?.n ?? 0,
      owned: this.db.get<{ n: number }>('SELECT COUNT(DISTINCT scryfall_id) AS n FROM owned WHERE set_code = ?', [code])?.n ?? 0,
    };
  }

  countSets(codes: string[]): { seen: number; owned: number } {
    return codes.reduce((acc, c) => {
      const r = this.countSet(c);
      return { seen: acc.seen + r.seen, owned: acc.owned + r.owned };
    }, { seen: 0, owned: 0 });
  }

  stats(): CollectionStats {
    return {
      seenCards: this.db.get<{ n: number }>('SELECT COUNT(DISTINCT oracle_id) AS n FROM seen')?.n ?? 0,
      seenPrintings: this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM seen')?.n ?? 0,
      ownedCopies: this.db.get<{ n: number }>('SELECT COALESCE(SUM(quantity), 0) AS n FROM owned')?.n ?? 0,
      lastSeenAt: this.db.get<{ v: string | null }>('SELECT MAX(last_at) AS v FROM seen')?.v ?? null,
    };
  }

  recent(limit = 20): { scryfallId: ScryfallId; at: string }[] {
    return this.db.all<{ scryfallId: string; at: string }>(
      'SELECT scryfall_id AS scryfallId, last_at AS at FROM seen ORDER BY last_at DESC LIMIT ?', [limit],
    );
  }

  exportJson(): CollectionExport {
    const events = this.db
      .all<{ at: string; type: string; payload: string }>('SELECT at, type, payload FROM events ORDER BY id')
      .map((r) => ({ type: r.type, at: r.at, ...JSON.parse(r.payload) }) as CollectionEvent);
    const exportedAt = this.now();
    this.db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('export_at', ?), ('export_cards', ?)`,
      [exportedAt, String(this.stats().seenCards)]);
    return { format: 'spelldex-collection', schema: 1, exportedAt, events };
  }

  /** Replays an export on top of the current data (idempotent for seen, last write wins for owned). */
  importJson(data: CollectionExport, lookup: SummaryLookup): { events: number; unknown: number } {
    if (data.format !== 'spelldex-collection' || data.schema !== 1) throw new Error('Unbekanntes Exportformat');
    let unknown = 0;
    this.db.transaction(() => {
      for (const e of data.events) {
        if (e.type === 'seen') {
          const card = lookup(e.scryfallId) ?? null;
          if (!card) { unknown++; continue; }
          this.applySeen(card, e.source, e.at);
        } else if (e.type === 'owned') {
          const card = lookup(e.entry.scryfallId);
          if (!card) { unknown++; continue; }
          this.applyOwned(e.entry, card, e.at);
        }
        this.log(e);
      }
    });
    return { events: data.events.length, unknown };
  }

  newSinceExport(): number {
    const at = this.db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'export_cards'`)?.value;
    return this.stats().seenCards - Number(at ?? 0);
  }
}
