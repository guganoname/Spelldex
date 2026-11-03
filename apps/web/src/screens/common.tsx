import type { CatalogStatus } from '@spelldex/shared/contracts';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { useCatalogReady } from '../data/hooks.ts';
import { syncCatalog } from '../app/bootstrap.ts';
import { LANGS, useI18n, type Lang, type MessageKey } from '../i18n/index.ts';
import { useDeviceStore } from '../state/device.ts';
import css from './screen.module.css';

const PHASE: Record<CatalogStatus['phase'], MessageKey> = {
  empty: 'catalog.empty',
  downloading: 'catalog.downloading',
  verifying: 'catalog.verifying',
  installing: 'catalog.installing',
  ready: 'catalog.ready',
  error: 'catalog.error',
};

/** Shown instead of a screen until the catalog is installed (first start only). */
export function CatalogGate({ children }: { children: React.ReactNode }) {
  const s = useCatalogReady();
  const { t } = useI18n();
  if (s.phase === 'ready') return <>{children}</>;
  const pct = Math.round((s.progress ?? 0) * 100);
  return (
    <div className={css.center}>
      <div style={{ width: '100%', display: 'grid', gap: 10 }}>
        <p className={css.title}>{t(PHASE[s.phase])}</p>
        {s.phase === 'downloading' && (
          <>
            <div className={css.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={css.barFill} style={{ width: `${pct}%` }} />
            </div>
            <p className={css.muted}>{pct} % · {t('catalog.firstStart')}</p>
          </>
        )}
        {s.phase === 'error' && (
          <>
            <p className={css.muted}>{t('catalog.offline')}</p>
            {s.error && <p className={css.muted} style={{ fontSize: 12, opacity: 0.8 }}>{s.error}</p>}
            <button
              type="button"
              className={css.button}
              ref={hapticTarget}
              onClick={() => {
                feedback('press');
                void syncCatalog();
              }}
            >
              {t('common.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const { num } = useI18n();
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className={css.spread}>
        <span className={css.muted}>{label}</span>
        <span className={css.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>{num(value)} / {num(total)}</span>
      </div>
      <div className={css.bar} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={css.barFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Language switch (segmented). `target` picks which preference it sets; 'both' is the quick
 * switch on the start screen, where most people expect cards and interface to change together.
 */
export function LanguageSwitch({ target, label }: { target: 'ui' | 'card' | 'both'; label: string }) {
  const prefs = useDeviceStore((s) => s.prefs);
  const setPrefs = useDeviceStore((s) => s.setPrefs);
  const value = target === 'card' ? prefs.cardLanguage : prefs.uiLanguage;
  const choose = (lang: Lang) => {
    if (lang === value) return;
    feedback('toggle');
    if (target === 'ui') setPrefs({ uiLanguage: lang });
    else if (target === 'card') setPrefs({ cardLanguage: lang });
    else setPrefs({ uiLanguage: lang, cardLanguage: lang });
  };
  return (
    <div className={css.segmented} role="radiogroup" aria-label={label}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === value}
          lang={l}
          ref={hapticTarget}
          onClick={() => choose(l)}
        >
          {target === 'both' ? LANG_SHORT[l] : LANG_NAME[l]}
        </button>
      ))}
    </div>
  );
}

/** Language names are shown in their own language, whatever the interface language is. */
const LANG_NAME: Record<Lang, string> = { de: 'Deutsch', en: 'English' };
const LANG_SHORT: Record<Lang, string> = { de: 'DE', en: 'EN' };
