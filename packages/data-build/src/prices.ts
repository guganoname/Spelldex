/**
 * MTGJSON AllPrices(.json|.gz): 90 days of Cardmarket prices per MTGJSON uuid.
 * Shape: data[uuid].paper.cardmarket = { currency: 'EUR', retail: { normal: {date: eur}, foil: {...} } }
 * Output: price shards keyed by the first two hex chars of the Scryfall id (PriceHistoryShard).
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';
import type { PriceHistoryShard, PriceSeries, ShardedArtifact } from '@spelldex/shared/contracts';
import { shardKey } from '@spelldex/shared/contracts';

type DatePrices = Record<string, number>;
export interface RawPrices { normal?: DatePrices; foil?: DatePrices }

interface CardmarketEntry { currency?: string; retail?: { normal?: DatePrices; foil?: DatePrices } }
type AllPricesValue = { paper?: { cardmarket?: CardmarketEntry } };

export async function readAllPrices(path: string): Promise<Map<string, RawPrices>> {
  const [{ default: StreamChain }, { parser }, { pick }, { streamObject }] = await Promise.all([
    import('stream-chain'),
    import('stream-json'),
    import('stream-json/filters/Pick.js'),
    import('stream-json/streamers/StreamObject.js'),
  ]);
  const stages: unknown[] = [createReadStream(path)];
  if (path.endsWith('.gz')) stages.push(createGunzip());
  stages.push(parser(), pick({ filter: 'data' }), streamObject());
  const out = new Map<string, RawPrices>();
  for await (const { key, value } of StreamChain.chain(stages as never) as AsyncIterable<{ key: string; value: AllPricesValue }>) {
    const retail = value.paper?.cardmarket?.retail;
    if (retail && (retail.normal || retail.foil)) out.set(key, { normal: retail.normal, foil: retail.foil });
  }
  return out;
}

export function latestPrice(p: RawPrices | undefined): number | null {
  const series = p?.normal ?? p?.foil;
  if (!series) return null;
  const last = Object.keys(series).sort().at(-1);
  return last ? series[last] ?? null : null;
}

function toSeries(p: DatePrices | undefined, until: string): [number, number][] | undefined {
  if (!p) return undefined;
  const end = Date.parse(until);
  return Object.keys(p)
    .sort()
    .map((d) => [Math.round((Date.parse(d) - end) / 86_400_000), p[d]!] as [number, number]);
}

export function toPriceSeries(p: RawPrices): PriceSeries | null {
  const dates = [...Object.keys(p.normal ?? {}), ...Object.keys(p.foil ?? {})].sort();
  const until = dates.at(-1);
  if (!until) return null;
  const s: PriceSeries = { currency: 'EUR', until };
  const normal = toSeries(p.normal, until);
  const foil = toSeries(p.foil, until);
  if (normal) s.normal = normal;
  if (foil) s.foil = foil;
  return s;
}

/** Writes outDir/prices/<xx>.json. `uuidToScryfall` comes from the catalog's printing table. */
export async function writePriceShards(
  outDir: string,
  prices: Map<string, RawPrices>,
  uuidToScryfall: Map<string, string>,
): Promise<ShardedArtifact> {
  const shards = new Map<string, PriceHistoryShard>();
  for (const [uuid, raw] of prices) {
    const sid = uuidToScryfall.get(uuid);
    const series = sid ? toPriceSeries(raw) : null;
    if (!sid || !series) continue;
    const k = shardKey(sid);
    const shard = shards.get(k) ?? {};
    shard[sid] = series;
    shards.set(k, shard);
  }
  await mkdir(join(outDir, 'prices'), { recursive: true });
  for (const [k, shard] of shards) await writeFile(join(outDir, 'prices', `${k}.json`), JSON.stringify(shard));
  return { dir: 'prices', keyedBy: 'scryfallId:2', count: shards.size };
}
