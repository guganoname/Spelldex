import { describe, expect, it } from 'vitest';
import { CollectionStore } from '@spelldex/shared/collection';
import type { CardSummary } from '@spelldex/shared/contracts';
import { nodeDb } from '../src/node-db.ts';

const card = (id: string, oracle: string, set = 'M10'): CardSummary => ({
  scryfallId: id, oracleId: oracle, name: id, nameDe: null, setCode: set, collectorNumber: '1', rarity: 'common',
  manaCost: null, typeLine: 'Instant', colors: [], colorIdentity: [], hasBackFace: false,
});

describe('collection store', () => {
  it('counts seen per card and per printing, and owning implies seen', () => {
    const s = new CollectionStore(nodeDb(':memory:'));
    expect(s.markSeen(card('a', 'bolt'), 'scan')).toEqual({ newCard: true, newPrinting: true });
    expect(s.markSeen(card('b', 'bolt', 'C21'), 'scan')).toEqual({ newCard: false, newPrinting: true });
    expect(s.markSeen(card('a', 'bolt'), 'view')).toEqual({ newCard: false, newPrinting: false });
    s.setOwned({ scryfallId: 'c', finish: 'foil', lang: 'de', condition: 'NM', quantity: 2 }, card('c', 'ring', 'C21'));
    expect(s.stats()).toMatchObject({ seenCards: 2, seenPrintings: 3, ownedCopies: 2 });
    expect(s.countSet('c21')).toEqual({ seen: 2, owned: 1 });
    expect(s.isSeen(['a', 'z'])).toEqual({ a: true, z: false });
  });

  it('round-trips through export and import', () => {
    const a = new CollectionStore(nodeDb(':memory:'));
    a.markSeen(card('a', 'bolt'), 'scan');
    a.setOwned({ scryfallId: 'a', finish: 'nonfoil', lang: 'en', condition: 'EX', quantity: 3 }, card('a', 'bolt'));
    a.setOwned({ scryfallId: 'a', finish: 'nonfoil', lang: 'en', condition: 'EX', quantity: 1 }, card('a', 'bolt'));
    const dump = a.exportJson();
    expect(a.newSinceExport()).toBe(0);

    const b = new CollectionStore(nodeDb(':memory:'));
    const r = b.importJson(dump, (id) => (id === 'a' ? card('a', 'bolt') : null));
    expect(r.unknown).toBe(0);
    expect(b.getOwned('a')).toEqual([{ scryfallId: 'a', finish: 'nonfoil', lang: 'en', condition: 'EX', quantity: 1 }]);
    expect(b.stats().seenCards).toBe(1);
  });
});
