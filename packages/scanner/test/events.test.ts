import { describe, expect, it } from 'vitest';
import type { Quad, ScanFrameResult } from '@spelldex/shared/contracts';
import { initialScanFeedback, scanFeedback } from '../src/events.ts';

const quad: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const match = { scryfallId: 'x', distance: 10, confidence: 0.9, region: 'art' as const, set: 'MOM', collectorNumber: '1' };

describe('scanFeedback', () => {
  it('emits lock, hit and lost once each', () => {
    const frames: ScanFrameResult[] = [
      { state: 'searching', ms: 1 },
      { state: 'candidate', quad, best: match, streak: 1, ms: 1 },
      { state: 'candidate', quad, best: match, streak: 2, ms: 1 },
      { state: 'hit', quad, match, ms: 1 },
      { state: 'tracking', quad, lockedId: 'x', ms: 1 },
      { state: 'searching', ms: 1 },
    ];
    let s = initialScanFeedback(0);
    const all: string[] = [];
    frames.forEach((f, i) => { const r = scanFeedback(s, f, i * 125); s = r.state; all.push(...r.events); });
    expect(all).toEqual(['scan-lock', 'scan-hit', 'scan-lost']);
  });

  it('hints at the torch once after a while without success', () => {
    let s = initialScanFeedback(0);
    const all: string[] = [];
    for (let t = 0; t <= 6000; t += 125) { const r = scanFeedback(s, { state: 'searching', ms: 1 }, t); s = r.state; all.push(...r.events); }
    expect(all).toEqual(['scan-hint-light']);
  });
});
