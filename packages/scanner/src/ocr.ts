import type { RgbaImage } from './detect.ts';

/**
 * Reads the collector line of a card crop and returns the raw text.
 * Only called for reprints (same artwork in several sets).
 */
export type OcrFn = (img: RgbaImage) => Promise<string>;

/**
 * Collector info box of the 2015+ frame (bottom left):
 *   "0123 R"            or "123/280 R"
 *   "MOM • EN  Artist"
 * Older frames have no set code here; then OCR simply returns nothing useful
 * and the user picks from the candidates.
 */
export const COLLECTOR_REGION = { x: 0.035, y: 0.925, w: 0.42, h: 0.06 };

const LANGS = 'EN|DE|FR|IT|ES|PT|JP|JA|KO|RU|CS|CT|ZHS|ZHT|PH';

export function parseCollectorLine(text: string): { set?: string; number?: string } {
  const t = text.replace(/[|]/g, '/').toUpperCase();
  const out: { set?: string; number?: string } = {};
  const num = t.match(/(?:^|\s)0*(\d{1,4})(?:\s*\/\s*\d{1,4})?(?=\s|[A-Z★*]?\b|$)/);
  if (num) out.number = num[1];
  const set = t.match(new RegExp(`\\b([A-Z0-9]{3,5})\\s*[•·.\\-*]?\\s*(?:${LANGS})\\b`));
  if (set) out.set = set[1];
  return out;
}

/**
 * Tesseract.js-backed OCR, loaded lazily on the first reprint. Uses a character
 * whitelist and single-block mode. Tesseract 4+ runs a small fixed LSTM text
 * recognizer (no generative model); pass `legacy: true` to use the classic engine.
 */
export async function createTesseractOcr(opts: { langPath?: string; workerPath?: string; corePath?: string; legacy?: boolean } = {}): Promise<OcrFn & { terminate(): Promise<void> }> {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', opts.legacy ? 0 : 1, {
    ...(opts.langPath ? { langPath: opts.langPath } : {}),
    ...(opts.workerPath ? { workerPath: opts.workerPath } : {}),
    ...(opts.corePath ? { corePath: opts.corePath } : {}),
  });
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•.- ',
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  const fn = (async (img: RgbaImage) => {
    const { data } = await worker.recognize(toCanvas(img));
    return data.text;
  }) as OcrFn & { terminate(): Promise<void> };
  fn.terminate = async () => { await worker.terminate(); };
  return fn;
}

/** Tesseract.js takes an OffscreenCanvas in the browser (worker). */
function toCanvas(img: RgbaImage): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}
