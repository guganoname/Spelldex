/**
 * UI language. Two dictionaries (de is the source, en must cover every key), picked by
 * prefs.uiLanguage. Card texts have their own setting (prefs.cardLanguage), since many players
 * want an English interface with German cards or the other way round.
 */
import { useCallback } from 'react';
import type { EntryTab } from '@spelldex/shared/contracts';
import { useDeviceStore } from '../state/device.ts';
import { de, type MessageKey } from './de.ts';
import { en } from './en.ts';
import type { Lang } from './detect.ts';

export { detectLanguage, type Lang } from './detect.ts';
export const LANGS: readonly Lang[] = ['de', 'en'];
export type { MessageKey };

const DICTS: Record<Lang, Record<MessageKey, string>> = { de, en };
const LOCALES: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const s = DICTS[lang][key] ?? de[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export const localeOf = (lang: Lang) => LOCALES[lang];

export interface I18n {
  lang: Lang;
  locale: string;
  t(key: MessageKey, vars?: Vars): string;
  num(n: number): string;
  eur(v: number | null | undefined): string;
  date(d: string | number | Date): string;
  tab(t: EntryTab): string;
}

export function makeI18n(lang: Lang): I18n {
  const locale = LOCALES[lang];
  return {
    lang,
    locale,
    t: (key, vars) => translate(lang, key, vars),
    num: (n) => n.toLocaleString(locale),
    eur: (v) => (v == null ? '–' : v.toLocaleString(locale, { style: 'currency', currency: 'EUR' })),
    date: (d) => new Date(d).toLocaleDateString(locale),
    tab: (t) => translate(lang, `tab.${t}`),
  };
}

const cache = new Map<Lang, I18n>();
export function i18nFor(lang: Lang): I18n {
  let v = cache.get(lang);
  if (!v) cache.set(lang, (v = makeI18n(lang)));
  return v;
}

/** Hook for components: re-renders when the language changes. */
export function useI18n(): I18n {
  const lang = useDeviceStore((s) => s.prefs.uiLanguage);
  return i18nFor(lang);
}

/** Shorthand when only t() is needed. */
export function useT(): I18n['t'] {
  const { t } = useI18n();
  return useCallback(t, [t]);
}

/** Outside React (boot splash, document title). */
export function currentI18n(): I18n {
  return i18nFor(useDeviceStore.getState().prefs.uiLanguage);
}
