/** Loads OpenCV.js (wasm) in Node for tests and benchmarks. */
import { createRequire } from 'node:module';

export async function loadCvNode(): Promise<any> {
  // Plain CommonJS require: bundler interop would treat the module as a thenable.
  let cv: any = createRequire(import.meta.url)('@techstark/opencv-js');
  if (cv instanceof Promise) cv = await cv;
  if (!cv.Mat) await new Promise<void>((r) => { cv.onRuntimeInitialized = () => r(); });
  // Strip the thenable so callers can safely await/return it.
  if (typeof cv.then === 'function') delete cv.then;
  return cv;
}
