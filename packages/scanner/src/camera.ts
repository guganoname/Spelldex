/**
 * Main-thread side of the scanner: camera, frame pump and worker wiring.
 * The UI owns the <video> element (it sits inside the device's lens) and
 * receives one ScanFrameResult per processed frame.
 */
import * as Comlink from 'comlink';
import type { ScanFrameResult, ScanInitOptions, ScanWorkerApi } from '@spelldex/shared/contracts';

export interface CameraScanOptions extends ScanInitOptions {
  video: HTMLVideoElement;
  onResult: (r: ScanFrameResult) => void;
  /** Upper bound; the pump also waits for the worker, so slow phones self-throttle. Default 8. */
  maxFps?: number;
  /** Override the worker (tests, or a bundler-specific URL). */
  worker?: Worker;
  /** The camera picture is live; recognition may still be loading. */
  onCamera?: () => void;
}

export interface CameraScan {
  /** Whether the camera exposes a torch (most Android phones; iOS Safari does not). */
  readonly torchAvailable: boolean;
  setTorch(on: boolean): Promise<void>;
  pause(): void;
  resume(): void;
  /** Forget the locked card so the same card can fire again. */
  reset(): void;
  stop(): void;
}

/** Thrown when the camera API is missing (insecure context, in-app browser, old iOS). */
export class CameraUnavailableError extends Error {
  override name = 'CameraUnavailableError';
}

/** How long the worker may take to load OpenCV and the index before we give up. */
const INIT_TIMEOUT_MS = 90_000;

function openCamera(): Promise<MediaStream> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) {
    return Promise.reject(new CameraUnavailableError(
      typeof isSecureContext !== 'undefined' && !isSecureContext
        ? 'Die Kamera geht nur über HTTPS.'
        : 'Dieser Browser gibt die Kamera nicht frei.',
    ));
  }
  // Called synchronously from the tap (no await before it): iOS ties the permission prompt to it.
  return md
    .getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    .catch((e: unknown) => {
      // Some cameras reject the resolution hints; any back camera is better than none.
      if (e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotReadableError')) {
        return md.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
      }
      throw e;
    });
}

/** Rejects when the worker fails to load (a broken module never answers Comlink calls) or times out. */
function guardWorker<T>(worker: Worker, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = (msg: string) => () => reject(new Error(msg));
    const onError = (e: ErrorEvent) => reject(new Error(e.message || 'Die Erkennung konnte nicht geladen werden.'));
    const onMessageError = fail('Die Erkennung antwortet nicht.');
    const timer = setTimeout(fail('Die Erkennung lädt zu lange. Bitte Verbindung prüfen.'), INIT_TIMEOUT_MS);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    p.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
    });
  });
}

/**
 * The worker (OpenCV + scan index, several seconds to load) outlives a single lens session:
 * leaving the scan screen and coming back reuses it, so recognition is ready at once.
 * It is terminated after WORKER_IDLE_MS without a lens, to give the memory back.
 */
const WORKER_IDLE_MS = 90_000;

interface SharedWorker {
  worker: Worker;
  api: Comlink.Remote<ScanWorkerApi>;
  key: string;
  ready: Promise<unknown>;
  users: number;
  idle: ReturnType<typeof setTimeout> | null;
}
let shared: SharedWorker | null = null;

function dropShared(w: SharedWorker) {
  if (w.idle) clearTimeout(w.idle);
  if (shared === w) shared = null;
  w.api[Comlink.releaseProxy]();
  w.worker.terminate();
}

function acquireWorker(opts: ScanInitOptions): SharedWorker {
  const key = `${opts.indexUrl}|${opts.ocr ? 1 : 0}`;
  if (shared && shared.key !== key && shared.users === 0) dropShared(shared);
  if (shared && shared.key === key) {
    if (shared.idle) clearTimeout(shared.idle);
    shared.idle = null;
    shared.users++;
    void shared.api.reset();
    return shared;
  }
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'scan' });
  const api = Comlink.wrap<ScanWorkerApi>(worker);
  const w: SharedWorker = { worker, api, key, ready: Promise.resolve(), users: 1, idle: null };
  w.ready = guardWorker(worker, api.init({ indexUrl: opts.indexUrl, ocr: opts.ocr }));
  // A failed load must not be reused: the next lens starts a fresh worker.
  w.ready.catch(() => { if (shared === w) shared = null; });
  shared = w;
  return w;
}

function releaseWorker(w: SharedWorker) {
  w.users = Math.max(0, w.users - 1);
  if (w.users > 0) return;
  if (shared !== w) {
    dropShared(w);
    return;
  }
  w.idle = setTimeout(() => dropShared(w), WORKER_IDLE_MS);
}

export async function startCameraScan(opts: CameraScanOptions): Promise<CameraScan> {
  // Camera first, synchronously inside the user's tap; worker init (OpenCV + index download)
  // runs in parallel, and the picture shows as soon as the camera delivers.
  const streamPromise = openCamera();
  let api: Comlink.Remote<ScanWorkerApi>;
  let ready: Promise<unknown>;
  let disposeWorker: () => void;
  if (opts.worker) {
    const worker = opts.worker;
    api = Comlink.wrap<ScanWorkerApi>(worker);
    ready = guardWorker(worker, api.init({ indexUrl: opts.indexUrl, ocr: opts.ocr }));
    disposeWorker = () => api[Comlink.releaseProxy]();
  } else {
    const w = acquireWorker(opts);
    api = w.api;
    ready = w.ready;
    let released = false;
    disposeWorker = () => {
      if (released) return;
      released = true;
      releaseWorker(w);
    };
  }
  ready.catch(() => {}); // handled below; avoids an unhandled rejection if the camera fails first

  const dispose = (stream?: MediaStream) => {
    stream?.getTracks().forEach((t) => t.stop());
    disposeWorker();
  };

  let stream: MediaStream;
  try {
    stream = await streamPromise;
  } catch (e) {
    dispose();
    throw e;
  }
  const video = opts.video;
  // Attributes, not only properties: iOS checks them for inline, silent autoplay.
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  // iOS may refuse or stall play() outside the gesture; autoplay starts it once metadata arrives.
  await Promise.race([video.play().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  opts.onCamera?.();

  try {
    await ready;
  } catch (e) {
    video.srcObject = null;
    dispose(stream);
    throw e;
  }

  const track = stream.getVideoTracks()[0]!;
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
  const torchAvailable = !!caps.torch;

  const minInterval = 1000 / (opts.maxFps ?? 8);
  let running = true;
  let paused = false;
  let last = 0;

  const pump = async () => {
    while (running) {
      const now = performance.now();
      const wait = Math.max(0, last + minInterval - now);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (!running) break;
      if (paused || video.readyState < 2) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      last = performance.now();
      try {
        const bmp = await createImageBitmap(video);
        const r = await api.processFrame(Comlink.transfer(bmp, [bmp]));
        if (running && !paused) opts.onResult(r);
      } catch (e) {
        console.warn('[scan] frame failed', e);
      }
    }
  };
  void pump();

  return {
    torchAvailable,
    async setTorch(on) {
      if (torchAvailable) await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    },
    pause() { paused = true; },
    resume() { paused = false; },
    reset() { void api.reset(); },
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      disposeWorker();
    },
  };
}
