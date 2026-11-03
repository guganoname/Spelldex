import { describe, expect, it } from 'vitest';
import { de } from './de.ts';
import { en } from './en.ts';
import { translate } from './index.ts';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('English covers exactly the German keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
  it('both languages use the same placeholders', () => {
    for (const k of Object.keys(de) as (keyof typeof de)[]) expect([k, vars(en[k])]).toEqual([k, vars(de[k])]);
  });
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'home.owned', { n: 3 })).toBe('3 owned');
    expect(translate('de', 'home.owned')).toBe('{n} im Besitz');
  });
});
