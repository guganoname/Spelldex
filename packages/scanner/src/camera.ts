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

export async function startCameraScan(opts: CameraScanOptions): Promise<CameraScan> {
  const worker =
    opts.worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'scan' });
  const api = Comlink.wrap<ScanWorkerApi>(worker);

  // Start camera and worker init in parallel; init downloads OpenCV + index.
  const [stream] = await Promise.all([
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    }),
    api.init({ indexUrl: opts.indexUrl, ocr: opts.ocr }),
  ]);
  const video = opts.video;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

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
      api[Comlink.releaseProxy]();
      if (!opts.worker) worker.terminate();
    },
  };
}
