import type { DexLang, DexStat, Loc } from './types.ts';

export const loc = (l: Loc, lang: DexLang) => l[lang];

const LOCALE: Record<DexLang, string> = { de: 'de-DE', en: 'en-GB' };

/** Formats a stat value for display, scaling mass and length (g/kg/t, cm/m/km). */
export function formatDexStat(s: DexStat, lang: DexLang, locale = LOCALE[lang]): string {
  if (s.text) return s.text[lang];
  const v = s.value ?? 0;
  const n = (x: number, d = 3) => new Intl.NumberFormat(locale, { maximumSignificantDigits: d }).format(x);
  const int = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(x);
  const de = lang === 'de';
  const pct = (x: string) => (de ? `${x} %` : `${x}%`);
  switch (s.unit) {
    case 'm':
      if (v >= 1000) return `${n(v / 1000)} km`;
      if (v < 1) return `${int(v * 100)} cm`;
      return `${n(v)} m`;
    case 'kg':
      if (v === 0) return '0 g';
      if (v >= 1000) return `${n(v / 1000)} t`;
      if (v < 1) return `${n(v * 1000, 2)} g`;
      return `${n(v)} kg`;
    case 'kmh': return `${n(v)} km/h`;
    case 'knots': return `${n(v)} ${de ? 'Knoten' : 'kn'}`;
    case 'hp': return `${int(v)} ${de ? 'PS' : 'hp'}`;
    case 'kw': return `${n(v)} kW`;
    case 'celsius': return `${int(v)} °C`;
    case 'years': return `${int(v)} ${de ? (v === 1 ? 'Jahr' : 'Jahre') : v === 1 ? 'year' : 'years'}`;
    case 'hours': return `${int(v)} ${de ? 'Std.' : 'h'}`;
    case 'seconds': return `${n(v, 2)} s`;
    case 'km2': return `${n(v)} km²`;
    case 'db': return `${int(v)} dB`;
    case 'liters': return `${int(v)} ${de ? 'l' : 'L'}`;
    case 'percent': return pct(n(v, 2));
    case 'rating10': return `${int(v)}/10`;
    case 'stars': return '★'.repeat(v) + '☆'.repeat(Math.max(0, 5 - v));
    case 'mana': return `${n(v, 2)} Mana`;
    case 'newton': return `${int(v)} N`;
    case 'lumen': return `${int(v)} lm`;
    default: return int(v);
  }
}
