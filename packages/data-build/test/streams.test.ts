import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamJson } from '../src/streams.ts';
import { readAllPrices, thin, toPriceSeries } from '../src/prices.ts';
import { readMtgjsonSets } from '../src/mtgjson.ts';

const dir = mkdtempSync(join(tmpdir(), 'spelldex-streams-'));

describe('streaming readers', () => {
  it('streams a gzipped AllPrintings-shaped file set by set', async () => {
    const path = join(dir, 'AllPrintings.json.gz');
    writeFileSync(path, gzipSync(JSON.stringify({ meta: {}, data: { AAA: { code: 'AAA', cards: [] }, BBB: { code: 'BBB', cards: [] } } })));
    const codes: string[] = [];
    for await (const s of readMtgjsonSets(path)) codes.push(s.code);
    expect(codes).toEqual(['AAA', 'BBB']);
  });

  it('streams an array under a key (Spellbook variants)', async () => {
    const path = join(dir, 'variants.json');
    writeFileSync(path, JSON.stringify({ timestamp: 1, variants: [{ id: 'a' }, { id: 'b' }], aliases: [] }));
    const ids: unknown[] = [];
    for await (const { value } of streamJson<{ id: string }>(path, 'variants', 'array')) ids.push(value.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('thins prices to weekly points counted back from the newest day', async () => {
    const days: Record<string, number> = {};
    for (let i = 0; i < 15; i++) days[`2026-10-${String(10 + i).padStart(2, '0')}`] = i;
    expect(Object.keys(thin(days, 7))).toEqual(['2026-10-10', '2026-10-17', '2026-10-24']);

    const path = join(dir, 'AllPrices.json');
    writeFileSync(path, JSON.stringify({ data: { u1: { paper: { cardmarket: { currency: 'EUR', retail: { normal: days } } } }, u2: { paper: {} } } }));
    const prices = await readAllPrices(path);
    expect([...prices.keys()]).toEqual(['u1']);
    expect(toPriceSeries(prices.get('u1')!)).toEqual({ currency: 'EUR', until: '2026-10-24', normal: [[-14, 0], [-7, 7], [0, 14]] });
  });
});
