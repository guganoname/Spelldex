/**
 * Domain types shared by the data build, the data worker and the UI.
 * The primary key of a printing is the Scryfall id (MTGJSON ships it per printing);
 * the primary key of a "card" (all printings with identical rules) is the Scryfall oracle id.
 */

export type ScryfallId = string;
export type OracleId = string;

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/** Accent used to tint the device screen: one color, gold for multicolor, silver for colorless. */
export type ColorAccent = Color | 'multi' | 'colorless';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
export type Finish = 'nonfoil' | 'foil' | 'etched';
export type Legality = 'legal' | 'not_legal' | 'restricted' | 'banned';

/** Formats we show; keys match MTGJSON `legalities`. */
export const FORMATS = [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'brawl', 'historic', 'timeless',
] as const;
export type Format = (typeof FORMATS)[number];

export interface CardFace {
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
}

/** Small row for lists, search results and scan candidates. */
export interface CardSummary {
  scryfallId: ScryfallId;
  oracleId: OracleId;
  name: string;
  /** German name if MTGJSON has a translation, else null. */
  nameDe: string | null;
  setCode: string;
  collectorNumber: string;
  rarity: Rarity;
  manaCost: string | null;
  typeLine: string;
  colors: Color[];
  colorIdentity: Color[];
  /** True when the printing has a back-face image (transform, MDFC, ...). */
  hasBackFace: boolean;
}

export interface StrengthScore {
  /** 0..100, transparent weighted score computed in the data build. */
  score: number;
  /** Component values 0..1 so the UI can explain the score. */
  parts: { popularity: number; combos: number; formats: number; market: number };
}

export interface CardDetail extends CardSummary {
  oracleText: string | null;
  textDe: string | null;
  typeLineDe: string | null;
  flavorText: string | null;
  artist: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  manaValue: number;
  keywords: string[];
  layout: string;
  faces: CardFace[] | null;
  legalities: Partial<Record<Format, Legality>>;
  edhrecRank: number | null;
  finishes: Finish[];
  cardmarketId: number | null;
  releaseDate: string;
  setName: string;
  /** Plane key from the lore data (set -> plane), null if unknown. */
  plane: string | null;
  /** Archetype tags from the rule-based tagger, e.g. "ramp", "draw". */
  tags: string[];
  strength: StrengthScore | null;
  comboCount: number;
  printingCount: number;
}

export interface Printing {
  scryfallId: ScryfallId;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: Rarity;
  releaseDate: string;
  artist: string | null;
  finishes: Finish[];
  isPromo: boolean;
  hasBackFace: boolean;
}

export interface SetInfo {
  code: string;
  name: string;
  releaseDate: string;
  type: string;
  /** Printings of this set in the catalog (what set progress counts against). */
  printingCount: number;
  parentCode: string | null;
  plane: string | null;
  /** Keyrune icon code from MTGJSON (for the set symbol font, optional). */
  keyruneCode: string | null;
}

export interface ComboSummary {
  id: string;
  /** Card names in the combo. */
  cards: string[];
  /** Results, e.g. "Infinite mana". */
  produces: string[];
  identity: string;
  popularity: number | null;
  /** Link to Commander Spellbook (attribution required). */
  url: string;
}

export type ColorMatch = 'any' | 'all' | 'exact' | 'identity';
export type SearchSort = 'relevance' | 'name' | 'release' | 'edhrec' | 'strength';

export interface SearchQuery {
  /** Free text, matched with FTS5 against name (en + de), type line and rules text. */
  text?: string;
  colors?: Color[];
  colorMatch?: ColorMatch;
  /** Words that must appear in the type line, e.g. ["Creature", "Dragon"]. */
  types?: string[];
  setCode?: string;
  format?: Format;
  tags?: string[];
  rarity?: Rarity[];
  sort?: SearchSort;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  items: CardSummary[];
}

export function colorAccent(colors: readonly Color[]): ColorAccent {
  if (colors.length === 0) return 'colorless';
  if (colors.length > 1) return 'multi';
  return colors[0]!;
}
