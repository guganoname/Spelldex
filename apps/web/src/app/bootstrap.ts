/** Start-up: open the local catalog and check for a data update in the background. */
import type { CatalogStatus } from '@spelldex/shared/contracts';
import { setFeedbackPrefs } from '@spelldex/design/feedback';
import { Comlink, data, MANIFEST_URL } from '../data/client.ts';
import { feedbackPrefs, useDeviceStore } from '../state/device.ts';

export async function bootstrap(): Promise<void> {
  const store = useDeviceStore.getState();
  setFeedbackPrefs(feedbackPrefs(store.prefs));
  document.documentElement.lang = store.prefs.uiLanguage;
  useDeviceStore.subscribe((s, prev) => {
    if (s.prefs !== prev.prefs) setFeedbackPrefs(feedbackPrefs(s.prefs));
    if (s.prefs.uiLanguage !== prev.prefs.uiLanguage) document.documentElement.lang = s.prefs.uiLanguage;
  });

  try {
    store.setCatalog(await data().catalog.status());
  } catch (e) {
    // The worker could not open its storage (very old browser, private mode quirks).
    store.setCatalog({ phase: 'error', version: null, storage: null, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  // A failed first install retries by itself once the phone is back online.
  addEventListener('online', () => {
    if (useDeviceStore.getState().catalog.phase === 'error') void syncCatalog();
  });
  await syncCatalog();
}

let syncing: Promise<void> | null = null;

/** Install or update the catalog. Also the retry after a failed first install (CatalogGate).
 * Never rejects: failures end up in the catalog status. */
export function syncCatalog(): Promise<void> {
  if (!syncing) {
    const set = (s: CatalogStatus) => useDeviceStore.getState().setCatalog(s);
    // Daily is enough; the worker skips the download when the version did not change.
    syncing = data().catalog.sync(MANIFEST_URL, Comlink.proxy(set))
      .then(set)
      .catch((e: unknown) => {
        const prev = useDeviceStore.getState().catalog;
        // An installed catalog keeps working offline; only a missing one is an error to show.
        if (prev.phase !== 'ready') set({ ...prev, phase: 'error', error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => { syncing = null; });
  }
  return syncing;
}

/** Ask once, after the first real interaction, so iOS keeps the collection. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
