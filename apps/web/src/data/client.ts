/** Main-thread handle to the data worker (Comlink). One worker per app. */
import * as Comlink from 'comlink';
import type { CatalogApi, CollectionApi, DataWorkerApi } from '@spelldex/shared/contracts';

export const MANIFEST_URL: string = import.meta.env.VITE_DATA_MANIFEST ?? `${import.meta.env.BASE_URL}data/manifest.json`;

interface DataHandle {
  catalog: Comlink.Remote<CatalogApi>;
  collection: Comlink.Remote<CollectionApi>;
}

let handle: DataHandle | null = null;

export function data(): DataHandle {
  if (!handle) {
    const remote = Comlink.wrap<DataWorkerApi>(
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'spelldex-data' }),
    );
    // Comlink proxies nested properties at runtime; the cast only fixes the static type.
    handle = {
      catalog: remote.catalog as unknown as Comlink.Remote<CatalogApi>,
      collection: remote.collection as unknown as Comlink.Remote<CollectionApi>,
    };
  }
  return handle;
}

export { Comlink };
