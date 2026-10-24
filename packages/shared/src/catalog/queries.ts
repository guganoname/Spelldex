/**
 * All catalog reads. Pure functions over the Db interface, so the same code runs in the data
 * worker (sqlite-wasm) and in tests (better-sqlite3).
 */
import type {
  CardDetail, CardFace, CardSummary, ComboSummary, Finish, Format, Legality, Printing, Rarity,
  SearchQuery, SearchResult, SetInfo, StrengthScore,
} from '../contracts/card.ts';
import type { Db, SqlValue } from './db.ts';
import { decodeColors, encodeColors, parseJson } from './codec.ts';

const SUMMARY_COLS = `
  p.scryfall_id, p.oracle_id, o.name, o.name_de, p.set_code, p.collector_number, p.rarity,
  o.mana_cost, o.type_line, o.colors, o.color_identity, p.has_back_face`;

interface SummaryRow {
  scryfall_id: string; oracle_id: string; name: string; name_de: string | null; set_code: string;
  collector_number: string; rarity: string; mana_cost: string | null; type_line: string;
  colors: string; color_identity: string; has_back_face: number;
}

function toSummary(r: SummaryRow): CardSummary {
  return {
    scryfallId: r.scryfall_id,
    oracleId: r.oracle_id,
    name: r.name,
    nameDe: r.name_de,
    setCode: r.set_code,
    collectorNumber: r.collector_number,
    rarity: r.rarity as Rarity,
    manaCost: r.mana_cost,
    typeLine: r.type_line,
    colors: decodeColors(r.colors),
    colorIdentity: decodeColors(r.color_identity),
    hasBackFace: r.has_back_face === 1,
  };
}

interface DetailRow extends SummaryRow {
  oracle_text: string | null; text_de: string | null; type_line_de: string | null;
  flavor_text: string | null; artist: string | null; power: string | null; toughness: string | null;
  loyalty: string | null; defense: string | null; mana_value: number; keywords: string;
  layout: string; faces: string | null; legalities: string; edhrec_rank: number | null;
  finishes: string; cardmarket_id: number | null; release_date: string; set_name: string;
  plane: string | null; tags: string; strength: number | null; strength_parts: string | null;
  combo_count: number; printing_count: number;
}

const DETAIL_SQL = `
  SELECT ${SUMMARY_COLS},
    o.oracle_text, o.text_de, o.type_line_de, p.flavor_text, p.artist, o.power, o.toughness,
    o.loyalty, o.defense, o.mana_value, o.keywords, o.layout, o.faces, o.legalities, o.edhrec_rank,
    p.finishes, p.cardmarket_id, s.release_date, s.name AS set_name, s.plane, o.tags, o.strength,
    o.strength_parts, o.combo_count,
    (SELECT COUNT(*) FROM printing p2 WHERE p2.oracle_id = p.oracle_id) AS printing_count
  FROM printing p
  JOIN oracle o ON o.oracle_id = p.oracle_id
  JOIN sets s ON s.code = p.set_code`;

function toDetail(r: DetailRow): CardDetail {
  const parts = parseJson<StrengthScore['parts'] | null>(r.strength_parts, null);
  return {
    ...toSummary(r),
    oracleText: r.oracle_text,
    textDe: r.text_de,
    typeLineDe: r.type_line_de,
    flavorText: r.flavor_text,
    artist: r.artist,
    power: r.power,
    toughness: r.toughness,
    loyalty: r.loyalty,
    defense: r.defense,
    manaValue: r.mana_value,
    keywords: parseJson<string[]>(r.keywords, []),
    layout: r.layout,
    faces: parseJson<CardFace[] | null>(r.faces, null),
    legalities: parseJson<Partial<Record<Format, Legality>>>(r.legalities, {}),
    edhrecRank: r.edhrec_rank,
    finishes: parseJson<Finish[]>(r.finishes, []),
    cardmarketId: r.cardmarket_id,
    releaseDate: r.release_date,
    setName: r.set_name,
    plane: r.plane,
    tags: parseJson<string[]>(r.tags, []),
    strength: r.strength != null && parts ? { score: r.strength, parts } : null,
    comboCount: r.combo_count,
    printingCount: r.printing_count,
  };
}

export function getCard(db: Db, scryfallId: string): CardDetail | null {
  const r = db.get<DetailRow>(`${DETAIL_SQL} WHERE p.scryfall_id = ?`, [scryfallId]);
  return r ? toDetail(r) : null;
}

