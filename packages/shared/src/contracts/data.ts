/**
 * APIs of the data worker (one worker holds catalog.db and collection.db via sqlite-wasm on OPFS).
 * The main thread talks to it through Comlink; all methods are async on the caller side.
 */
import type {
  CardDetail, CardSummary, ComboSummary, Finish, OracleId, Printing, ScryfallId, SearchQuery,
  SearchResult, SetInfo,
} from './card.ts';

export type CatalogPhase = 'empty' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error';

export interface CatalogStatus {
  phase: CatalogPhase;
  /** Installed data version (manifest.version) or null. */
  version: string | null;
  /** Download progress 0..1 while downloading. */
  progress?: number;
  /** Where the DB lives: persistent OPFS or memory fallback (data lost on reload). */
  storage: 'opfs' | 'memory' | null;
  error?: string;
  printings?: number;
  cards?: number;
}

export interface CatalogApi {
  status(): Promise<CatalogStatus>;
  /**
   * Install or update the catalog from the manifest. Downloads in the background, verifies
   * SHA-256, swaps atomically. Resolves with the new status. Safe to call on every start.
   */
  sync(manifestUrl: string, onProgress?: (s: CatalogStatus) => void): Promise<CatalogStatus>;
  getCard(scryfallId: ScryfallId): Promise<CardDetail | null>;
  /** Default printing of an oracle card (newest regular printing). */
  getCardByOracle(oracleId: OracleId): Promise<CardDetail | null>;
  getPrintings(oracleId: OracleId): Promise<Printing[]>;
  getSummaries(ids: ScryfallId[]): Promise<CardSummary[]>;
  findBySetNumber(setCode: string, collectorNumber: string): Promise<CardSummary | null>;
  search(query: SearchQuery): Promise<SearchResult>;
  getSets(): Promise<SetInfo[]>;
  getSet(code: string): Promise<SetInfo | null>;
  getSetPrintings(code: string): Promise<CardSummary[]>;
  getCombos(oracleId: OracleId, limit?: number): Promise<ComboSummary[]>;
  random(): Promise<CardSummary | null>;
}

export type SeenSource = 'scan' | 'view' | 'import';
export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';

export interface OwnedEntry {
  scryfallId: ScryfallId;
  finish: Finish;
  /** ISO 639-1 language of the physical card, e.g. "de", "en". */
  lang: string;
  condition: Condition;
  quantity: number;
}

export interface SeenResult {
  /** First time this printing was seen. */
  newPrinting: boolean;
  /** First time any printing of this card (oracle id) was seen. */
  newCard: boolean;
}

export type ProgressScope =
  | { kind: 'all' }
  | { kind: 'set'; code: string; includeVariants?: boolean }
  | { kind: 'plane'; plane: string };

export interface Progress {
  seen: number;
  owned: number;
  total: number;
}

export interface CollectionStats {
  seenCards: number;
  seenPrintings: number;
  ownedCopies: number;
  lastSeenAt: string | null;
}

export type CollectionEvent =
  | { type: 'seen'; at: string; scryfallId: ScryfallId; oracleId: OracleId; source: SeenSource }
  | { type: 'owned'; at: string; entry: OwnedEntry }
  | { type: 'goal'; at: string; goal: ProgressScope; active: boolean };

export interface CollectionExport {
  format: 'spelldex-collection';
  schema: 1;
  exportedAt: string;
  /** Full event log; replaying it rebuilds the collection (also the base for a later sync). */
  events: CollectionEvent[];
}

export interface CollectionApi {
  markSeen(scryfallId: ScryfallId, source: SeenSource): Promise<SeenResult>;
  isSeen(ids: ScryfallId[]): Promise<Record<ScryfallId, boolean>>;
  setOwned(entry: OwnedEntry): Promise<void>;
  getOwned(scryfallId: ScryfallId): Promise<OwnedEntry[]>;
  getProgress(scope: ProgressScope): Promise<Progress>;
  stats(): Promise<CollectionStats>;
  recent(limit?: number): Promise<{ scryfallId: ScryfallId; at: string }[]>;
  exportJson(): Promise<CollectionExport>;
  importJson(data: CollectionExport): Promise<{ events: number }>;
  /** Number of new cards since the last export (drives the export reminder). */
  newSinceExport(): Promise<number>;
}

/** What the data worker exposes over Comlink. */
export interface DataWorkerApi {
  catalog: CatalogApi;
  collection: CollectionApi;
}
