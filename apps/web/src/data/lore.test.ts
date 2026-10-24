import { describe, expect, it } from 'vitest';
import type { CardDetail, LoreBundle, LoreEntry } from '@spelldex/shared/contracts';
import { loreForCard } from './lore.ts';

const entry = (kind: LoreEntry['kind'], id: string): LoreEntry => ({
  id, kind, name: { de: id, en: id }, summary: { de: id }, status: 'draft', sources: [],
});
const bundle: LoreBundle = {
  schema: 1,
  entries: [entry('plane', 'innistrad'), entry('creature-type', 'human'), entry('creature-type', 'wizard'), entry('character', 'sorin-markov')],
  setPlanes: { ISD: 'innistrad' },
  characterCards: { 'Sorin Markov': 'sorin-markov' },
};
const card = (p: Partial<CardDetail>) => ({ setCode: 'ISD', plane: null, typeLine: 'Instant', name: 'X', ...p }) as CardDetail;

describe('loreForCard', () => {
  it('finds the plane via the set and creature types via the type line', () => {
    const l = loreForCard(bundle, card({ typeLine: 'Creature — Human Wizard // Creature — Human Insect' }));
    expect(l.plane?.id).toBe('innistrad');
    expect(l.creatureTypes.map((e) => e.id)).toEqual(['human', 'wizard']);
  });

  it('ignores subtypes of non-creatures and finds characters by name', () => {
    const l = loreForCard(bundle, card({ name: 'Sorin Markov', typeLine: 'Legendary Planeswalker — Sorin', setCode: 'ZEN' }));
    expect(l.creatureTypes).toEqual([]);
    expect(l.plane).toBeNull();
    expect(l.character?.id).toBe('sorin-markov');
  });
});
