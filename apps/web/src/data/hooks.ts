/** React hooks over the data worker and network sources. Components use only these. */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CatalogStatus, OwnedEntry, ProgressScope, ScryfallId, SearchQuery, SeenSource,
} from '@spelldex/shared/contracts';
import { data } from './client.ts';
import { fetchLore, fetchManifestJson, fetchPriceShard, scryfall, SCRYFALL_STALE } from './net.ts';
import { loreForCard } from './lore.ts';
import type { CardDetail } from '@spelldex/shared/contracts';
import { useDeviceStore } from '../state/device.ts';

const LOCAL = { staleTime: Infinity, networkMode: 'always' as const };

/** Catalog version as a key part, so every catalog query refetches after an update. */
function useCatalogKey() {
  return useDeviceStore((s) => s.catalog.version ?? 'none');
}

export function useCatalogReady(): CatalogStatus {
  return useDeviceStore((s) => s.catalog);
}

export function useCard(id: ScryfallId | undefined) {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['catalog', v, 'card', id], queryFn: () => data().catalog.getCard(id!), enabled: !!id && v !== 'none', ...LOCAL });
}

export function usePrintings(oracleId: string | undefined) {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['catalog', v, 'printings', oracleId], queryFn: () => data().catalog.getPrintings(oracleId!), enabled: !!oracleId && v !== 'none', ...LOCAL });
}

export function useSearch(query: SearchQuery, enabled = true) {
  const v = useCatalogKey();
  return useQuery({
    queryKey: ['catalog', v, 'search', query],
    queryFn: () => data().catalog.search(query),
    enabled: enabled && v !== 'none',
    placeholderData: keepPreviousData,
    ...LOCAL,
  });
}

export function useSets() {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['catalog', v, 'sets'], queryFn: () => data().catalog.getSets(), enabled: v !== 'none', ...LOCAL });
}

export function useSetPrintings(code: string | undefined) {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['catalog', v, 'set-printings', code], queryFn: () => data().catalog.getSetPrintings(code!), enabled: !!code && v !== 'none', ...LOCAL });
}

export function useCombos(oracleId: string | undefined) {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['catalog', v, 'combos', oracleId], queryFn: () => data().catalog.getCombos(oracleId!, 20), enabled: !!oracleId && v !== 'none', ...LOCAL });
}

export function useManifest() {
  return useQuery({ queryKey: ['manifest'], queryFn: fetchManifestJson, staleTime: 60 * 60_000 });
}

/** Live prices from Scryfall (direct from the device, cached >= 24 h). */
export function usePrices(id: ScryfallId | undefined) {
  return useQuery({
    queryKey: ['scryfall', 'prices', id],
    queryFn: ({ signal }) => scryfall.getPrices(id!, signal),
    enabled: !!id,
    staleTime: SCRYFALL_STALE,
  });
}

export function useRulings(id: ScryfallId | undefined, enabled = true) {
  return useQuery({
    queryKey: ['scryfall', 'rulings', id],
    queryFn: ({ signal }) => scryfall.getRulings(id!, signal),
    enabled: !!id && enabled,
    staleTime: SCRYFALL_STALE,
  });
}

export function usePriceHistory(id: ScryfallId | undefined) {
  const manifest = useManifest().data;
  return useQuery({
    queryKey: ['price-history', manifest?.version, id?.slice(0, 2)],
    queryFn: () => fetchPriceShard(manifest!, id!),
    enabled: !!id && !!manifest,
    staleTime: 12 * 60 * 60_000,
    select: (shard) => (id ? shard[id] ?? null : null),
  });
}

export function useLore(card: CardDetail | null | undefined) {
  const manifest = useManifest().data;
  const q = useQuery({
    queryKey: ['lore', manifest?.artifacts.lore?.sha256],
    queryFn: () => fetchLore(manifest!),
    enabled: !!manifest,
    staleTime: Infinity,
  });
  return { ...q, data: card ? loreForCard(q.data, card) : undefined };
}

// --- Collection -----------------------------------------------------------------------------

export function useCollectionStats() {
  return useQuery({ queryKey: ['collection', 'stats'], queryFn: () => data().collection.stats(), ...LOCAL });
}

export function useProgress(scope: ProgressScope) {
  const v = useCatalogKey();
  return useQuery({ queryKey: ['collection', 'progress', v, scope], queryFn: () => data().collection.getProgress(scope), enabled: v !== 'none', ...LOCAL });
}

export function useOwned(id: ScryfallId | undefined) {
  return useQuery({ queryKey: ['collection', 'owned', id], queryFn: () => data().collection.getOwned(id!), enabled: !!id, ...LOCAL });
}

export function useSeen(ids: ScryfallId[]) {
  return useQuery({ queryKey: ['collection', 'seen', ids], queryFn: () => data().collection.isSeen(ids), enabled: ids.length > 0, ...LOCAL });
}

export function useRecent(limit = 12) {
  return useQuery({ queryKey: ['collection', 'recent', limit], queryFn: () => data().collection.recent(limit), ...LOCAL });
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, source }: { id: ScryfallId; source: SeenSource }) => data().collection.markSeen(id, source),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection'] }),
  });
}

export function useSetOwned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: OwnedEntry) => data().collection.setOwned(entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collection'] }),
  });
}
