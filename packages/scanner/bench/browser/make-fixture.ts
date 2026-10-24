import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeScanIndex, hashCard } from '@spelldex/shared/scan';
import { loadCvNode } from '../cv-node.ts';
import { makeCard, photograph, rng } from '../synth.ts';
/**
 * Fixture for a real-browser test of the demo page: a 50-card synthetic index plus a fake camera
 * feed (y4m) showing card #8. Usage:
 *   node --experimental-strip-types bench/browser/make-fixture.ts <demo-dist>   (after building demo/)
 *   chromium --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<demo-dist>/card.y4m
 * The page should report "E2E #8" within about a second.
 */
const OUT = process.argv[2] ?? 'demo-dist';
const cv = await loadCvNode();
const cards = Array.from({ length: 50 }, (_, i) => makeCard(cv, { artSeed: 300 + i, frameSeed: 400 + i, set: 'E2E', number: String(i + 1), style: 'modern' }));
const id = (i: number) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
mkdirSync(OUT + '/data', { recursive: true });
writeFileSync(OUT + '/data/scan-index.bin', encodeScanIndex(cards.map((c, i) => ({ scryfallId: id(i), hashes: hashCard(c), group: i, set: 'E2E', collectorNumber: String(i + 1) }))));
// y4m (I420) with 30 frames of card #7
const W = 1280, H = 720;
const r = rng(5);
const frames: Buffer[] = [];
const photo = await photograph(cv, cards[7]!, r, { difficulty: 'medium', upsideDown: false, sleeve: false, glare: true });
const d = photo.data;
const y = Buffer.alloc(W * H), u = Buffer.alloc(W * H / 4), v = Buffer.alloc(W * H / 4);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = (j * W + i) * 4, R = d[k]!, G = d[k + 1]!, B = d[k + 2]!;
  y[j * W + i] = Math.max(0, Math.min(255, 0.257 * R + 0.504 * G + 0.098 * B + 16));
  if (!(i & 1) && !(j & 1)) {
    const c = (j / 2) * (W / 2) + i / 2;
    u[c] = Math.max(0, Math.min(255, -0.148 * R - 0.291 * G + 0.439 * B + 128));
    v[c] = Math.max(0, Math.min(255, 0.439 * R - 0.368 * G - 0.071 * B + 128));
  }
}
for (let f = 0; f < 30; f++) frames.push(Buffer.from('FRAME\n'), y, u, v);
writeFileSync(OUT + '/card.y4m', Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), ...frames]));
console.log('expected', id(7));
