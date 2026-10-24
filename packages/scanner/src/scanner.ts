/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Quad, ScanFrameResult, ScanMatch } from '@spelldex/shared/contracts';
import { hashCard, rotate180, scryfallIdAt, type CardHashes, type ScanIndex } from '@spelldex/shared/scan';
import { artBoxHypotheses, detectCandidates, guideQuad, outerHypotheses, warpCard, warpCardRegion, type Corners, type CV, type RgbaImage } from './detect.ts';
import { searchIndex, type Neighbour } from './matcher.ts';
import { COLLECTOR_REGION, parseCollectorLine, type OcrFn } from './ocr.ts';

export interface ScannerOptions {
  /** Max art+full distance (of 320) for an accepted match on a detected outline. */
  acceptDistance: number;
  /** Below this the first quad is trusted without trying outer-outline hypotheses. */
  confidentDistance: number;
  /** Stricter limit when no outline was found and the guide box is hashed instead. */
  guideAcceptDistance: number;
  /** Required gap to the best entry with a *different* artwork. */
  minMargin: number;
  /** Consecutive frames with the same result before a hit fires. */
  stableFrames: number;
  /** Frames without the locked card before it may fire again. */
  releaseFrames: number;
  /** Try the centered guide box when no outline is found. */
  guideFallback: boolean;
}

export const DEFAULT_OPTIONS: ScannerOptions = {
  acceptDistance: 100,
  confidentDistance: 60,
  guideAcceptDistance: 80,
  minMargin: 16,
  stableFrames: 3,
  releaseFrames: 6,
  guideFallback: true,
};

/** Result of identifying one frame, before temporal stabilisation. */
export type FrameDecision = (
  | { kind: 'none'; quad: Corners | null }
  | { kind: 'match'; quad: Corners; match: ScanMatch }
  | { kind: 'ambiguous'; quad: Corners; candidates: ScanMatch[] }
) & { /** Nearest index entries of the last attempt, for diagnostics. */ nn?: Neighbour[] };

const toQuad = (c: Corners): Quad => c.map(([x, y]) => ({ x, y })) as Quad;

export class Scanner {
  readonly opts: ScannerOptions;
  private streakId: string | null = null;
  private streak = 0;
  private lockedId: string | null = null;
  private missing = 0;

  private readonly cv: CV;
  private readonly index: ScanIndex;
  private readonly ocr: OcrFn | undefined;

