import type { Color } from '../contracts/card.ts';

const ORDER = 'WUBRG';

/** ["G","W"] -> "WG" (sorted WUBRG). */
export function encodeColors(colors: readonly string[] | undefined | null): string {
  if (!colors) return '';
  return [...new Set(colors)].filter((c) => ORDER.includes(c)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('');
}

export function decodeColors(s: string | null | undefined): Color[] {
  return (s ?? '').split('').filter(Boolean) as Color[];
}

/** Sort key for collector numbers like "12", "12a", "★5", "A-12": numeric part * 100 + suffix. */
export function collectorNumberSort(n: string): number {
  const m = /(\d+)/.exec(n);
  if (!m) return 99_999_999;
  const num = Number(m[1]);
  const rest = n.replace(m[1]!, '');
  const suffix = rest ? Math.min(99, [...rest].reduce((a, c) => a + c.charCodeAt(0), 0) % 99 + 1) : 0;
  return num * 100 + suffix;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
