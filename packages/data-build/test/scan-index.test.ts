import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, decodeScanIndex, hashCard, hashToHex, scryfallIdAt } from '@spelldex/shared/scan';
import { hashSources, loadCardRgba, scryfallImageUrl } from '../src/scan-index/index.ts';

function card(seed: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(CARD_W * CARD_H * 4);
  for (let i = 0; i < px.length; i += 4) {
    const x = (i / 4) % CARD_W, y = Math.floor(i / 4 / CARD_W);
    px[i] = 128 + 120 * Math.sin(x / (20 + seed) + seed);
    px[i + 1] = 128 + 120 * Math.cos(y / (30 + seed));
    px[i + 2] = ((x >> 5) ^ (y >> 5) ^ seed) & 1 ? 220 : 30;
    px[i + 3] = 255;
  }
  return px;
}
const png = (px: Uint8ClampedArray) => sharp(Buffer.from(px.buffer), { raw: { width: CARD_W, height: CARD_H, channels: 4 } }).png().toBuffer();

describe('scan index build', () => {
  // Golden test: the build decodes images with sharp, the worker gets raw RGBA from a canvas.
  // For the same pixels both must give the same bits.
  it('hashes a decoded image exactly like raw RGBA', async () => {
    const px = card(1);
    const decoded = await loadCardRgba(await png(px));
    expect(hashToHex(hashCard(decoded).art)).toBe(hashToHex(hashCard(px).art));
    expect(hashToHex(hashCard(decoded).full)).toBe(hashToHex(hashCard(px).full));
  });

  it('builds an index from local images, reuses previous hashes and groups shared art', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-'));
    const id = (k: number) => `${String(k).padStart(8, '0')}-1111-4222-8333-444455556666`;
    for (const k of [1, 2]) writeFileSync(join(dir, `${id(k)}.jpg`), await png(card(k)));
    writeFileSync(join(dir, `${id(2)}-back.jpg`), await png(card(5)));
    const sources = [
      { scryfallId: id(1), artKey: 'A', set: 'AAA', collectorNumber: '1', back: false },
      { scryfallId: id(2), artKey: 'A', set: 'BBB', collectorNumber: '7', back: false },
      { scryfallId: id(2), artKey: `${id(2)}|back`, set: 'BBB', collectorNumber: '7', back: true },
      { scryfallId: id(3), artKey: 'C', set: 'CCC', collectorNumber: '9', back: false }, // image missing
    ];
    const res = await hashSources(sources, { imagesDir: dir });
    expect(res.failed).toHaveLength(1);
    const idx = decodeScanIndex(res.bin);
    expect(idx.n).toBe(3);
    expect(idx.group[0]).toBe(idx.group[1]);
    expect(idx.group[2]).not.toBe(idx.group[1]);
    expect(idx.back).toEqual([false, false, true]);
    expect(scryfallIdAt(idx, 1)).toBe(id(2));

    const previous = new Map([[`${id(3)}:f`, hashCard(card(9))]]);
    const again = await hashSources(sources, { imagesDir: dir, previous });
    expect(again.failed).toHaveLength(0);
    expect(decodeScanIndex(again.bin).n).toBe(4);
  });

  it('builds Scryfall CDN URLs', () => {
    expect(scryfallImageUrl('abcd-1', true)).toBe('https://cards.scryfall.io/normal/back/a/b/abcd-1.jpg');
  });
});
