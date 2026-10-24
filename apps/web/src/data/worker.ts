/// <reference lib="webworker" />
/**
 * Data worker: owns catalog.db and collection.db. Exposed to the main thread via Comlink as
 * DataWorkerApi. All SQL runs here so the UI thread never blocks.
 */
import * as Comlink from 'comlink';
import * as q from '@spelldex/shared/catalog';
import { CollectionStore } from '@spelldex/shared/collection';
import type {
  CatalogApi, CatalogStatus, CollectionApi, DataWorkerApi, ProgressScope,
} from '@spelldex/shared/contracts';
import { fetchManifest, installCatalog, openInstalled, removeCatalogsExcept } from './install.ts';
import { openDb, sqliteEnv, type OpenDb } from './sqlite.ts';

let catalog: OpenDb | null = null;
let collection: CollectionStore | null = null;
let status: CatalogStatus = { phase: 'empty', version: null, storage: null };
let syncing: Promise<CatalogStatus> | null = null;

async function init() {
  const env = await sqliteEnv();
  status.storage = env.pool ? 'opfs' : 'memory';
  collection ??= new CollectionStore(openDb(env, '/collection.db'));
  if (!catalog) {
    const found = openInstalled(env);
    if (found) {
      catalog = found.db;
      status = { ...status, phase: 'ready', version: found.version, ...counts() };
    }
  }
  return env;
}
const ready = init();

function counts() {
  if (!catalog) return {};
  const c = q.catalogCounts(catalog);
  return { printings: c.printings, cards: c.cards };
}

function cat(): OpenDb {
  if (!catalog) throw new Error('Katalog noch nicht installiert');
  return catalog;
}
function coll(): CollectionStore {
  if (!collection) throw new Error('Sammlung nicht geöffnet');
  return collection;
}

async function sync(manifestUrl: string, onProgress?: (s: CatalogStatus) => void): Promise<CatalogStatus> {
  const env = await ready;
  const report = (s: Partial<CatalogStatus>) => {
    // While an installed catalog exists, the app stays 'ready'; the update runs in the background.
    const keepReady = catalog != null && s.phase !== 'ready' && s.phase !== 'error';
    status = { ...status, ...s, ...(keepReady ? { phase: 'ready' } : {}) };
    onProgress?.({ ...status, ...s });
  };
  try {
    const manifest = await fetchManifest(manifestUrl);
    if (status.version === manifest.version && catalog) return status;
    const name = await installCatalog(env, manifestUrl, manifest, report);
    const next = openDb(env, name, 'r');
    const old = catalog;
    catalog = next;
    old?.close();
    removeCatalogsExcept(env, name);
    report({ phase: 'ready', version: manifest.version, progress: undefined, error: undefined, ...counts() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Offline with an installed catalog is fine: keep using it.
    if (catalog) report({ phase: 'ready', error: msg });
    else report({ phase: 'error', error: msg });
  }
  return status;
}

const catalogApi: CatalogApi = {
  async status() {
    await ready;
    return status;
  },
  async sync(url, onProgress) {
    await ready;
    syncing ??= sync(url, onProgress).finally(() => (syncing = null));
    return syncing;
  },
  async getCard(id) { await ready; return q.getCard(cat(), id); },
  async getCardByOracle(id) { await ready; return q.getCardByOracle(cat(), id); },
  async getPrintings(id) { await ready; return q.getPrintings(cat(), id); },
  async getSummaries(ids) { await ready; return q.getSummaries(cat(), ids); },
  async findBySetNumber(s, n) { await ready; return q.findBySetNumber(cat(), s, n); },
  async search(query) { await ready; return q.search(cat(), query); },
  async getSets() { await ready; return q.getSets(cat()); },
  async getSet(code) { await ready; return q.getSet(cat(), code); },
  async getSetPrintings(code) { await ready; return q.getSetPrintings(cat(), code); },
  async getCombos(id, limit) { await ready; return q.getCombos(cat(), id, limit); },
  async random() { await ready; return q.randomCard(cat()); },
};

const lookup = (id: string) => (catalog ? q.getSummaries(catalog, [id])[0] ?? null : null);

const collectionApi: CollectionApi = {
  async markSeen(id, source) {
    await ready;
    const card = lookup(id);
    if (!card) throw new Error(`Unbekannte Karte ${id}`);
    return coll().markSeen(card, source);
  },
  async isSeen(ids) { await ready; return coll().isSeen(ids); },
  async setOwned(entry) {
    await ready;
    const card = lookup(entry.scryfallId);
    if (!card) throw new Error(`Unbekannte Karte ${entry.scryfallId}`);
    coll().setOwned(entry, card);
  },
  async getOwned(id) { await ready; return coll().getOwned(id); },
  async getProgress(scope: ProgressScope) {
    await ready;
    const c = coll();
    if (scope.kind === 'set') {
      const set = q.getSet(cat(), scope.code);
      return { ...c.countSet(scope.code), total: set?.printingCount ?? 0 };
    }
    if (scope.kind === 'plane') {
      const sets = q.getSets(cat()).filter((s) => s.plane === scope.plane);
      return { ...c.countSets(sets.map((s) => s.code)), total: sets.reduce((n, s) => n + s.printingCount, 0) };
    }
    const st = c.stats();
    return { seen: st.seenCards, owned: st.ownedCopies, total: q.catalogCounts(cat()).cards };
  },
  async stats() { await ready; return coll().stats(); },
  async recent(limit) { await ready; return coll().recent(limit); },
  async exportJson() { await ready; return coll().exportJson(); },
  async importJson(data) { await ready; return { events: coll().importJson(data, lookup).events }; },
  async newSinceExport() { await ready; return coll().newSinceExport(); },
};

const api: DataWorkerApi = { catalog: catalogApi, collection: collectionApi };
Comlink.expose(api);
