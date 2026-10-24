import { beforeAll, describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, decodeScanIndex, encodeScanIndex, hashCard, type ScanIndex } from '@spelldex/shared/scan';
import { Scanner } from '../src/scanner.ts';
import { loadCvNode } from '../bench/cv-node.ts';
import { makeCard, photograph, rng, type CardSpec } from '../bench/synth.ts';

// End-to-end on synthetic photos: OpenCV.js (wasm) detection, warp, hash, lookup, stabilisation.
let cv: any;
let index: ScanIndex;
const specs: CardSpec[] = Array.from({ length: 40 }, (_, i) => ({
  artSeed: 100 + i, frameSeed: 200 + i, set: 'TST', number: String(i + 1), style: i % 5 === 0 ? 'old' : 'modern',
}));
const ids = specs.map((_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
const cards: Uint8ClampedArray[] = [];

beforeAll(async () => {
  cv = await loadCvNode();
  for (const s of specs) cards.push(makeCard(cv, s));
  index = decodeScanIndex(encodeScanIndex(cards.map((c, i) => ({
    scryfallId: ids[i]!, hashes: hashCard(c), group: i, set: 'TST', collectorNumber: String(i + 1),
  }))));
}, 60_000);

describe('Scanner', () => {
  it('identifies cards in simulated camera frames', async () => {
    const scanner = new Scanner(cv, index);
    const r = rng(42);
    let correct = 0, wrong = 0;
    for (let k = 0; k < 12; k++) {
      const t = k % specs.length;
      const photo = await photograph(cv, cards[t]!, r, { difficulty: 'easy', upsideDown: k % 4 === 0, sleeve: false, glare: false });
      const d = await scanner.identify(photo);
      if (d.kind === 'match') d.match.scryfallId === ids[t] ? correct++ : wrong++;
    }
    expect(wrong).toBe(0);
    expect(correct).toBeGreaterThanOrEqual(10);
  }, 60_000);

  it('fires a hit after 3 stable frames, once, and does not accept unknown cards', async () => {
    const scanner = new Scanner(cv, index);
    const r = rng(7);
    const states: string[] = [];
    for (let k = 0; k < 5; k++) {
      const photo = await photograph(cv, cards[3]!, r, { difficulty: 'easy', upsideDown: false, sleeve: false, glare: false });
      states.push((await scanner.processFrame(photo)).state);
    }
    expect(states).toEqual(['candidate', 'candidate', 'hit', 'tracking', 'tracking']);

    const unknown = makeCard(cv, { artSeed: 9999, frameSeed: 9998, set: 'UNK', number: '1', style: 'modern' });
    scanner.reset();
    for (let k = 0; k < 4; k++) {
      const photo = await photograph(cv, unknown, r, { difficulty: 'easy', upsideDown: false, sleeve: false, glare: false });
      expect(['searching', 'tracking']).toContain((await scanner.processFrame(photo)).state);
    }
  }, 60_000);

  it('asks for the stricter margin above strictAbove', async () => {
    const photo = await photograph(cv, cards[5]!, rng(11), { difficulty: 'easy', upsideDown: false, sleeve: false, glare: false });
    expect((await new Scanner(cv, index).identify(photo)).kind).toBe('match');
    // Every distance is "above", and no other artwork is 200 bits away: never a plain match.
    const strict = await new Scanner(cv, index, { strictAbove: -1, strictMargin: 200 }).identify(photo);
    expect(strict.kind).toBe('ambiguous');
  }, 60_000);

  it('reports quads as {x, y} corners in frame pixels', async () => {
    const scanner = new Scanner(cv, index);
    const photo = await photograph(cv, cards[0]!, rng(3), { difficulty: 'easy', upsideDown: false, sleeve: false, glare: false });
    const res = await scanner.processFrame(photo);
    expect(res.state).toBe('candidate');
    if (res.state === 'candidate') {
      expect(res.quad).toHaveLength(4);
      res.quad.forEach((p, i) => {
        expect(Math.hypot(p.x - photo.corners[i]![0]!, p.y - photo.corners[i]![1]!)).toBeLessThan(8);
      });
    }
  }, 60_000);
});

void CARD_W; void CARD_H;
