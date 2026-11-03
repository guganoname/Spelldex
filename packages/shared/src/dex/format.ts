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
    case 'km': return `${n(v)} km`;
    case 'mm': return `${n(v)} mm`;
    case 'kj': return v >= 1000 ? `${n(v / 1000)} MJ` : `${n(v)} kJ`;
    case 'bpm': return `${int(v)} ${de ? 'Schläge/min' : 'bpm'}`;
    case 'cubicm': return `${n(v)} m³`;
    case 'kv': return `${n(v)} kV`;
    case 'minutes': return `${n(v, 2)} min`;
    case 'permille': return `${n(v, 2)} ‰`;
    case 'decimal': return n(v, 2);
    case 'richter': return `${n(v, 2)} ${de ? 'auf der Richterskala' : 'on the Richter scale'}`;
    case 'gcm3': return `${n(v, 2)} g/cm³`;
    case 'mg': return v >= 1000 ? `${n(v / 1000)} g` : `${n(v)} mg`;
    case 'ml': return v >= 1000 ? `${n(v / 1000)} l` : `${n(v)} ml`;
    case 'ms': return `${int(v)} ms`;
    case 'kcal': return `${int(v)} kcal`;
    case 'hz': return `${int(v)} Hz`;
    case 'manam3': return `${n(v, 2)} Mana/m³`;
    case 'generations': return `${int(v)} ${de ? 'Generationen' : 'generations'}`;
    case 'ppm': return `${int(v)} ppm`;
    case 'hpmin': return `${n(v, 2)} ${de ? 'LP/min' : 'HP/min'}`;
    default: return int(v);
  }
}
