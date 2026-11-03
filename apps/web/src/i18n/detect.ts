/** Kept free of imports so the device store can use it without a cycle. */
export type Lang = 'de' | 'en';

/** First start: German for German-speaking browsers, English for everyone else. */
export function detectLanguage(): Lang {
  const list = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of list) {
    const code = l?.slice(0, 2).toLowerCase();
    if (code === 'de') return 'de';
    if (code === 'en') return 'en';
  }
  return 'en';
}
