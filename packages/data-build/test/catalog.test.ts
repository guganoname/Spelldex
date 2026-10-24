import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as q from '@spelldex/shared/catalog';
import { DEFAULT_SCORE, type RuleSet } from '@spelldex/shared/rules';
import { buildCatalog } from '../src/catalog.ts';
import { readMtgjsonSets } from '../src/mtgjson.ts';
import { nodeDb } from '../src/node-db.ts';

const fixtures = fileURLToPath(new URL('../fixtures/mtgjson', import.meta.url));
const rules: RuleSet = {
  version: 1,
  rules: [
    { tag: 'ramp', label_de: 'Mana-Beschleunigung', text: ['\\{T\\}: Add \\{'] },
    { tag: 'burn', label_de: 'Direktschaden', text: ['deals \\d+ damage'] },
  ],
};

let dir: string;
let db: ReturnType<typeof nodeDb>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'spelldex-'));
  const path = join(dir, 'catalog.db');
  const { stats } = await buildCatalog(path, {
    sets: readMtgjsonSets(fixtures),
    setPlanes: { ISD: 'innistrad', ZEN: 'zendikar' },
    rules,
    score: DEFAULT_SCORE,
    combos: new Map([[ 'x', [] ]]),
    version: 'test',
  });
  expect(stats.printings).toBe(9);
  db = nodeDb(path, true);
});
afterAll(() => {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

const oracleOf = (name: string) => q.search(db, { text: name }).items.find((c) => c.name === name)!;

describe('catalog build', () => {
  it('groups faces of a double-faced printing into one row', () => {
    const delver = oracleOf('Delver of Secrets // Insectile Aberration');
    expect(delver.hasBackFace).toBe(true);
    const detail = q.getCard(db, delver.scryfallId)!;
    expect(detail.faces?.map((f) => f.name)).toEqual(['Delver of Secrets', 'Insectile Aberration']);
    expect(detail.plane).toBe('innistrad');
    expect(detail.nameDe).toBe('Geheimnissucher');
  });

  it('keeps one oracle card for reprints and picks the newest regular printing as default', () => {
    const bolt = oracleOf('Lightning Bolt');
    expect(bolt.setCode).toBe('C21');
    expect(q.getPrintings(db, bolt.oracleId).map((p) => p.setCode)).toEqual(['C21', 'M10']);
    expect(q.getCardByOracle(db, bolt.oracleId)!.printingCount).toBe(2);
  });

  it('takes the German name from any printing that has one', () => {
    expect(oracleOf('Lightning Bolt').nameDe).toBe('Blitzschlag');
  });

  it('normalises legalities and computes tags and strength', () => {
    const ring = q.getCard(db, oracleOf('Sol Ring').scryfallId)!;
    expect(ring.legalities).toMatchObject({ commander: 'legal', legacy: 'banned', vintage: 'restricted' });
    expect(ring.strength!.score).toBeGreaterThan(0);
    const elves = q.getCard(db, oracleOf('Llanowar Elves').scryfallId)!;
    expect(elves.tags).toContain('ramp');
  });
});

describe('search', () => {
  it('finds by German name prefix and ignores FTS syntax in user input', () => {
    expect(q.search(db, { text: 'blitz' }).items[0]?.name).toBe('Lightning Bolt');
    expect(q.search(db, { text: 'drach"e OR *' }).items.map((c) => c.name)).toContain('Shivan Dragon');
  });

  it('filters by color identity like a commander deck', () => {
    const names = q.search(db, { colors: ['G'], colorMatch: 'identity' }).items.map((c) => c.name);
    expect(names).toContain('Llanowar Elves');
    expect(names).toContain('Sol Ring');
    expect(names).not.toContain("Avacyn's Pilgrim");
  });

  it('filters by type, tag, format and set', () => {
    expect(q.search(db, { types: ['Dragon'] }).items.map((c) => c.name)).toEqual(['Shivan Dragon']);
    expect(q.search(db, { tags: ['burn'] }).total).toBe(3);
    expect(q.search(db, { format: 'legacy' }).items.map((c) => c.name)).not.toContain('Sol Ring');
    expect(q.search(db, { setCode: 'm10' }).total).toBe(3);
  });

  it('finds a printing by set and collector number (scanner fallback)', () => {
    expect(q.findBySetNumber(db, 'm10', '0146')?.name).toBe('Lightning Bolt');
  });

  it('lists set printings in collector order', () => {
    expect(q.getSetPrintings(db, 'M10').map((c) => c.collectorNumber)).toEqual(['146', '157', '193']);
    expect(q.getSet(db, 'M10')?.printingCount).toBe(3);
  });
});
