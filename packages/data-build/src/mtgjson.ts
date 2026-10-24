/**
 * MTGJSON input. Two sources with the same shape:
 * - AllPrintings.json (optionally .gz), streamed set by set (the file is far too big for JSON.parse)
 * - a directory of per-set files `{ data: Set }` (fixtures, partial builds)
 * Only the fields we use are typed. Docs: https://mtgjson.com/data-models/
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { streamJson } from './streams.ts';

export interface MtgjsonForeign {
  language: string;
  name: string;
  faceName?: string;
  text?: string;
  type?: string;
  flavorText?: string;
}

export interface MtgjsonCard {
  uuid: string;
  name: string;
  faceName?: string;
  side?: string;
  manaCost?: string;
  manaValue?: number;
  type: string;
  text?: string;
  colors: string[];
  colorIdentity: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  keywords?: string[];
  legalities: Record<string, string>;
  edhrecRank?: number;
  layout: string;
  number: string;
  rarity: string;
  artist?: string;
  flavorText?: string;
  frameVersion?: string;
  frameEffects?: string[];
  borderColor?: string;
  finishes?: string[];
  isPromo?: boolean;
  isAlternative?: boolean;
  isOnlineOnly?: boolean;
  isFunny?: boolean;
  availability?: string[];
  identifiers: { scryfallId?: string; scryfallOracleId?: string; mcmId?: string };
  foreignData?: MtgjsonForeign[];
}

export interface MtgjsonSet {
  code: string;
  name: string;
  releaseDate: string;
  type: string;
  parentCode?: string;
  keyruneCode?: string;
  isOnlineOnly?: boolean;
  cards: MtgjsonCard[];
}

export async function* readMtgjsonSets(path: string): AsyncGenerator<MtgjsonSet> {
  const info = await stat(path);
  if (info.isDirectory()) {
    const files = (await readdir(path)).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) {
      const doc = JSON.parse(await readFile(join(path, f), 'utf8')) as { data: MtgjsonSet };
      yield doc.data;
    }
    return;
  }
  for await (const { value } of streamJson<MtgjsonSet>(path, 'data', 'object')) yield value;
}
