import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SCORE, makeStrengthScorer, parseSpellbookVariants, tagRules, type RuleSet } from './index.ts';

const rules = JSON.parse(readFileSync(new URL('./config/archetype-rules.json', import.meta.url), 'utf8')) as RuleSet;
const tag = tagRules(rules);

describe('tagRules', () => {
  it('tags removal and evasion', () => {
    const t = tag({ type: 'Creature — Dragon', keywords: ['Flying', 'Haste'], text: 'When this enters, it deals 3 damage to any target.' });
    expect(t.sort()).toEqual(['evasion', 'haste', 'removal']);
  });
  it('tags mana dorks as ramp', () => expect(tag({ text: '{T}: Add {G}.' })).toContain('ramp'));
  it('respects exclusions', () => {
    const t = tag({ text: 'Counter target spell. Draw a card.' });
    expect(t).toContain('counterspell');
    expect(t).not.toContain('removal');
  });
});

describe('makeStrengthScorer', () => {
  const score = makeStrengthScorer(DEFAULT_SCORE, 30000);
  it('ranks popular cards higher', () => {
    const a = score({ edhrecRank: 5, comboCount: 0, legalities: { commander: 'Legal' } });
    const b = score({ edhrecRank: 5000, comboCount: 0, legalities: { commander: 'Legal' } });
    expect(a.score).toBeGreaterThan(b.score);
  });
  it('is bounded and explainable', () => {
    const s = score({ edhrecRank: 1, comboCount: 999, priceEur: 999, legalities: {} });
    expect(s.score).toBeLessThanOrEqual(100);
    expect(Object.keys(s.parts).sort()).toEqual(['combos', 'formats', 'market', 'popularity']);
  });
});

describe('parseSpellbookVariants', () => {
  it('indexes variants by oracle id and skips spoilers', () => {
    const m = parseSpellbookVariants({
      variants: [
        { id: '1-2', uses: [{ card: { name: 'A', oracleId: 'o1' } }, { card: { name: 'B', oracleId: 'o2' } }], produces: [{ feature: { name: 'Infinite mana' } }], popularity: 4 },
        { id: '3', spoiler: true, uses: [{ card: { name: 'A', oracleId: 'o1' } }] },
      ],
    });
    expect(m.get('o1')).toHaveLength(1);
    expect(m.get('o2')?.[0]?.produces).toEqual(['Infinite mana']);
  });
});
