import { ART_HASH, popcount32, type CardHashes } from '@spelldex/shared/scan';
import { HASH_STRIDE, type ScanIndex } from '@spelldex/shared/scan';

export interface Neighbour {
  i: number;
  dArt: number;
  dFull: number;
  score: number;
}

/** Weight of the 64-bit full-card distance relative to the 256-bit art distance. */
export const FULL_WEIGHT = 1;

/**
 * Brute-force k-nearest search over the whole index. Each query is one
 * orientation of the camera card; the best orientation wins per entry.
 * 100k entries x 2 orientations x 10 words is about a millisecond, no tree needed.
 */
export function searchIndex(index: ScanIndex, queries: CardHashes[], k = 8): Neighbour[] {
  const h = index.hashes;
  const AW = ART_HASH.words;
  const q = queries.map((c) => Uint32Array.from([...c.art, ...c.full]));
  const best: Neighbour[] = [];
  let worst = Infinity; // score of best[k-1] once full
  for (let i = 0, o = 0; i < index.n; i++, o += HASH_STRIDE) {
    let bScore = Infinity, bArt = 0, bFull = 0;
    for (let j = 0; j < q.length; j++) {
      const qq = q[j]!;
      let dArt = 0;
      for (let w = 0; w < AW; w++) dArt += popcount32(h[o + w]! ^ qq[w]!);
      // Early out: art alone is already worse than the current k-th best.
      if (dArt >= worst || dArt >= bScore) continue;
      let dFull = 0;
      for (let w = AW; w < HASH_STRIDE; w++) dFull += popcount32(h[o + w]! ^ qq[w]!);
      const s = dArt + FULL_WEIGHT * dFull;
      if (s < bScore) { bScore = s; bArt = dArt; bFull = dFull; }
    }
    if (bScore === Infinity || (best.length === k && bScore >= worst)) continue;
    let p = best.length === k ? k - 1 : best.length;
    if (best.length < k) best.push(null as unknown as Neighbour);
    while (p > 0 && best[p - 1]!.score > bScore) { best[p] = best[p - 1]!; p--; }
    best[p] = { i, dArt: bArt, dFull: bFull, score: bScore };
    if (best.length === k) worst = best[k - 1]!.score;
  }
  return best;
}
