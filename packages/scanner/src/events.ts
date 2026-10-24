import type { ScanFrameResult } from '@spelldex/shared/contracts';

/** Scan events of the @spelldex/design feedback table (FeedbackEvent there is the source of truth). */
export type ScanFeedbackEvent = 'scan-lock' | 'scan-lost' | 'scan-hit' | 'scan-ambiguous' | 'scan-hint-light';

export interface ScanFeedbackState {
  prev: ScanFrameResult['state'] | null;
  /** performance.now() of the last frame with an outline or a hit. */
  lastSeen: number;
  hinted: boolean;
}

export const initialScanFeedback = (now: number): ScanFeedbackState => ({ prev: null, lastSeen: now, hinted: false });

/**
 * Turns the stream of frame results into the few events the UI should sound/animate.
 * Pure: the app keeps the state and calls `feedback(event, …)` for each returned event.
 * `scan-hit` carries no rarity; the app adds it from the catalog.
 */
export function scanFeedback(
  s: ScanFeedbackState,
  r: ScanFrameResult,
  now: number,
  hintAfterMs = 4000,
): { state: ScanFeedbackState; events: ScanFeedbackEvent[] } {
  const events: ScanFeedbackEvent[] = [];
  const hasOutline = r.state !== 'searching';
  const had = s.prev !== null && s.prev !== 'searching';
  if (hasOutline && !had) events.push('scan-lock');
  if (!hasOutline && had) events.push('scan-lost');
  if (r.state === 'hit') events.push('scan-hit');
  if (r.state === 'ambiguous') events.push('scan-ambiguous');
  let { lastSeen, hinted } = s;
  if (r.state === 'hit' || r.state === 'tracking' && r.lockedId) { lastSeen = now; hinted = false; }
  else if (!hinted && now - lastSeen > hintAfterMs) { events.push('scan-hint-light'); hinted = true; }
  return { state: { prev: r.state, lastSeen, hinted }, events };
}
