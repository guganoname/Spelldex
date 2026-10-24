/**
 * Scryfall, called directly from the client only (their terms forbid proxying or repackaging).
 * - API: ~10 requests/s max, we space requests 100 ms apart and cache results >= 24 h.
 * - Images: cards.scryfall.io CDN, not rate limited; never cropped or altered.
 */
import type { ScryfallId } from '../contracts/card.ts';

export const SCRYFALL_API = 'https://api.scryfall.com';
export const SCRYFALL_IMAGES = 'https://cards.scryfall.io';
/** Scryfall asks for results to be cached at least this long. */
export const SCRYFALL_CACHE_MS = 24 * 60 * 60 * 1000;

export type ImageSize = 'small' | 'normal' | 'large' | 'png' | 'art_crop' | 'border_crop';

/** CDN URL for a printing's image, built from the id (same scheme Scryfall uses in image_uris). */
export function scryfallImageUrl(id: ScryfallId, size: ImageSize = 'normal', face: 'front' | 'back' = 'front'): string {
  const ext = size === 'png' ? 'png' : 'jpg';
  return `${SCRYFALL_IMAGES}/${size}/${face}/${id[0]}/${id[1]}/${id}.${ext}`;
}

export function scryfallCardPage(id: ScryfallId): string {
  return `https://scryfall.com/card/${id}`;
}

/** The subset of a Scryfall card object we read. */
export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  prices: {
    eur: string | null;
    eur_foil: string | null;
    eur_etched?: string | null;
    usd: string | null;
    usd_foil: string | null;
  };
  purchase_uris?: { cardmarket?: string; tcgplayer?: string; cardhoarder?: string };
  related_uris?: Record<string, string>;
  cardmarket_id?: number;
  rulings_uri?: string;
  image_uris?: Partial<Record<ImageSize, string>>;
  card_faces?: { name: string; image_uris?: Partial<Record<ImageSize, string>> }[];
  artist?: string;
  illustration_id?: string;
}

export interface ScryfallRuling {
  source: 'wotc' | 'scryfall';
  published_at: string;
  comment: string;
}

export interface CardPrices {
  eur: number | null;
  eurFoil: number | null;
  eurEtched: number | null;
  usd: number | null;
  cardmarketUrl: string | null;
  fetchedAt: string;
}

export class ScryfallError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ScryfallError';
  }
}

type FetchFn = typeof fetch;

export interface ScryfallClientOptions {
  fetch?: FetchFn;
  /** Minimum spacing between API requests. */
  minIntervalMs?: number;
  baseUrl?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class ScryfallClient {
  private readonly fetchFn: FetchFn;
  private readonly minInterval: number;
  private readonly base: string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private last = -Infinity;

  constructor(opts: ScryfallClientOptions = {}) {
    this.fetchFn = opts.fetch ?? ((...a) => fetch(...a));
    this.minInterval = opts.minIntervalMs ?? 100;
    this.base = opts.baseUrl ?? SCRYFALL_API;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Serialises requests and keeps the minimum interval (shared by all callers of this client). */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.last + this.minInterval - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      return task();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
    return this.schedule(async () => {
      const res = await this.fetchFn(`${this.base}${path}`, {
        ...init,
        signal: signal ?? null,
        headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      if (res.status === 429) {
        // Back off hard; Scryfall may block clients that ignore 429.
        this.last = this.now() + 1000;
      }
      const body = (await res.json().catch(() => null)) as { object?: string; code?: string; details?: string } | null;
      if (!res.ok || body?.object === 'error') {
        throw new ScryfallError(res.status, body?.code ?? 'http_error', body?.details ?? res.statusText);
      }
      return body as T;
    });
  }

  getCard(id: ScryfallId, signal?: AbortSignal): Promise<ScryfallCard> {
    return this.request<ScryfallCard>(`/cards/${encodeURIComponent(id)}`, undefined, signal);
  }

  /** Up to 75 ids per request (Scryfall limit); larger lists are chunked. */
  async getCollection(ids: ScryfallId[], signal?: AbortSignal): Promise<ScryfallCard[]> {
    const out: ScryfallCard[] = [];
    for (let i = 0; i < ids.length; i += 75) {
      const chunk = ids.slice(i, i + 75);
      const res = await this.request<{ data: ScryfallCard[] }>(
        '/cards/collection',
        { method: 'POST', body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }) },
        signal,
      );
      out.push(...res.data);
    }
    return out;
  }

  async getRulings(id: ScryfallId, signal?: AbortSignal): Promise<ScryfallRuling[]> {
    const res = await this.request<{ data: ScryfallRuling[] }>(`/cards/${encodeURIComponent(id)}/rulings`, undefined, signal);
    return res.data;
  }

  async getPrices(id: ScryfallId, signal?: AbortSignal): Promise<CardPrices> {
    return toPrices(await this.getCard(id, signal), new Date(this.now()).toISOString());
  }
}

export function toPrices(card: ScryfallCard, fetchedAt: string): CardPrices {
  const num = (s: string | null | undefined) => (s == null || s === '' ? null : Number(s));
  return {
    eur: num(card.prices.eur),
    eurFoil: num(card.prices.eur_foil),
    eurEtched: num(card.prices.eur_etched),
    usd: num(card.prices.usd),
    cardmarketUrl: card.purchase_uris?.cardmarket ?? null,
    fetchedAt,
  };
}

/** Fallback when Scryfall has no purchase link: Cardmarket search by English name. */
export function cardmarketSearchUrl(name: string): string {
  return `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
}
