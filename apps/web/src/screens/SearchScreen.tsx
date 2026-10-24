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

const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'];
const TYPE_DE: Record<string, string> = {
  Creature: 'Kreatur', Instant: 'Spontan', Sorcery: 'Hexerei', Artifact: 'Artefakt',
  Enchantment: 'Verzauberung', Planeswalker: 'Planeswalker', Land: 'Land',
};

export function SearchScreen() {
  const { q } = searchRoute.useSearch();
  const navigate = useNavigate({ from: searchRoute.fullPath });
  const [text, setText] = useState(q);
  const [colors, setColors] = useState<Color[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const lang = useDeviceStore((s) => s.prefs.cardLanguage);
  const deferred = useDeferredValue(text);

  const query: SearchQuery = { text: deferred, colors, types, colorMatch: 'any', limit: 60 };
  const hasQuery = !!deferred.trim() || colors.length > 0 || types.length > 0;
  const result = useSearch(query, hasQuery).data;
  const items = hasQuery ? result?.items ?? [] : [];
  const current = items[Math.min(active, items.length - 1)];

  useEffect(() => setActive(0), [deferred, colors, types]);
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
            <div className={css.lensCard}><CardImage id={current.scryfallId} name={current.name} /></div>
          ) : (
            <span className={css.muted}>Name, Typ oder Regeltext eingeben</span>
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
              placeholder="z. B. Drache, Blitzschlag, draw a card"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Suche"
            />
            <div className={css.chips}>
              {COLORS.map((c) => (
                <button key={c} type="button" className={css.chip} aria-pressed={colors.includes(c)} ref={hapticTarget} onClick={() => toggle(colors, c, setColors)}>
                  <Symbol code={c} />
                </button>
              ))}
              {TYPES.map((t) => (
                <button key={t} type="button" className={css.chip} aria-pressed={types.includes(t)} ref={hapticTarget} onClick={() => toggle(types, t, setTypes)}>
                  {TYPE_DE[t]}
                </button>
              ))}
            </div>
            {hasQuery && result && <p className={css.muted}>{result.total.toLocaleString('de-DE')} Karten</p>}
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
