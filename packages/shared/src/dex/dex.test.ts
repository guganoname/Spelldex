import { describe, expect, it } from 'vitest';
import { formatDexStat, generateDexEntry, type DexInput } from './index.ts';

const base: DexInput = {
  seed: 'x', name: 'Test', typeLine: 'Creature — Human', typeLineDe: null, oracleText: null, flavorText: null,
  power: '2', toughness: '2', loyalty: null, defense: null, manaValue: 2, keywords: [], colors: ['W'], rarity: 'common', plane: null,
};
const card = (o: Partial<DexInput>) => generateDexEntry({ ...base, ...o });
const spec = (e: ReturnType<typeof card>, id: string) => [...e.specs, ...e.funny].find((s) => s.id === id);

describe('dex entry', () => {
  it('is deterministic per seed and differs between cards', () => {
    expect(card({ seed: 'a' })).toEqual(card({ seed: 'a' }));
    expect(spec(card({ seed: 'a' }), 'height')!.value).not.toEqual(spec(card({ seed: 'b' }), 'height')!.value);
  });

  it('gives a vehicle horsepower, top speed and crew', () => {
    const e = card({
      name: 'Ratchet, Rescue Racer', typeLine: 'Legendary Artifact — Vehicle', power: '1', toughness: '4',
      oracleText: 'Living metal (As long as it\'s your turn, this Vehicle is also a creature.)\nWhenever one or more nontoken artifacts you control are put into a graveyard from the battlefield, convert Ratchet.',
    });
    expect(e.kind).toBe('vehicle');
    expect(e.category.en).toBe('Radiant Racer');
    expect(spec(e, 'horsepower')!.value).toBeGreaterThan(100);
    expect(spec(e, 'speed')!.unit).toBe('kmh');
    expect(spec(e, 'crew')!.text?.en).toBe('Drives itself');
    expect(spec(e, 'transform')).toBeDefined();
    expect(e.entry.de).toContain('PS');
  });

  it('reads crew from the rules text', () => {
    const e = card({ name: 'Smuggler\'s Copter', typeLine: 'Artifact — Vehicle', power: '3', toughness: '3', oracleText: 'Flying\nCrew 1', colors: [] });
    expect(spec(e, 'crew')!.value).toBe(1);
    expect(spec(e, 'ceiling')).toBeDefined();
  });

  it('makes big dragons big, with wingspan and breath', () => {
    const e = card({ name: 'Shivan Dragon', typeLine: 'Creature — Dragon', power: '5', toughness: '5', manaValue: 6, colors: ['R'], keywords: ['Flying'], oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.' });
    expect(e.category).toEqual({ de: 'Flammen-Drache', en: 'Flame Dragon' });
    expect(spec(e, 'weight')!.value).toBeGreaterThan(5000);
    expect(spec(e, 'wingspan')).toBeDefined();
    expect(spec(e, 'breath')!.value).toBeGreaterThan(1000);
  });

  it('scales size with power and toughness', () => {
    const small = spec(card({ seed: 's', power: '1', toughness: '1' }), 'weight')!.value!;
    const big = spec(card({ seed: 's', power: '6', toughness: '6' }), 'weight')!.value!;
    expect(big).toBeGreaterThan(small * 3);
  });

  it('spirits weigh almost nothing; keyword lines ignore reminder text', () => {
    const e = card({ typeLine: 'Creature — Spirit', oracleText: 'Flying\nThis creature can block only creatures with flying.', colors: ['W'] });
    expect(spec(e, 'weight')!.value).toBeLessThan(0.05);
    const r = card({ oracleText: 'Reach (This creature can block creatures with flying.)' });
    expect(spec(r, 'ceiling')).toBeUndefined();
  });

  it('uses the job and the German type line', () => {
    const e = card({ typeLine: 'Creature — Human Wizard', typeLineDe: 'Kreatur — Mensch, Zauberer', colors: ['U'] });
    expect(spec(e, 'job')!.text!.de).toBe('Zauberer');
    expect(e.category.de).toBe('Gezeiten-Mensch');
  });

  it('covers lands, spells, planeswalkers, equipment, sagas and battles', () => {
    expect(card({ typeLine: 'Basic Land — Mountain', power: null, toughness: null, manaValue: 0, colors: [] }).kind).toBe('land');
    const bolt = card({ name: 'Lightning Bolt', typeLine: 'Instant', power: null, toughness: null, manaValue: 1, colors: ['R'], oracleText: 'Lightning Bolt deals 3 damage to any target.' });
    expect(bolt.kind).toBe('spell');
    expect(spec(bolt, 'damage')!.value).toBe(3);
    expect(card({ typeLine: 'Legendary Planeswalker — Jace', loyalty: '3', power: null, toughness: null }).kind).toBe('planeswalker');
    const sword = card({ name: 'Sword of Fire and Ice', typeLine: 'Artifact — Equipment', power: null, toughness: null, manaValue: 3, colors: [], oracleText: 'Equipped creature gets +2/+2 and has protection from red and from blue.\nEquip {2}' });
    expect(sword.kind).toBe('equipment');
    expect(spec(sword, 'equip')!.value).toBe(2);
    expect(spec(sword, 'length')).toBeDefined();
    const saga = card({ typeLine: 'Enchantment — Saga', power: null, toughness: null, oracleText: 'I — Draw a card.\nII, III — Scry 2.' });
    expect(spec(saga, 'chapters')!.value).toBe(2);
    expect(card({ typeLine: 'Battle — Siege', defense: '5', power: null, toughness: null }).kind).toBe('battle');
  });

  it('formats values per language with scaled units', () => {
    const f = (value: number, unit: 'kg' | 'm' | 'hp' | 'percent', lang: 'de' | 'en' = 'de') => formatDexStat({ id: 'x', label: { de: '', en: '' }, value, unit }, lang);
    expect(f(9100, 'kg')).toBe('9,1 t');
    expect(f(0.021, 'kg')).toBe('21 g');
    expect(f(0.42, 'm')).toBe('42 cm');
    expect(f(1234, 'hp')).toBe('1.234 PS');
    expect(f(1234, 'hp', 'en')).toBe('1,234 hp');
    expect(f(12, 'percent', 'en')).toBe('12%');
  });
});
