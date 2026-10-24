/**
 * Bundles curated lore from packages/lore/content into lore.json (LoreBundle).
 * Layout (owned by the lore thread): content/<kind-dir>/<id>.json, content/set-planes.json,
 * optional content/character-cards.json. Validation is strict: a bad entry fails the build.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LoreBundle, LoreEntry, LoreKind } from '@spelldex/shared/contracts';

const DIRS: Record<string, LoreKind> = {
  planes: 'plane',
  'creature-types': 'creature-type',
  characters: 'character',
  events: 'event',
};

export function validateLoreEntry(e: LoreEntry, file: string): string[] {
  const errs: string[] = [];
  if (!/^[a-z0-9-]+$/.test(e.id ?? '')) errs.push(`${file}: id must be a lowercase slug`);
  if (!e.name?.de || !e.name?.en) errs.push(`${file}: name.de and name.en are required`);
  if (!e.summary?.de) errs.push(`${file}: summary.de is required`);
  if (e.status !== 'draft' && e.status !== 'reviewed') errs.push(`${file}: status must be draft|reviewed`);
  if (!Array.isArray(e.sources)) errs.push(`${file}: sources[] is required`);
  for (const f of e.facts ?? []) {
    if (!f.source?.url) errs.push(`${file}: fact "${f.label}" has no canonical source`);
  }
  return errs;
}

export async function bundleLore(contentDir: string): Promise<LoreBundle | null> {
  if (!existsSync(contentDir)) return null;
  const entries: LoreEntry[] = [];
  const errors: string[] = [];
  for (const [dir, kind] of Object.entries(DIRS)) {
    const path = join(contentDir, dir);
    if (!existsSync(path)) continue;
    for (const f of (await readdir(path)).filter((x) => x.endsWith('.json')).sort()) {
      const e = JSON.parse(await readFile(join(path, f), 'utf8')) as LoreEntry;
      e.kind ??= kind;
      errors.push(...validateLoreEntry(e, `${dir}/${f}`));
      entries.push(e);
    }
  }
  if (errors.length) throw new Error(`Lore validation failed:\n${errors.join('\n')}`);
  const readOpt = async <T>(name: string): Promise<T | undefined> =>
    existsSync(join(contentDir, name)) ? (JSON.parse(await readFile(join(contentDir, name), 'utf8')) as T) : undefined;
  const setPlanes = Object.fromEntries(
    Object.entries((await readOpt<Record<string, string | null>>('set-planes.json')) ?? {}).map(([k, v]) => [k.toUpperCase(), v]),
  );
  const characterCards = await readOpt<Record<string, string>>('character-cards.json');
  return { schema: 1, entries, setPlanes, ...(characterCards ? { characterCards } : {}) };
}
