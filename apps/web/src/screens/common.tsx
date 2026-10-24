import type { CatalogStatus } from '@spelldex/shared/contracts';
import { useCatalogReady } from '../data/hooks.ts';
import css from './screen.module.css';

const PHASE: Record<CatalogStatus['phase'], string> = {
  empty: 'Kartenarchiv wird vorbereitet …',
  downloading: 'Kartenarchiv wird geladen',
  verifying: 'Prüfe Kartenarchiv …',
  installing: 'Richte Kartenarchiv ein …',
  ready: 'Bereit',
  error: 'Kartenarchiv konnte nicht geladen werden',
};

/** Shown instead of a screen until the catalog is installed (first start only). */
export function CatalogGate({ children }: { children: React.ReactNode }) {
  const s = useCatalogReady();
  if (s.phase === 'ready') return <>{children}</>;
  return (
    <div className={css.center}>
      <div style={{ width: '100%', display: 'grid', gap: 10 }}>
        <p className={css.title}>{PHASE[s.phase]}</p>
        {s.phase === 'downloading' && (
          <div className={css.bar} role="progressbar" aria-valuenow={Math.round((s.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={css.barFill} style={{ width: `${(s.progress ?? 0) * 100}%` }} />
          </div>
        )}
        {s.error && <p className={css.muted}>{s.error}</p>}
        {s.phase === 'error' && <p className={css.muted}>Bitte mit dem Internet verbinden. Danach läuft alles offline.</p>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className={css.spread}>
        <span className={css.muted}>{label}</span>
        <span className={css.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString('de-DE')} / {total.toLocaleString('de-DE')}</span>
      </div>
      <div className={css.bar} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={css.barFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const eur = (v: number | null | undefined) =>
  v == null ? '–' : v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
