/**
 * Streaming JSON for the big bulk files (AllPrintings ~0.5 GB, AllPrices, Spellbook ~0.7 GB):
 * none of them fit into JSON.parse. stream-json and stream-chain are CommonJS, so the dynamic
 * import yields their API on `default`.
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';

type Mode = 'object' | 'array';

/** Yields the entries of the object (or array) at top-level key `key`. */
export async function* streamJson<T>(path: string, key: string, mode: Mode): AsyncGenerator<{ key: string | number; value: T }> {
  const [chainMod, parserMod, pickMod, streamerMod] = await Promise.all([
    import('stream-chain'),
    import('stream-json'),
    import('stream-json/filters/Pick.js'),
    mode === 'object' ? import('stream-json/streamers/StreamObject.js') : import('stream-json/streamers/StreamArray.js'),
  ]);
  const chain = (chainMod.default ?? chainMod) as unknown as { chain(stages: unknown[]): AsyncIterable<{ key: string | number; value: T }> };
  const pj = (parserMod.default ?? parserMod) as unknown as { parser(): unknown };
  const pk = (pickMod.default ?? pickMod) as unknown as { pick(o: { filter: string }): unknown };
  const sm = (streamerMod.default ?? streamerMod) as unknown as { streamObject?: () => unknown; streamArray?: () => unknown };
  const stages: unknown[] = [createReadStream(path)];
  if (path.endsWith('.gz')) stages.push(createGunzip());
  stages.push(pj.parser(), pk.pick({ filter: key }), mode === 'object' ? sm.streamObject!() : sm.streamArray!());
  yield* chain.chain(stages);
}
