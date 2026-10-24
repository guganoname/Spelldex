import type { CardDetail, CardLore, LoreBundle, LoreEntry, LoreKind } from '@spelldex/shared/contracts';

/** Card -> lore: plane via set, creature types via type line, character via card name. */
export function loreForCard(bundle: LoreBundle | null | undefined, card: CardDetail): CardLore {
  if (!bundle) return { plane: null, creatureTypes: [], character: null };
  const index = new Map<string, LoreEntry>(bundle.entries.map((e) => [`${e.kind}:${e.id}`, e]));
  const find = (kind: LoreKind, id: string | null | undefined) => (id ? index.get(`${kind}:${id}`) ?? null : null);

  const planeId = card.plane ?? bundle.setPlanes[card.setCode] ?? null;
  const subtypes = card.typeLine.split('—')[1]?.split('//')[0] ?? '';
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const creatureTypes = /Creature|Kindred|Tribal/.test(card.typeLine)
    ? subtypes.split(/\s+/).filter(Boolean).flatMap((t) => find('creature-type', slug(t)) ?? [])
    : [];
  const charId = bundle.characterCards?.[card.name] ?? null;
  return { plane: find('plane', planeId), creatureTypes, character: find('character', charId) };
}
