/**
 * Scan worker entry. Exposed with Comlink; the app creates it with
 *   new Worker(new URL('@spelldex/scanner/worker', import.meta.url), { type: 'module' })
 * OpenCV.js (~13 MB, ~3 MB gzipped) is a separate lazy chunk loaded by init(),
 * so it never lands in the service-worker precache.
 */
import * as Comlink from 'comlink';
import type { ScanFrameResult, ScanInitOptions, ScanWorkerApi } from '@spelldex/shared/contracts';
import { decodeScanIndex } from '@spelldex/shared/scan';
import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import { Scanner } from './scanner.ts';
import type { CV } from './detect.ts';
import { createTesseractOcr } from './ocr.ts';

/**
 * opencv.js is a UMD bundle whose CommonJS export is a Promise. Bundler ESM interop wraps that
 * Promise in an object with Promise's prototype, which breaks `await import()`. So we load the
 * file as an asset and evaluate it with a CommonJS shim instead.
 */
export async function loadOpenCv(url: string = opencvUrl): Promise<CV> {
  const src = await (await fetch(url)).text();
  const mod: { exports: unknown } = { exports: {} };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', src)(mod, mod.exports);
  const c = (await (mod.exports as Promise<CV>)) as CV;
  if (!c.Mat) await new Promise<void>((r) => { c.onRuntimeInitialized = () => r(); });
  // The Emscripten module is a thenable; returning it from an async function would re-await it.
  if (typeof c.then === 'function') delete c.then;
  return c;
}

let scanner: Scanner | null = null;
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

const api: ScanWorkerApi = {
  async init(opts: ScanInitOptions) {
    const [cv, buf] = await Promise.all([
      loadOpenCv(),
      fetch(opts.indexUrl).then((r) => {
        if (!r.ok) throw new Error(`scan index: HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    const index = decodeScanIndex(buf);
    // Tesseract is only fetched when the first reprint actually needs it.
    let ocrPromise: ReturnType<typeof createTesseractOcr> | null = null;
    const ocr = opts.ocr
      ? (img: Parameters<Awaited<ReturnType<typeof createTesseractOcr>>>[0]) =>
          (ocrPromise ??= createTesseractOcr()).then((fn) => fn(img))
      : undefined;
    scanner = new Scanner(cv, index, {}, ocr);
    return { entries: index.n };
  },

  async processFrame(frame: ImageBitmap): Promise<ScanFrameResult> {
    if (!scanner) throw new Error('scan worker: init() first');
    try {
      if (!canvas || canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas = new OffscreenCanvas(frame.width, frame.height);
        ctx = canvas.getContext('2d', { willReadFrequently: true });
      }
      ctx!.drawImage(frame, 0, 0);
      const img = ctx!.getImageData(0, 0, frame.width, frame.height);
      return await scanner.processFrame(img);
    } finally {
      frame.close();
    }
  },

  async reset() {
    scanner?.reset();
  },
};

Comlink.expose(api);
