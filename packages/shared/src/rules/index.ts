/**
 * Rule-based tagger, strength score and Commander Spellbook indexer as pure functions (no I/O).
 * Owned by the data/lore thread; the data build calls them. Rules and weights live in ./config.
 */
import type { StrengthScore } from '../contracts/card.ts';

export interface TagRule {
  tag: string;
  label_de: string;
  /** Regex sources, matched case-insensitively. */
  text?: string[];
  type?: string[];
  keywords?: string[];
  /** If any of these regexes match the oracle text, the rule does not apply. */
  not?: string[];
}
export interface RuleSet { version: number; rules: TagRule[] }

export interface TaggableCard { text?: string; type?: string; keywords?: string[] }

export function tagRules(rules: RuleSet): (card: TaggableCard) => string[] {
  const rx = (a?: string[]) => (a ?? []).map((x) => new RegExp(x, 'i'));
  const compiled = rules.rules.map((r) => ({
    tag: r.tag,
    text: rx(r.text),
    type: rx(r.type),
    not: rx(r.not),
    keywords: new Set((r.keywords ?? []).map((k) => k.toLowerCase())),
  }));
  return (card) => {
    const text = card.text ?? '';
    const type = card.type ?? '';
    return compiled
      .filter(
        (r) =>
          !r.not.some((re) => re.test(text)) &&
          (r.text.some((re) => re.test(text)) ||
            r.type.some((re) => re.test(type)) ||
            (card.keywords ?? []).some((k) => r.keywords.has(k.toLowerCase()))),
      )
      .map((r) => r.tag);
  };
}

export interface ScoreConfig {
  weights: { popularity: number; combos: number; formats: number; market: number };
  /** Combo count at which the combo component saturates (default 25). */
  combosCap?: number;
  /** Formats that count towards the breadth component. */
  formatKeys?: string[];
  /** Price in EUR at which the market component saturates (default 50). */
  marketCapEur?: number;
}

export interface StrengthInput {
  edhrecRank?: number | null;
  comboCount: number;
  legalities?: Record<string, string>;
  priceEur?: number | null;
}

const DEFAULT_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'historic', 'brawl'];
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Transparent 0..100 score; every component is returned (0..1) so the UI can explain it. */
export function makeStrengthScorer(cfg: ScoreConfig, maxEdhrecRank: number): (i: StrengthInput) => StrengthScore {
  const w = cfg.weights;
  const total = w.popularity + w.combos + w.formats + w.market || 1;
  const combosCap = cfg.combosCap ?? 25;
  const formatKeys = cfg.formatKeys ?? DEFAULT_FORMATS;
  const marketCap = cfg.marketCapEur ?? 50;
  const logMax = Math.log(Math.max(maxEdhrecRank, 2));
  return (i) => {
    // Rank 1 = most popular. Log scale so rank 100 is not drowned by rank 20000.
    const popularity = i.edhrecRank ? Math.max(0, 1 - Math.log(i.edhrecRank) / logMax) : 0;
    const combos = Math.sqrt(Math.min(i.comboCount, combosCap) / combosCap);
    const legal = formatKeys.filter((f) => i.legalities?.[f]?.toLowerCase() === 'legal').length;
    const formats = legal / formatKeys.length;
    const market = i.priceEur ? Math.min(i.priceEur, marketCap) / marketCap : 0;
    const score = Math.round(
      (100 * (w.popularity * popularity + w.combos * combos + w.formats * formats + w.market * market)) / total,
    );
    return {
      score,
      parts: { popularity: round2(popularity), combos: round2(combos), formats: round2(formats), market: round2(market) },
    };
  };
}

export interface ComboRef {
  id: string;
  cards: string[];
  produces: string[];
  popularity: number;
  identity: string | null;
}

/** One Commander Spellbook variant as found in variants.json (only the fields we read). */
export interface SpellbookVariant {
  id: string | number;
  status?: string;
  spoiler?: boolean;
  uses?: { card?: { name: string; oracleId?: string } }[];
  produces?: { feature?: { name?: string } }[];
  identity?: string | null;
  popularity?: number | null;
}

/**
 * Incremental index so the 700 MB bulk file can be streamed variant by variant.
 * Keeps, per oracle id, the total combo count and the `top` most relevant combos.
 */
export function makeSpellbookIndexer({ top = 5 }: { top?: number } = {}) {
  const byOracle = new Map<string, { count: number; top: ComboRef[] }>();
  const cmp = (a: ComboRef, b: ComboRef) =>
    b.popularity - a.popularity || a.cards.length - b.cards.length || a.id.localeCompare(b.id);
  const trim = (e: { top: ComboRef[] }) => {
    e.top.sort(cmp);
    e.top.length = Math.min(e.top.length, top);
  };
  return {
    addVariant(v: SpellbookVariant): void {
      if (v.status && v.status !== 'OK') return;
      if (v.spoiler) return; // unreleased cards are not shown
      const cards = (v.uses ?? []).map((u) => u.card).filter((c): c is { name: string; oracleId: string } => !!c?.oracleId);
      if (!cards.length) return;
      const ref: ComboRef = {
        id: String(v.id),
        cards: cards.map((c) => c.name),
        produces: (v.produces ?? []).map((p) => p.feature?.name).filter((n): n is string => !!n).slice(0, 5),
        popularity: v.popularity ?? 0, // null = never seen in a deck
        identity: v.identity ?? null,
      };
      for (const oid of new Set(cards.map((c) => c.oracleId))) {
        let e = byOracle.get(oid);
        if (!e) byOracle.set(oid, (e = { count: 0, top: [] }));
        e.count++;
        e.top.push(ref);
        if (e.top.length > top * 4) trim(e);
      }
    },
    /** oracleId -> top combos (sorted). Combo counts: see `counts`. */
    finish(): { combos: Map<string, ComboRef[]>; counts: Map<string, number> } {
      const combos = new Map<string, ComboRef[]>();
      const counts = new Map<string, number>();
      for (const [oid, e] of byOracle) {
        trim(e);
        combos.set(oid, e.top);
        counts.set(oid, e.count);
      }
      return { combos, counts };
    },
  };
}

/**
 * Convenience for small documents (tests, fixtures). For the real bulk file stream the variants
 * into makeSpellbookIndexer().addVariant instead of JSON.parse. NOTE: the list per oracle id is
 * capped to the top 5, so use `counts` from the indexer when the full count matters.
 */
export function parseSpellbookVariants(doc: unknown): Map<string, ComboRef[]> {
  const ix = makeSpellbookIndexer({ top: Number.MAX_SAFE_INTEGER / 8 });
  for (const v of (doc as { variants?: SpellbookVariant[] }).variants ?? []) ix.addVariant(v);
  return ix.finish().combos;
}

export const DEFAULT_RULES: RuleSet = { version: 0, rules: [] };
export const DEFAULT_SCORE: ScoreConfig = { weights: { popularity: 0.45, combos: 0.2, formats: 0.25, market: 0.1 } };
