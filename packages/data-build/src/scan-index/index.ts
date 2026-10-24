/**
 * PLACEHOLDER, owned by the scanner thread: builds scan-index.bin from the catalog's printings
 * (downloads Scryfall images, hashes them with @spelldex/shared/scan, discards the images).
 * Contract: return the manifest entry, or null when the step is skipped.
 */
import type { ArtifactFile } from '@spelldex/shared/contracts';

export interface ScanIndexInput {
  /** Path of the finished catalog.db (read-only). */
  catalogPath: string;
  outDir: string;
  /** Previous index to reuse hashes for unchanged printings (incremental nightly build). */
  previousIndexPath?: string;
}

export async function buildScanIndex(_input: ScanIndexInput): Promise<ArtifactFile | null> {
  return null;
}
