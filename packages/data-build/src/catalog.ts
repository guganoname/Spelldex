/**
 * Builds catalog.db from MTGJSON sets. One printing row per Scryfall id (MTGJSON has one entry
 * per face, grouped here), one oracle row per Scryfall oracle id.
 */
import { DatabaseSync } from 'node:sqlite';
import {
  CATALOG_DDL, CATALOG_FINALIZE, CATALOG_SCHEMA, DEVICE_BUILD, collectorNumberSort, encodeColors,
} from '@spelldex/shared/catalog';
import { FORMATS, type CardFace } from '@spelldex/shared/contracts';
import {
  makeStrengthScorer, tagRules, type ComboRef, type RuleSet, type ScoreConfig,
} from '@spelldex/shared/rules';
import type { MtgjsonCard, MtgjsonSet } from './mtgjson.ts';

/** Layouts whose printings have a separate back-face image on Scryfall. */
const BACK_FACE_LAYOUTS = new Set(['transform', 'modal_dfc', 'reversible_card', 'double_faced_token', 'battle']);
const SKIP_SET_TYPES = new Set(['token', 'memorabilia', 'minigame']);

export interface CatalogInput {
  sets: AsyncIterable<MtgjsonSet>;
  setPlanes?: Record<string, string | null>;
  combos?: Map<string, ComboRef[]>;
  /** Total combos per oracle id (combos holds only the top few). */
  comboCounts?: Map<string, number>;
  rules: RuleSet;
  score: ScoreConfig;
  /** Latest Cardmarket price per MTGJSON uuid, if the price import ran. */
  prices?: Map<string, number>;
  version: string;
  /** Build the FTS index into the file (tests, tools). The shipped catalog leaves it to the device. */
  buildFts?: boolean;
}

export interface CatalogResult {
  stats: CatalogStats;
  /** MTGJSON uuid -> Scryfall id, for artifacts keyed by printing (price shards). */
  uuidToScryfall: Map<string, string>;
}

export interface CatalogStats {
  sets: number;
  printings: number;
  cards: number;
  combos: number;
  skipped: number;
}

interface OracleAcc {
  oracleId: string;
  faces: MtgjsonCard[];
  edhrecRank: number | null;
  /** Candidates for the default printing: [releaseDate, rank, scryfallId]. */
  best: { key: string; scryfallId: string } | null;
  de: { name: string; type: string | null; text: string | null; date: string } | null;
}

const legality = (v: string) => v.toLowerCase().replace(/\s+/g, '_');
const SHOWN_FORMATS = new Set<string>(FORMATS);

function joinFaces<T>(faces: MtgjsonCard[], f: (c: MtgjsonCard) => T | undefined, sep: string): string | null {
  const parts = faces.map(f).filter((v): v is T => v != null && v !== '');
  return parts.length ? parts.join(sep) : null;
}

