/**
 * manifest.json: the only file the app polls (daily). Every artifact the data build ships is
 * listed with size and SHA-256 so the client can download in the background, verify, and swap
 * atomically. Paths are relative to the manifest URL.
 */

export const MANIFEST_SCHEMA = 1;

export interface ArtifactFile {
  path: string;
  bytes: number;
  sha256: string;
  /** Transfer encoding of the file at `path`; the content hash is of the stored (encoded) bytes. */
  encoding?: 'gzip';
}

export interface ShardedArtifact {
  /** Directory relative to the manifest, shards are `${dir}/${key}.json`. */
  dir: string;
  /** How a shard key is derived, e.g. first two hex chars of the Scryfall id. */
  keyedBy: 'scryfallId:2' | 'oracleId:2';
  count: number;
}

export interface DataManifest {
  schema: typeof MANIFEST_SCHEMA;
  /** Data version, sortable, e.g. "2026-10-24.1". */
  version: string;
  generated: string;
  /** Minimum app build that can read this data (bumped on breaking catalog schema changes). */
  minAppSchema: number;
  artifacts: {
    /** Read-only catalog, SQLite with FTS5 (see catalog/schema.ts). */
    catalog: ArtifactFile;
    /** Perceptual-hash index for the scanner (format owned by the scanner, see scan/). */
    scanIndex?: ArtifactFile;
    /** All curated lore entries in one JSON file (LoreBundle). */
    lore?: ArtifactFile;
    /** 90-day Cardmarket price history from MTGJSON, sharded (PriceHistoryShard). */
    priceHistory?: ShardedArtifact;
  };
  /** Attribution shown in the app's about screen. */
  sources: { name: string; url: string; license: string }[];
}

/** One price-history shard: scryfallId -> series. */
export type PriceHistoryShard = Record<string, PriceSeries>;

export interface PriceSeries {
  currency: 'EUR';
  /** ISO date of the last point. */
  until: string;
  /** [dayOffsetFromUntil (<= 0), eur] pairs, oldest first. */
  normal?: [number, number][];
  foil?: [number, number][];
}

export function shardKey(id: string, chars = 2): string {
  return id.slice(0, chars).toLowerCase();
}
