/**
 * Scanner contract, agreed with the scanner thread. The worker lives in @spelldex/scanner and is
 * exposed with Comlink; the camera stays on the main thread and sends ~8 frames/s as ImageBitmap.
 */
import type { ScryfallId } from './card.ts';

export interface Pt2 { x: number; y: number }
/** Four card corners in video pixels, clockwise from the card's top-left (card orientation, not screen). */
export type Quad = [Pt2, Pt2, Pt2, Pt2];

export interface ScanPrintRef {
  scryfallId: ScryfallId;
  set: string;
  collectorNumber: string;
}

export interface ScanMatch extends ScanPrintRef {
  /** Hamming distance, art hash (256 bit) + full-card hash (64 bit): 0..320, lower is better. */
  distance: number;
  /** 0..1 */
  confidence: number;
  /** Which hash was closer: the illustration or the whole card. */
  region: 'art' | 'full';
  /**
   * Other prints with the same artwork (reprints). The scanner picks the closest one (or the one
   * whose collector line OCR read); the UI can offer these as "anderer Druck?".
   */
  otherPrints?: ScanPrintRef[];
}

/** `ms` is the worker's processing time for the frame. */
export type ScanFrameResult =
  /** No card outline in the frame. */
  | { state: 'searching'; ms: number }
  /** Outline found but not identified (yet), or the locked card is still in view after a hit. */
  | { state: 'tracking'; quad: Quad; ms: number; lockedId?: ScryfallId }
  /** Identified in this frame, waiting for `streak` to reach 3. */
  | { state: 'candidate'; quad: Quad; best: ScanMatch; streak: number; ms: number }
  /** Emitted exactly once per card: the same result for 3 frames in a row. */
  | { state: 'hit'; quad: Quad; match: ScanMatch; ms: number }
  /** Two different artworks are about equally close: let the user pick (emitted once, after 3 frames). */
  | { state: 'ambiguous'; quad: Quad; candidates: ScanMatch[]; ms: number };

export interface ScanInitOptions {
  /** URL of scan-index.bin. */
  indexUrl: string;
  /** Read set code + collector number to separate reprints (lazy-loads Tesseract.js). Default false. */
  ocr?: boolean;
}

export interface ScanWorkerApi {
  /** Loads OpenCV.js (lazy chunk) and the index. */
  init(options: ScanInitOptions): Promise<{ entries: number }>;
  /** The frame is transferred and closed by the worker. */
  processFrame(frame: ImageBitmap): Promise<ScanFrameResult>;
  /** Forget the locked card so the same card can fire again. */
  reset(): Promise<void>;
}
