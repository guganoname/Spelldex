/** A text in both app languages. The UI picks one with `loc(l, lang)`. */
export interface Loc {
  de: string;
  en: string;
}

export type DexLang = 'de' | 'en';

/**
 * Units of numeric stats. Mass and length scale automatically when formatted
 * (kg -> g or t, m -> cm or km), so the generator always stores kg and m.
 */
export type DexUnit =
  | 'm' | 'kg' | 'kmh' | 'knots' | 'hp' | 'kw' | 'celsius' | 'years' | 'hours' | 'seconds'
  | 'km2' | 'db' | 'liters' | 'percent' | 'rating10' | 'stars' | 'count' | 'mana' | 'newton' | 'lumen';

export interface DexStat {
  /** Stable key, e.g. "height", "horsepower". */
  id: string;
  label: Loc;
  /** Numeric value in `unit`, or `text` for qualitative stats. */
  value?: number;
  unit?: DexUnit;
  text?: Loc;
}

export type DexKind =
  | 'creature' | 'vehicle' | 'equipment' | 'artifact' | 'planeswalker' | 'land' | 'spell' | 'enchantment' | 'battle';

export interface DexEntry {
  kind: DexKind;
  /** Pokédex-style category, e.g. "Flammen-Drache" / "Flame Dragon". */
  category: Loc;
  habitat: Loc;
  /** Physical specs (size, weight, horsepower, ...). */
  specs: DexStat[];
  /** Playful extras (danger level, favourite snack, ...). */
  funny: DexStat[];
  /** Short background paragraph composed from templates. */
  entry: Loc;
}

/** Minimal card data the generator needs; built from CardDetail with `dexInputFromCard`. */
export interface DexInput {
  /** Seed for the deterministic jitter, normally the oracle id (+ face index). */
  seed: string;
  name: string;
  typeLine: string;
  /** German type line (MTGJSON), used to name subtypes we have no table entry for. */
  typeLineDe: string | null;
  oracleText: string | null;
  flavorText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  manaValue: number;
  keywords: string[];
  colors: ('W' | 'U' | 'B' | 'R' | 'G')[];
  rarity: string;
  /** Plane display name from the lore bundle, if known. */
  plane: Loc | null;
}