export async function buildCatalog(dbPath: string, input: CatalogInput): Promise<CatalogResult> {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA page_size = 4096;');
  db.exec(CATALOG_DDL);

  const insSet = db.prepare(
    `INSERT INTO sets (code, name, release_date, type, parent_code, plane, keyrune_code) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insPrint = db.prepare(
    `INSERT OR IGNORE INTO printing (scryfall_id, oracle_id, set_code, collector_number, number_sort,
       rarity, artist, flavor_text, frame_version, finishes, is_promo, is_variant, has_back_face, cardmarket_id, illustration_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const oracles = new Map<string, OracleAcc>();
  const uuidToScryfall = new Map<string, string>();
  const stats: CatalogStats = { sets: 0, printings: 0, cards: 0, combos: 0, skipped: 0 };

  db.exec('BEGIN');
  for await (const set of input.sets) {
    if (set.isOnlineOnly || SKIP_SET_TYPES.has(set.type)) continue;
    const code = set.code.toUpperCase();
    insSet.run(code, set.name, set.releaseDate, set.type, set.parentCode?.toUpperCase() ?? null,
      input.setPlanes?.[code] ?? null, set.keyruneCode ?? null);
    stats.sets++;

    // Group faces of one printing.
    const byPrint = new Map<string, MtgjsonCard[]>();
    for (const c of set.cards) {
      const sid = c.identifiers.scryfallId;
      const oid = c.identifiers.scryfallOracleId;
      if (!sid || !oid || c.isOnlineOnly || (c.availability && !c.availability.includes('paper'))) {
        stats.skipped++;
        continue;
      }
      const list = byPrint.get(sid) ?? [];
      list.push(c);
      byPrint.set(sid, list);
    }

    for (const [sid, facesRaw] of byPrint) {
      const faces = [...facesRaw].sort((a, b) => (a.side ?? 'a').localeCompare(b.side ?? 'a'));
      const c = faces[0]!;
      const oid = c.identifiers.scryfallOracleId!;
      const isVariant =
        !!c.isAlternative || c.borderColor === 'borderless' ||
        !!c.frameEffects?.some((e) => e === 'showcase' || e === 'extendedart');
      insPrint.run(
        sid, oid, code, c.number, collectorNumberSort(c.number), c.rarity,
        [...new Set(faces.map((f) => f.artist).filter(Boolean))].join(' & ') || null,
        joinFaces(faces, (f) => f.flavorText, '\n'),
        c.frameVersion ?? null, JSON.stringify(c.finishes ?? []), c.isPromo ? 1 : 0, isVariant ? 1 : 0,
        BACK_FACE_LAYOUTS.has(c.layout) ? 1 : 0, c.identifiers.mcmId ? Number(c.identifiers.mcmId) : null,
        c.identifiers.scryfallIllustrationId ?? null,
      );
      stats.printings++;
      for (const f of faces) uuidToScryfall.set(f.uuid, sid);

      const acc = oracles.get(oid) ?? { oracleId: oid, faces, edhrecRank: null, best: null, de: null };
      if (c.edhrecRank != null) acc.edhrecRank = Math.min(acc.edhrecRank ?? Infinity, c.edhrecRank);
      // Default printing: newest regular paper printing (non-promo, non-variant), then lowest number.
      const regular = !c.isPromo && !isVariant ? '1' : '0';
      const key = `${regular}|${set.releaseDate}|${String(1e9 - collectorNumberSort(c.number)).padStart(10, '0')}`;
      if (!acc.best || key > acc.best.key) {
        acc.best = { key, scryfallId: sid };
        acc.faces = faces;
      }
      const deFaces = faces.map((f) => f.foreignData?.find((x) => x.language === 'German'));
      if (deFaces[0] && (!acc.de || set.releaseDate > acc.de.date)) {
        acc.de = {
          name: deFaces.length > 1 ? deFaces.map((d) => d?.faceName ?? d?.name).filter(Boolean).join(' // ') : deFaces[0].name,
          type: deFaces.map((d) => d?.type).filter(Boolean).join(' // ') || null,
          text: deFaces.map((d) => d?.text).filter(Boolean).join('\n//\n') || null,
          date: set.releaseDate,
        };
      }
      oracles.set(oid, acc);
    }
  }

  // Oracle rows.
  const tag = tagRules(input.rules);
  const maxRank = Math.max(2, ...[...oracles.values()].map((o) => o.edhrecRank ?? 0));
  const scorer = makeStrengthScorer(input.score, maxRank);
  const insOracle = db.prepare(
    `INSERT INTO oracle (oracle_id, name, name_de, mana_cost, mana_value, type_line, type_line_de, oracle_text, text_de,
       colors, color_identity, power, toughness, loyalty, defense, keywords, legalities, layout, faces, edhrec_rank,
       tags, strength, strength_parts, combo_count, default_print)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insTag = db.prepare('INSERT OR IGNORE INTO oracle_tag (tag, oracle_id) VALUES (?, ?)');
  const insCombo = db.prepare('INSERT OR IGNORE INTO combo (id, cards, produces, identity, popularity, url) VALUES (?, ?, ?, ?, ?, ?)');
  const insOracleCombo = db.prepare('INSERT OR IGNORE INTO oracle_combo (oracle_id, combo_id) VALUES (?, ?)');
  const comboIds = new Set<string>();

  for (const acc of oracles.values()) {
    const faces = acc.faces;
    const c = faces[0]!;
    const multi = faces.length > 1;
    const faceRows: CardFace[] | null = multi
      ? faces.map((f) => ({
          name: f.faceName ?? f.name,
          manaCost: f.manaCost ?? null,
          typeLine: f.type,
          oracleText: f.text ?? null,
          power: f.power ?? null,
          toughness: f.toughness ?? null,
          loyalty: f.loyalty ?? null,
          defense: f.defense ?? null,
        }))
      : null;
    const keywords = [...new Set(faces.flatMap((f) => f.keywords ?? []))];
    const text = joinFaces(faces, (f) => f.text, '\n//\n');
    const typeLine = joinFaces(faces, (f) => f.type, ' // ') ?? c.type;
    const legalities = Object.fromEntries(
      Object.entries(c.legalities ?? {})
        .map(([k, v]) => [k, legality(v)] as const)
        .filter(([k, v]) => SHOWN_FORMATS.has(k) && v !== 'not_legal'),
    );
    const combos = input.combos?.get(acc.oracleId) ?? [];
    const tags = tag({ text: text ?? '', type: typeLine, keywords });
    const strength = scorer({
      edhrecRank: acc.edhrecRank,
      comboCount: input.comboCounts?.get(acc.oracleId) ?? combos.length,
      legalities,
      priceEur: input.prices?.get(c.uuid) ?? null,
    });

    insOracle.run(
      acc.oracleId, c.name, acc.de?.name ?? null,
      multi ? joinFaces(faces, (f) => f.manaCost, ' // ') : c.manaCost ?? null,
      c.manaValue ?? 0, typeLine, acc.de?.type ?? null, text, acc.de?.text ?? null,
      encodeColors(faces.flatMap((f) => f.colors ?? [])), encodeColors(c.colorIdentity),
      c.power ?? null, c.toughness ?? null, c.loyalty ?? null, c.defense ?? null,
      JSON.stringify(keywords), JSON.stringify(legalities), c.layout,
      faceRows ? JSON.stringify(faceRows) : null, acc.edhrecRank, JSON.stringify(tags),
      strength.score, JSON.stringify(strength.parts), input.comboCounts?.get(acc.oracleId) ?? combos.length,
      acc.best?.scryfallId ?? null,
    );
    for (const t of tags) insTag.run(t, acc.oracleId);
    for (const combo of combos) {
      if (!comboIds.has(combo.id)) {
        comboIds.add(combo.id);
        insCombo.run(combo.id, JSON.stringify(combo.cards), JSON.stringify(combo.produces), combo.identity ?? '',
          combo.popularity, `https://commanderspellbook.com/combo/${encodeURIComponent(combo.id)}/`);
      }
      insOracleCombo.run(acc.oracleId, combo.id);
    }
    stats.cards++;
  }
  stats.combos = comboIds.size;

  const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  insMeta.run('schema', String(CATALOG_SCHEMA));
  insMeta.run('version', input.version);
  insMeta.run('built_at', new Date().toISOString());
  db.exec('COMMIT');
  db.exec(CATALOG_FINALIZE);
  if (input.buildFts) db.exec(DEVICE_BUILD);
  db.exec('VACUUM');
  db.close();
  return { stats, uuidToScryfall };
}
