/**
 * Catalog schema (catalog.db). Written by @spelldex/data-build, read-only in the app.
 * Bump CATALOG_SCHEMA on any breaking change; the manifest carries minAppSchema.
 *
 * Conventions: colors are stored as a sorted WUBRG string ("" = colorless), lists as JSON text,
 * legalities only for formats in FORMATS and only when not "not_legal" (keeps the file small).
 */

export const CATALOG_SCHEMA = 1;

export const CATALOG_DDL = /* sql */ `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE sets (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  release_date  TEXT NOT NULL,
  type          TEXT NOT NULL,
  printing_count INTEGER NOT NULL DEFAULT 0,
  parent_code   TEXT,
  plane         TEXT,
  keyrune_code  TEXT
) WITHOUT ROWID;

CREATE TABLE oracle (
  oracle_id      TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  name_de        TEXT,
  mana_cost      TEXT,
  mana_value     REAL NOT NULL DEFAULT 0,
  type_line      TEXT NOT NULL,
  type_line_de   TEXT,
  oracle_text    TEXT,
  text_de        TEXT,
  colors         TEXT NOT NULL,
  color_identity TEXT NOT NULL,
  power          TEXT,
  toughness      TEXT,
  loyalty        TEXT,
  defense        TEXT,
  keywords       TEXT NOT NULL DEFAULT '[]',
  legalities     TEXT NOT NULL DEFAULT '{}',
  layout         TEXT NOT NULL,
  faces          TEXT,
  edhrec_rank    INTEGER,
  tags           TEXT NOT NULL DEFAULT '[]',
  strength       INTEGER,
  strength_parts TEXT,
  combo_count    INTEGER NOT NULL DEFAULT 0,
  default_print  TEXT
);

CREATE TABLE printing (
  scryfall_id      TEXT PRIMARY KEY,
  oracle_id        TEXT NOT NULL,
  set_code         TEXT NOT NULL,
  collector_number TEXT NOT NULL,
  number_sort      INTEGER NOT NULL,
  rarity           TEXT NOT NULL,
  artist           TEXT,
  flavor_text      TEXT,
  frame_version    TEXT,
  finishes         TEXT NOT NULL DEFAULT '[]',
  is_promo         INTEGER NOT NULL DEFAULT 0,
  is_variant       INTEGER NOT NULL DEFAULT 0,
  has_back_face    INTEGER NOT NULL DEFAULT 0,
  cardmarket_id    INTEGER
) WITHOUT ROWID;
CREATE INDEX printing_oracle ON printing(oracle_id);
CREATE INDEX printing_set ON printing(set_code, number_sort, collector_number);

CREATE TABLE oracle_tag (
  tag       TEXT NOT NULL,
  oracle_id TEXT NOT NULL,
  PRIMARY KEY (tag, oracle_id)
) WITHOUT ROWID;

CREATE TABLE combo (
  id         TEXT PRIMARY KEY,
  cards      TEXT NOT NULL,
  produces   TEXT NOT NULL,
  identity   TEXT NOT NULL,
  popularity INTEGER,
  url        TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE oracle_combo (
  oracle_id TEXT NOT NULL,
  combo_id  TEXT NOT NULL,
  PRIMARY KEY (oracle_id, combo_id)
) WITHOUT ROWID;

CREATE VIRTUAL TABLE oracle_fts USING fts5(
  name, name_de, type_line, oracle_text,
  content='oracle', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
`;

/** Run after all oracle rows are inserted. */
export const CATALOG_FINALIZE = /* sql */ `
INSERT INTO oracle_fts(oracle_fts) VALUES ('rebuild');
UPDATE sets SET printing_count = (SELECT COUNT(*) FROM printing p WHERE p.set_code = sets.code);
INSERT INTO oracle_fts(oracle_fts) VALUES ('optimize');
ANALYZE;
`;
