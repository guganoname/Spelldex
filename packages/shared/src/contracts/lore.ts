/**
 * Curated lore. Owned editorially by the lore thread (packages/lore/content), bundled by the
 * data build into lore.json (LoreBundle). Rules:
 * - Summaries are our own words. Wiki pages appear only as links in `sources`, never copied text.
 * - `facts` (size, weight, age, ...) only with a canonical source; never invented.
 */

export type LoreKind = 'plane' | 'creature-type' | 'character' | 'event';
export type LoreStatus = 'draft' | 'reviewed';

export interface LoreSource {
  title: string;
  url: string;
  license?: string;
  /** Always true for wiki links: the source is a reference, nothing was copied. */
  referenceOnly?: boolean;
}

export interface LoreFact {
  label: string;
  value: string;
  unit?: string;
  /** Canonical source this fact comes from (required). */
  source: LoreSource;
}

export interface LoreEntry {
  /** Stable slug, unique within its kind, e.g. "innistrad", "dragon", "sorin-markov". */
  id: string;
  kind: LoreKind;
  name: { de: string; en: string };
  summary: { de: string; en?: string };
  status: LoreStatus;
  facts?: LoreFact[];
  /** Ids of related entries, written as "kind:id", e.g. "plane:innistrad". */
  related?: string[];
  sources: LoreSource[];
}

export interface LoreBundle {
  schema: 1;
  entries: LoreEntry[];
  /** Set code (upper case) -> plane id, or null if the set has no single plane. */
  setPlanes: Record<string, string | null>;
  /** Card name -> character id for legendary characters. */
  characterCards?: Record<string, string>;
}

export interface CardLore {
  plane: LoreEntry | null;
  creatureTypes: LoreEntry[];
  character: LoreEntry | null;
}

export const loreKey = (kind: LoreKind, id: string) => `${kind}:${id}`;