export function getCardByOracle(db: Db, oracleId: string): CardDetail | null {
  const r = db.get<DetailRow>(
    `${DETAIL_SQL} WHERE p.scryfall_id = (SELECT default_print FROM oracle WHERE oracle_id = ?)`,
    [oracleId],
  );
  return r ? toDetail(r) : null;
}

export function getSummaries(db: Db, ids: string[]): CardSummary[] {
  if (ids.length === 0) return [];
  const rows = db.all<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM printing p JOIN oracle o ON o.oracle_id = p.oracle_id
     WHERE p.scryfall_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const byId = new Map(rows.map((r) => [r.scryfall_id, toSummary(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export function findBySetNumber(db: Db, setCode: string, collectorNumber: string): CardSummary | null {
  const r = db.get<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM printing p JOIN oracle o ON o.oracle_id = p.oracle_id
     WHERE p.set_code = ? AND p.collector_number = ?`,
    [setCode.toUpperCase(), collectorNumber.replace(/^0+(?=\d)/, '')],
  );
  return r ? toSummary(r) : null;
}

export function getPrintings(db: Db, oracleId: string): Printing[] {
  return db
    .all<{
      scryfall_id: string; set_code: string; set_name: string; collector_number: string; rarity: string;
      release_date: string; artist: string | null; finishes: string; is_promo: number; has_back_face: number;
    }>(
      `SELECT p.scryfall_id, p.set_code, s.name AS set_name, p.collector_number, p.rarity, s.release_date,
              p.artist, p.finishes, p.is_promo, p.has_back_face
       FROM printing p JOIN sets s ON s.code = p.set_code
       WHERE p.oracle_id = ? ORDER BY s.release_date DESC, p.number_sort`,
      [oracleId],
    )
    .map((r) => ({
      scryfallId: r.scryfall_id,
      setCode: r.set_code,
      setName: r.set_name,
      collectorNumber: r.collector_number,
      rarity: r.rarity as Rarity,
      releaseDate: r.release_date,
      artist: r.artist,
      finishes: parseJson<Finish[]>(r.finishes, []),
      isPromo: r.is_promo === 1,
      hasBackFace: r.has_back_face === 1,
    }));
}

interface SetRow {
  code: string; name: string; release_date: string; type: string; printing_count: number;
  parent_code: string | null; plane: string | null; keyrune_code: string | null;
}
const toSet = (r: SetRow): SetInfo => ({
  code: r.code,
  name: r.name,
  releaseDate: r.release_date,
  type: r.type,
  printingCount: r.printing_count,
  parentCode: r.parent_code,
  plane: r.plane,
  keyruneCode: r.keyrune_code,
});

export function getSets(db: Db): SetInfo[] {
  return db.all<SetRow>(`SELECT * FROM sets WHERE printing_count > 0 ORDER BY release_date DESC`).map(toSet);
}

export function getSet(db: Db, code: string): SetInfo | null {
  const r = db.get<SetRow>(`SELECT * FROM sets WHERE code = ?`, [code.toUpperCase()]);
  return r ? toSet(r) : null;
}

export function getSetPrintings(db: Db, code: string): CardSummary[] {
  return db
    .all<SummaryRow>(
      `SELECT ${SUMMARY_COLS} FROM printing p JOIN oracle o ON o.oracle_id = p.oracle_id
       WHERE p.set_code = ? ORDER BY p.number_sort, p.collector_number`,
      [code.toUpperCase()],
    )
    .map(toSummary);
}

export function getCombos(db: Db, oracleId: string, limit = 20): ComboSummary[] {
  return db
    .all<{ id: string; cards: string; produces: string; identity: string; popularity: number | null; url: string }>(
      `SELECT c.* FROM oracle_combo oc JOIN combo c ON c.id = oc.combo_id
       WHERE oc.oracle_id = ? ORDER BY c.popularity DESC NULLS LAST LIMIT ?`,
      [oracleId, limit],
    )
    .map((r) => ({
      id: r.id,
      cards: parseJson<string[]>(r.cards, []),
      produces: parseJson<string[]>(r.produces, []),
      identity: r.identity,
      popularity: r.popularity,
      url: r.url,
    }));
}

export function randomCard(db: Db): CardSummary | null {
  const r = db.get<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM oracle o JOIN printing p ON p.scryfall_id = o.default_print
     WHERE o.rowid >= (ABS(RANDOM()) % (SELECT MAX(rowid) FROM oracle)) ORDER BY o.rowid LIMIT 1`,
  );
  return r ? toSummary(r) : null;
}

/** Turns user input into a safe FTS5 query: every word is a quoted prefix term. */
export function toFtsQuery(text: string): string | null {
  const words = text
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length > 0);
  if (words.length === 0) return null;
  return words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' ');
}

const SORTS: Record<NonNullable<SearchQuery['sort']>, string> = {
  relevance: 'match_rank, o.name',
  name: 'o.name',
  release: 's.release_date DESC, o.name',
  edhrec: 'o.edhrec_rank IS NULL, o.edhrec_rank, o.name',
  strength: 'o.strength IS NULL, o.strength DESC, o.name',
};

/** Card-level search (one row per oracle card, shown with its default printing). */
export function search(db: Db, q: SearchQuery): SearchResult {
  const where: string[] = [];
  const params: SqlValue[] = [];
  let from = `oracle o JOIN printing p ON p.scryfall_id = o.default_print JOIN sets s ON s.code = p.set_code`;
  let rank = '0 AS match_rank';

  const fts = q.text ? toFtsQuery(q.text) : null;
  if (fts) {
    from = `oracle_fts f JOIN ${from.replace('oracle o', 'oracle o ON o.rowid = f.rowid')}`;
    where.push('oracle_fts MATCH ?');
    params.push(fts);
    // Name hits first: weight the name columns over type line and rules text.
    rank = 'bm25(oracle_fts, 10.0, 10.0, 2.0, 1.0) AS match_rank';
  }

  if (q.colors && q.colors.length > 0) {
    const enc = encodeColors(q.colors);
    const mode = q.colorMatch ?? 'any';
    if (mode === 'exact') {
      where.push('o.colors = ?');
      params.push(enc);
    } else if (mode === 'identity') {
      // Commander-style: the card's identity is a subset of the chosen colors.
      const excluded = [...'WUBRG'].filter((c) => !enc.includes(c));
      if (excluded.length) where.push(`NOT (${excluded.map((c) => `instr(o.color_identity, '${c}') > 0`).join(' OR ')})`);
    } else {
      const parts = [...enc].map((c) => `instr(o.colors, '${c}') > 0`);
      where.push(`(${parts.join(mode === 'all' ? ' AND ' : ' OR ')})`);
    }
  }

  for (const t of q.types ?? []) {
    where.push(`(' ' || o.type_line || ' ') LIKE ?`);
    params.push(`% ${t.replace(/[%_]/g, '')} %`);
  }
  if (q.setCode) {
    where.push('EXISTS (SELECT 1 FROM printing px WHERE px.oracle_id = o.oracle_id AND px.set_code = ?)');
    params.push(q.setCode.toUpperCase());
  }
  if (q.format) {
    where.push(`json_extract(o.legalities, '$.' || ?) IN ('legal', 'restricted')`);
    params.push(q.format);
  }
  for (const tag of q.tags ?? []) {
    where.push('EXISTS (SELECT 1 FROM oracle_tag t WHERE t.tag = ? AND t.oracle_id = o.oracle_id)');
    params.push(tag);
  }
  if (q.rarity && q.rarity.length > 0) {
    where.push(`p.rarity IN (${q.rarity.map(() => '?').join(',')})`);
    params.push(...q.rarity);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = SORTS[q.sort ?? (fts ? 'relevance' : 'name')];
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);

  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`, params)?.n ?? 0;
  const rows = db.all<SummaryRow>(
    `SELECT ${SUMMARY_COLS}, ${rank} FROM ${from} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { total, items: rows.map(toSummary) };
}

/** Builds the full-text index if the catalog ships without it. Returns true if it had to build. */
export function ensureFts(db: Db, build: string): boolean {
  if (db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'fts'`)?.value === 'ready') return false;
  db.transaction(() => db.exec(build));
  return true;
}

export function catalogCounts(db: Db): { printings: number; cards: number; version: string | null } {
  return {
    printings: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM printing')?.n ?? 0,
    cards: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM oracle')?.n ?? 0,
    version: db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'version'`)?.value ?? null,
  };
}
