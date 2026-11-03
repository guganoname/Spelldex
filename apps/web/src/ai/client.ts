/** Main-thread side of the optional artwork AI: lazy worker, load status, captions per card. */
import { create } from 'zustand';
import * as Comlink from 'comlink';
import { useQuery } from '@tanstack/react-query';
import { scryfallImageUrl } from '@spelldex/shared/scryfall';
import { parseArtCaption, type ArtHints } from '@spelldex/shared/dex';
import { useDeviceStore } from '../state/device.ts';
import { ART_MODEL_CACHE, ART_MODEL_ID, type CaptionWorkerApi } from './model.ts';

export type ArtAiStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }
  | { state: 'ready'; device: 'webgpu' | 'wasm' }
  | { state: 'error'; message: string };

export const useArtAiStatus = create<{ status: ArtAiStatus; set(s: ArtAiStatus): void }>((set) => ({
  status: { state: 'idle' },
  set: (status) => set({ status }),
}));

let worker: Worker | null = null;
let remote: Comlink.Remote<CaptionWorkerApi> | null = null;
let ready: Promise<void> | null = null;

function api() {
  if (!remote) {
    worker = new Worker(new URL('./caption.worker.ts', import.meta.url), { type: 'module', name: 'spelldex-art-ai' });
    remote = Comlink.wrap<CaptionWorkerApi>(worker);
  }
  return remote;
}

/** Loads the model once; safe to call repeatedly. */
export function ensureArtAi(): Promise<void> {
  const { set } = useArtAiStatus.getState();
  ready ??= (async () => {
    set({ state: 'loading', progress: 0 });
    try {
      const device = await api().load(Comlink.proxy((progress: number) => set({ state: 'loading', progress })));
      set({ state: 'ready', device });
    } catch (e) {
      ready = null;
      set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  })();
  return ready;
}

/** Stops the worker (frees memory) and optionally deletes the downloaded model files. */
export async function disableArtAi(deleteModel: boolean) {
  worker?.terminate();
  worker = null;
  remote = null;
  ready = null;
  useArtAiStatus.getState().set({ state: 'idle' });
  if (deleteModel && 'caches' in globalThis) {
    const cache = await caches.open(ART_MODEL_CACHE);
    for (const req of await cache.keys()) if (req.url.includes(ART_MODEL_ID)) await cache.delete(req);
  }
}

/** Caption hints for one face of a printing, when the AI setting is on. Cached (and persisted). */
export function useArtHints(scryfallId: string, face: number) {
  const on = useDeviceStore((s) => s.prefs.artAi);
  return useQuery<ArtHints>({
    queryKey: ['art-caption', ART_MODEL_ID, scryfallId, face],
    queryFn: async () => {
      await ensureArtAi();
      try {
        const caption = await api().caption(scryfallImageUrl(scryfallId, 'art_crop', face ? 'back' : 'front'));
        return parseArtCaption(caption);
      } catch (e) {
        console.warn('[art-ai] caption failed', e);
        throw e;
      }
    },
    enabled: on,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
