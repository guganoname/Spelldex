/** Tesseract.js with the bundled English model, set up for the collector line, for benchmarks. */
import { createRequire } from 'node:module';
import sharp from 'sharp';
import type { OcrFn } from '../src/ocr.ts';

export async function createOcrNode(): Promise<{ ocr: OcrFn; terminate(): Promise<unknown> }> {
  const { createWorker, PSM } = await import('tesseract.js');
  const require = createRequire(import.meta.url);
  const langPath = require.resolve('@tesseract.js-data/eng/package.json').replace('package.json', '4.0.0_best_int');
  const w = await createWorker('eng', 1, { langPath, gzip: true, cacheMethod: 'none' });
  await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.- ', tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const ocr: OcrFn = async (img) => {
    const png = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
      .grayscale().normalize().png().toBuffer();
    return (await w.recognize(png)).data.text;
  };
  return { ocr, terminate: () => w.terminate() };
}
