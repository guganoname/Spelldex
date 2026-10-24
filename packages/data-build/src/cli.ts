/**
 * Data build entry. Example (CI):
 *   pnpm data:build --mtgjson AllPrintings.json.gz --prices AllPrices.json.gz \
 *     --spellbook variants.json --out dist/data
 * Writes catalog.db.gz, lore.json, prices/*, scan-index.bin and manifest.json into --out.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MANIFEST_SCHEMA, type DataManifest } from '@spelldex/shared/contracts';
import { CATALOG_SCHEMA } from '@spelldex/shared/catalog';
import {
  DEFAULT_RULES, DEFAULT_SCORE, makeSpellbookIndexer, type RuleSet, type ScoreConfig, type SpellbookVariant,
} from '@spelldex/shared/rules';
import { streamJson } from './streams.ts';
import { readMtgjsonSets } from './mtgjson.ts';
import { buildCatalog } from './catalog.ts';
import { bundleLore } from './lore.ts';
import { fileArtifact, writeArtifact } from './artifacts.ts';
import { latestPrice, readAllPrices, writePriceShards } from './prices.ts';
import { buildScanIndex } from './scan-index/index.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../..');

const { values: args } = parseArgs({
  options: {
    mtgjson: { type: 'string' },
    prices: { type: 'string' },
    spellbook: { type: 'string' },
    lore: { type: 'string', default: join(repo, 'packages/lore/content') },
    rules: { type: 'string', default: join(repo, 'packages/shared/src/rules/config') },
    out: { type: 'string', default: join(repo, 'dist/data') },
    version: { type: 'string' },
    'scan-index': { type: 'boolean', default: true },
  },
});

async function readJsonIf<T>(path: string): Promise<T | undefined> {
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as T) : undefined;
}

/** Streams Commander Spellbook's variants.json (~700 MB) into the indexer. */
async function readSpellbook(path: string) {
  const ix = makeSpellbookIndexer({ top: 5 });
  for await (const { value } of streamJson<SpellbookVariant>(path, 'variants', 'array')) ix.addVariant(value);
  return ix.finish();
}

async function main() {
  if (!args.mtgjson) throw new Error('--mtgjson <AllPrintings.json[.gz] | dir of set files> is required');
  const out = resolve(args.out!);
  await mkdir(out, { recursive: true });
  const version = args.version ?? new Date().toISOString().slice(0, 10);
  const t0 = Date.now();
  const log = (m: string) => console.log(`[data-build ${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

  const rules = (await readJsonIf<RuleSet>(join(args.rules!, 'archetype-rules.json'))) ?? DEFAULT_RULES;
  const score = (await readJsonIf<ScoreConfig>(join(args.rules!, 'score-weights.json'))) ?? DEFAULT_SCORE;
  const lore = await bundleLore(args.lore!);
  log(`lore: ${lore ? `${lore.entries.length} entries` : 'none'}`);

  let combos: Awaited<ReturnType<typeof readSpellbook>> | undefined;
  if (args.spellbook) combos = await readSpellbook(args.spellbook);
  log(`combos: ${combos ? `${combos.combos.size} cards with combos` : 'none'}`);

  const rawPrices = args.prices ? await readAllPrices(args.prices) : undefined;
  const latest = rawPrices
    ? new Map([...rawPrices].flatMap(([uuid, p]) => { const v = latestPrice(p); return v == null ? [] : [[uuid, v] as const]; }))
    : undefined;
  log(`prices: ${rawPrices ? `${rawPrices.size} printings` : 'none'}`);

  const dbPath = join(out, 'catalog.db');
  await rm(dbPath, { force: true });
  const { stats, uuidToScryfall } = await buildCatalog(dbPath, {
    sets: readMtgjsonSets(args.mtgjson),
    setPlanes: lore?.setPlanes,
    combos: combos?.combos,
    comboCounts: combos?.counts,
    rules,
    score,
    prices: latest,
    version,
  });
  log(`catalog: ${JSON.stringify(stats)}`);

  const manifest: DataManifest = {
    schema: MANIFEST_SCHEMA,
    version,
    generated: new Date().toISOString(),
    minAppSchema: CATALOG_SCHEMA,
    artifacts: { catalog: await fileArtifact(out, dbPath, 'catalog.db', true) },
    sources: [
      { name: 'MTGJSON', url: 'https://mtgjson.com', license: 'MIT' },
      { name: 'Scryfall (Bilder, Tagespreise, direkt vom Gerät)', url: 'https://scryfall.com', license: 'Scryfall API Terms' },
      ...(combos ? [{ name: 'Commander Spellbook', url: 'https://commanderspellbook.com', license: 'MIT (Backend), Daten mit Quellenangabe' }] : []),
    ],
  };

  if (lore) manifest.artifacts.lore = await writeArtifact(out, 'lore.json', Buffer.from(JSON.stringify(lore)));

  if (rawPrices) {
    manifest.artifacts.priceHistory = await writePriceShards(out, rawPrices, uuidToScryfall);
    log(`price shards: ${manifest.artifacts.priceHistory.count}`);
  }

  if (args['scan-index']) {
    const idx = await buildScanIndex({ catalogPath: dbPath, outDir: out });
    if (idx) manifest.artifacts.scanIndex = idx;
    log(`scan index: ${idx ? `${idx.bytes} bytes` : 'skipped'}`);
  }

  await rm(dbPath, { force: true });
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`done -> ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
