/**
 * Owned by the scanner thread: pHash, Hamming distance and the scan-index.bin codec
 * (magic "SPLX", u16 version, u32 count, then count x 32 bytes: 16-byte Scryfall UUID,
 * 8-byte art hash, 8-byte full-card hash, little endian). Shared by the data build and the worker.
 */
export {};
