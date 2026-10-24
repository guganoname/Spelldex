/**
 * Scanner contract, agreed with the scanner thread. The worker lives in @spelldex/scanner and is
 * exposed with Comlink; the camera stays on the main thread and sends ~8 frames/s as ImageBitmap.
 */
import type { ScryfallId } from './card.ts';

export interface Pt2 { x: number; y: number }
/** Four card corners in video pixels, clockwise from top-left. */
export type Quad = [Pt2, Pt2, Pt2, Pt2];

export interface ScanMatch {
  scryfallId: ScryfallId;
  /** Hamming distance of the best hash (0..64). */
  distance: number;
  /** 0..1 */
  confidence: number;
  region: 'art' | 'full';
}

export type ScanFrameResult =
  | { state: 'searching' }
  | { state: 'tracking'; quad: Quad }
  | { state: 'candidate'; quad: Quad; best: ScanMatch; streak: number }
  | { state: 'hit'; quad: Quad; match: ScanMatch }
  | { state: 'ambiguous'; quad: Quad; candidates: ScanMatch[] };

export interface ScanInitOptions {
  indexUrl: string;
  cvUrl?: string;
  ocr?: boolean;
}

export interface ScanWorkerApi {
  init(options: ScanInitOptions): Promise<{ entries: number }>;
  /** The frame is transferred. */
  processFrame(frame: ImageBitmap): Promise<ScanFrameResult>;
  reset(): Promise<void>;
}
