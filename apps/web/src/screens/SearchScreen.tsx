/** Offline full-text search with filters; dpad moves the highlight, the lens previews it. */
import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { COLORS, type Color, type SearchQuery } from '@spelldex/shared/contracts';
import { searchRoute } from '../app/router.tsx';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useSearch } from '../data/hooks.ts';
import { useDeviceButton, useDeviceStore } from '../state/device.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { ManaCost, Symbol } from '../ui/symbols.tsx';
import { CatalogGate } from './common.tsx';
import css from './screen.module.css';
import { useI18n } from '../i18n/index.ts';

const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'] as const;

export function SearchScreen() {
  const { q } = searchRoute.useSearch();
  const navigate = useNavigate({ from: searchRoute.fullPath });
  const [text, setText] = useState(q);
  const [colors, setColors] = useState<Color[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const { t, num } = useI18n();
  const [active, setActive] = useState(0);
  const lang = useDeviceStore((s) => s.prefs.cardLanguage);
  const deferred = useDeferredValue(text);

  const query: SearchQuery = { text: deferred, colors, types, colorMatch: 'any', limit: 60 };
  const hasQuery = !!deferred.trim() || colors.length > 0 || types.length > 0;
  const search = useSearch(query, hasQuery);
  const result = search.data;
  const items = hasQuery ? result?.items ?? [] : [];
  const current = items[Math.min(active, items.length - 1)];

  useEffect(() => setActive(0), [deferred, colors, types]);
  // The d-pad moves the highlight; keep it in view inside the small screen.
  useEffect(() => {
    document.querySelector('[data-screen="bottom"] [data-active="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);
  useEffect(() => {
    const t = setTimeout(() => void navigate({ search: { q: text }, replace: true }), 400);
    return () => clearTimeout(t);
  }, [text, navigate]);

  useDeviceButton((b) => {
    if (b === 'dpad-down') setActive((i) => Math.min(items.length - 1, i + 1));
    else if (b === 'dpad-up') setActive((i) => Math.max(0, i - 1));
    else if ((b === 'dpad-right' || b === 'scan') && current) {
      void navigate({ to: '/karte/$id', params: { id: current.scryfallId }, search: { tab: 'overview' } });
    } else return false;
    return true;
  });

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => {
    feedback('toggle');
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  return (
    <>
      <TopScreen>
        <div className={css.lens}>
          {current ? (
            <div key={current.scryfallId} className={css.lensCard}><CardImage id={current.scryfallId} name={current.name} /></div>
          ) : (
            <span className={css.muted}>{t('search.lensHint')}</span>
          )}
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            <input
              className={css.input}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoFocus
              placeholder={t('search.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={t('search.label')}
            />
            <div className={css.chips}>
              {COLORS.map((c) => (
                <button key={c} type="button" className={css.chip} aria-pressed={colors.includes(c)} ref={hapticTarget} onClick={() => toggle(colors, c, setColors)}>
                  <Symbol code={c} />
                </button>
              ))}
              {TYPES.map((ty) => (
                <button key={ty} type="button" className={css.chip} aria-pressed={types.includes(ty)} ref={hapticTarget} onClick={() => toggle(types, ty, setTypes)}>
                  {t(`type.${ty}`)}
                </button>
              ))}
            </div>
            {hasQuery && result && result.total > 0 && <p className={css.muted}>{t('search.count', { n: num(result.total) })}</p>}
            {hasQuery && result && result.total === 0 && !search.isPlaceholderData && (
              <div style={{ display: 'grid', gap: 8 }}>
                <p className={css.muted}>{t('search.none')}</p>
                {(colors.length > 0 || types.length > 0) && (
                  <button type="button" className={css.button} ref={hapticTarget} onClick={() => { feedback('press'); setColors([]); setTypes([]); }}>
                    {t('search.clear')}
                  </button>
                )}
              </div>
            )}
            <ul className={css.list}>
              {items.map((c, i) => (
                <li key={c.oracleId}>
                  <Link className={css.listItem} data-active={i === active} to="/karte/$id" params={{ id: c.scryfallId }} search={{ tab: 'overview' }}>
                    <div className={css.listMain}>
                      <div className={css.listName}>{lang === 'de' && c.nameDe ? c.nameDe : c.name}</div>
                      <div className={css.listMeta}>{c.typeLine}</div>
                    </div>
                    <ManaCost cost={c.manaCost} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
