/** Start-up: open the local catalog and check for a data update in the background. */
import type { CatalogStatus } from '@spelldex/shared/contracts';
import { setFeedbackPrefs } from '@spelldex/design/feedback';
import { Comlink, data, MANIFEST_URL } from '../data/client.ts';
import { useDeviceStore } from '../state/device.ts';

export async function bootstrap(): Promise<void> {
  const store = useDeviceStore.getState();
  const { sound, haptics, volume } = store.prefs;
  setFeedbackPrefs({ sound, haptics, volume });
  useDeviceStore.subscribe((s, prev) => {
    if (s.prefs !== prev.prefs) setFeedbackPrefs({ sound: s.prefs.sound, haptics: s.prefs.haptics, volume: s.prefs.volume });
  });

  const api = data();
  store.setCatalog(await api.catalog.status());
  // Daily is enough; the worker skips the download when the version did not change.
  const final = await api.catalog.sync(MANIFEST_URL, Comlink.proxy((s: CatalogStatus) => useDeviceStore.getState().setCatalog(s)));
  useDeviceStore.getState().setCatalog(final);
}

/** Ask once, after the first real interaction, so iOS keeps the collection. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
