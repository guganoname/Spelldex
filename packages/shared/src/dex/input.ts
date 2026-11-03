import type { CardDetail } from '../contracts/card.ts';
import type { DexInput, Loc } from './types.ts';

/** Builds the generator input for one face of a card (face 1 = back of a transform card). */
export function dexInputFromCard(card: CardDetail, face = 0, plane: Loc | null = null): DexInput {
  const f = card.faces?.[face] ?? null;
  const typeLineDe = card.typeLineDe?.split('//')[face]?.trim() ?? null;
  return {
    seed: `${card.oracleId}:${f ? face : 0}`,
    name: f?.name ?? card.name,
    typeLine: f?.typeLine ?? card.typeLine,
    typeLineDe: f ? typeLineDe : card.typeLineDe,
    oracleText: f ? f.oracleText : card.oracleText,
    flavorText: card.flavorText,
    power: f ? f.power : card.power,
    toughness: f ? f.toughness : card.toughness,
    loyalty: f ? f.loyalty : card.loyalty,
    defense: f ? f.defense : card.defense,
    manaValue: card.manaValue,
    // MTGJSON keywords cover all faces; for a face we rely on its own keyword lines.
    keywords: f ? [] : card.keywords,
    colors: card.colors,
    rarity: card.rarity,
    plane,
  };
}
