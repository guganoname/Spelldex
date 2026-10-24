/**
 * Owned by the scanner thread: perceptual hash, Hamming distance and the scan-index.bin codec.
 * Shared by the data build (index) and the scan worker (camera frames), so both hash identically.
 */
export * from './phash.ts';
export * from './index-codec.ts';
