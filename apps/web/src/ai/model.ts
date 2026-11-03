/**
 * Optional artwork AI: Florence-2 (MIT licence, Microsoft), ONNX build from onnx-community,
 * running fully in the browser via transformers.js. Free, no account, no API key. Downloaded once
 * from the Hugging Face CDN when the user turns the setting on, then cached by the browser.
 */
export const ART_MODEL_ID = 'onnx-community/Florence-2-base-ft';
/** Per-module precision: ~250 MB in total, fast enough on phones (3–5 s per image on a laptop CPU). */
export const ART_MODEL_DTYPE = {
  embed_tokens: 'fp16',
  vision_encoder: 'q4',
  encoder_model: 'q4',
  decoder_model_merged: 'q4',
} as const;
export const ART_MODEL_MB = 250;
export const ART_TASK = '<MORE_DETAILED_CAPTION>';
/** Cache Storage name transformers.js uses in browsers. */
export const ART_MODEL_CACHE = 'transformers-cache';

export interface CaptionWorkerApi {
  /** Loads the model (idempotent). Progress 0..1 over all model files. */
  load(onProgress?: (p: number) => void): Promise<'webgpu' | 'wasm'>;
  /** English caption of the image at `url` (must be CORS-readable, Scryfall's CDN is). */
  caption(url: string): Promise<string>;
}
