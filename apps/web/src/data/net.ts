/**
 * Everything that comes from the network goes through TanStack Query and is persisted to
 * IndexedDB, so prices, rulings, lore and price history survive restarts and work offline.
 * Scryfall data is kept at least 24 h, as their terms ask.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { ScryfallClient, SCRYFALL_CACHE_MS } from '@spelldex/shared/scryfall';
import type { DataManifest, LoreBundle, PriceHistoryShard } from '@spelldex/shared/contracts';
import { shardKey } from '@spelldex/shared/contracts';
import { MANIFEST_URL } from './client.ts';

export const scryfall = new ScryfallClient();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 7 * 24 * 60 * 60_000,
      retry: (n, e) => n < 2 && !(e instanceof Error && 'status' in e && (e as { status: number }).status === 404),
      networkMode: 'offlineFirst',
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: 'spelldex-query-cache',
  throttleTime: 2000,
});

/** Only network queries are persisted; catalog queries are cheap and local. */
export const PERSISTED_ROOTS = new Set(['scryfall', 'lore', 'price-history', 'manifest']);

export const SCRYFALL_STALE = SCRYFALL_CACHE_MS;

const manifestBase = () => new URL(MANIFEST_URL, location.href);

export async function fetchManifestJson(): Promise<DataManifest> {
  const res = await fetch(manifestBase(), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
  return res.json() as Promise<DataManifest>;
}

export async function fetchLore(manifest: DataManifest): Promise<LoreBundle | null> {
  const art = manifest.artifacts.lore;
  if (!art) return null;
  const res = await fetch(new URL(art.path, manifestBase()));
  if (!res.ok) throw new Error(`lore.json: HTTP ${res.status}`);
  return res.json() as Promise<LoreBundle>;
}

export async function fetchPriceShard(manifest: DataManifest, scryfallId: string): Promise<PriceHistoryShard> {
  const ph = manifest.artifacts.priceHistory;
  if (!ph) return {};
  const res = await fetch(new URL(`${ph.dir}/${shardKey(scryfallId)}.json`, manifestBase()));
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`price shard: HTTP ${res.status}`);
  return res.json() as Promise<PriceHistoryShard>;
}
