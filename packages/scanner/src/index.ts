/**
 * @spelldex/scanner: card recognition without AI models at runtime.
 * Camera frame -> card outline (OpenCV.js) -> perspective warp to 488x680 -> perceptual hashes
 * (@spelldex/shared/scan) -> nearest neighbours in scan-index.bin -> 3 stable frames -> hit.
 *
 * App usage: `startCameraScan` from `@spelldex/scanner/camera`; the worker entry is `./worker`.
 */
export { Scanner, DEFAULT_OPTIONS, type ScannerOptions, type FrameDecision } from './scanner.ts';
export { searchIndex, type Neighbour } from './matcher.ts';
export { detectCard, detectCandidates, warpCard, guideQuad, type Corners, type CV, type RgbaImage } from './detect.ts';
export { parseCollectorLine, COLLECTOR_REGION, type OcrFn } from './ocr.ts';
export { scanFeedback, initialScanFeedback, type ScanFeedbackEvent, type ScanFeedbackState } from './events.ts';