  constructor(cv: CV, index: ScanIndex, opts: Partial<ScannerOptions> = {}, ocr?: OcrFn) {
    this.cv = cv;
    this.index = index;
    this.ocr = ocr;
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  reset(): void {
    this.streakId = null;
    this.streak = 0;
    this.lockedId = null;
    this.missing = 0;
  }

  /** Hashes for both orientations of a warped card (upside-down cards are common). */
  static queriesFor(card: Uint8ClampedArray): CardHashes[] {
    return [hashCard(card), hashCard(rotate180(card))];
  }

  private toMatch(n: Neighbour, margin: number): ScanMatch {
    const i = n.i;
    // Confidence: 1 at distance 0, falls to ~0.5 at the accept limit; boosted by margin.
    const d = n.score / this.opts.acceptDistance;
    const conf = Math.max(0, Math.min(1, (1 - 0.5 * d) * Math.min(1, 0.6 + margin / 40)));
    return {
      scryfallId: scryfallIdAt(this.index, i),
      distance: n.score,
      confidence: Math.round(conf * 100) / 100,
      region: n.dArt <= n.dFull ? 'art' : 'full',
      set: this.index.set[i]!,
      collectorNumber: this.index.collectorNumber[i]!,
    };
  }

  /** Identify a single frame without temporal logic. Exposed for benchmarks. */
  async identify(frame: RgbaImage): Promise<FrameDecision> {
    const cv = this.cv;
    const src = cv.matFromImageData(frame);
    try {
      // Hypotheses for where the card is, most likely first. Each costs a warp,
      // two hashes and an index scan (~5 ms); we stop at the first confident match.
      const cands = detectCandidates(cv, src, 3);
      const detected = cands[0] ?? null;
      const hyps: (() => Corners[])[] = [];
      for (const c of cands) hyps.push(() => [c]);
      for (const c of cands) hyps.push(() => outerHypotheses(cv, src, c));
      for (const c of cands) hyps.push(() => artBoxHypotheses(cv, src, c));
      const guide = this.opts.guideFallback ? guideQuad(frame.width, frame.height) : null;
      if (guide) hyps.push(() => [guide]);

      let nn: Neighbour[] = [];
      let quad: Corners | null = null;
      for (const h of hyps) {
        for (const q of h()) {
          const r = searchIndex(this.index, Scanner.queriesFor(warpCard(cv, src, q)), 12);
          if (r[0] && (!nn[0] || r[0].score < nn[0].score)) { nn = r; quad = q; }
        }
        if (nn[0] && nn[0].score <= this.opts.confidentDistance) break;
      }
      const nnOut = nn;
      const withNn = <T extends object>(x: T) => ({ ...x, nn: nnOut });
      const best = nn[0];
      const limit = quad === guide || !detected ? this.opts.guideAcceptDistance : this.opts.acceptDistance;
      if (best && quad && best.score <= limit) {
        const g = this.index.group;
        const otherArt = nn.find((n) => g[n.i] !== g[best.i]);
        const margin = otherArt ? otherArt.score - best.score : 64;
        if (margin < this.opts.minMargin) {
          // Two different artworks are about equally close.
          const cands = nn.filter((n) => n.score <= limit).slice(0, 3).map((n) => this.toMatch(n, margin));
          return withNn({ kind: 'ambiguous' as const, quad, candidates: cands });
        }
        // Same artwork printed in several sets: the art hash cannot tell them apart.
        // Pick by OCR of the collector line if enabled, else the closest full-card hash,
        // and hand the other prints to the UI.
        const sameArt = nn.filter((n) => g[n.i] === g[best.i] && n.score <= limit + 24);
        let chosen = best;
        if (sameArt.length > 1) chosen = (await this.resolveReprint(src, quad, sameArt)) ?? best;
        const match = this.toMatch(chosen, margin);
        if (sameArt.length > 1)
          match.otherPrints = sameArt.filter((n) => n !== chosen).map((n) => ({
            scryfallId: scryfallIdAt(this.index, n.i), set: this.index.set[n.i]!, collectorNumber: this.index.collectorNumber[n.i]!,
          }));
        return withNn({ kind: 'match' as const, quad, match });
      }
      return withNn({ kind: 'none' as const, quad: detected });
    } finally {
      src.delete();
    }
  }

  private async resolveReprint(src: any, quad: Corners, cands: Neighbour[]): Promise<Neighbour | null> {
    if (!this.ocr) return null;
    // 3x the index resolution so the 6-point collector line is ~25 px tall.
    const W = Math.round(488 * COLLECTOR_REGION.w * 3);
    const H = Math.round(680 * COLLECTOR_REGION.h * 3);
    const img = warpCardRegion(this.cv, src, quad, COLLECTOR_REGION, W, H);
    const text = await this.ocr({ data: img, width: W, height: H });
    const parsed = parseCollectorLine(text);
    if (!parsed.number) return null;
    const norm = (s: string) => s.replace(/^0+/, '').toLowerCase();
    const byNumber = cands.filter((n) => norm(this.index.collectorNumber[n.i]!) === norm(parsed.number!));
    const bySet = parsed.set ? byNumber.filter((n) => this.index.set[n.i]!.toUpperCase() === parsed.set) : [];
    const pick = bySet[0] ?? (byNumber.length === 1 ? byNumber[0] : undefined);
    return pick ?? null;
  }

  /** Full per-frame step: identify, then require `stableFrames` agreeing frames before a hit. */
  async processFrame(frame: RgbaImage): Promise<ScanFrameResult> {
    const t0 = performance.now();
    const d = await this.identify(frame);
    const ms = Math.round((performance.now() - t0) * 10) / 10;

    // Same key for "this card" and "this set of look-alikes", so both need stable frames.
    const key = d.kind === 'match' ? d.match.scryfallId : d.kind === 'ambiguous' ? `?${d.candidates[0]!.scryfallId}` : null;
    const lockedId = this.lockedId && !this.lockedId.startsWith('?') ? this.lockedId : undefined;

    if (this.lockedId) {
      const stillThere = key === this.lockedId ||
        (d.kind === 'ambiguous' && d.candidates.some((c) => c.scryfallId === this.lockedId));
      if (stillThere) {
        this.missing = 0;
        return { state: 'tracking', quad: toQuad(d.quad!), ms, lockedId };
      }
      // A different card fires immediately once it is stable; an empty frame releases after a few frames.
      if (key || ++this.missing >= this.opts.releaseFrames) this.lockedId = null;
      else return d.quad ? { state: 'tracking', quad: toQuad(d.quad), ms, lockedId } : { state: 'searching', ms };
    }

    if (!key || d.kind === 'none') {
      this.streakId = null;
      this.streak = 0;
      return d.quad ? { state: 'tracking', quad: toQuad(d.quad), ms } : { state: 'searching', ms };
    }
    if (key === this.streakId) this.streak++;
    else {
      this.streakId = key;
      this.streak = 1;
    }
    const stable = this.streak >= this.opts.stableFrames;
    if (stable) {
      this.lockedId = key;
      this.missing = 0;
      this.streakId = null;
      this.streak = 0;
    }
    if (d.kind === 'ambiguous')
      return stable ? { state: 'ambiguous', quad: toQuad(d.quad), candidates: d.candidates, ms } : { state: 'tracking', quad: toQuad(d.quad), ms };
    return stable
      ? { state: 'hit', quad: toQuad(d.quad), match: d.match, ms }
      : { state: 'candidate', quad: toQuad(d.quad), best: d.match, streak: this.streak, ms };
  }
}
