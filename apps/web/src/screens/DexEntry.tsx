/** Pokédex-style dex entry: specs about what the card shows, derived offline from its card data. */
import { useMemo } from 'react';
import type { CardDetail } from '@spelldex/shared/contracts';
import { dexInputFromCard, formatDexStat, generateDexEntry } from '@spelldex/shared/dex';
import { useI18n } from '../i18n/index.ts';
import { useLore } from '../data/hooks.ts';
import css from './screen.module.css';
import dex from './dex.module.css';

const T = {
  title: { de: 'Dex-Eintrag', en: 'Dex entry' },
  habitat: { de: 'Lebensraum', en: 'Habitat' },
  funny: { de: 'Kuriose Werte', en: 'Curious stats' },
  note: {
    de: 'Spelldex-Schätzung aus Typ, Stärke, Fähigkeiten und Flavor-Text der Karte. Zum Spaß, keine offizielle Lore.',
    en: "Spelldex estimate from the card's type, stats, abilities and flavor text. Just for fun, not official lore.",
  },
} as const;

/** Labels follow the UI language (app content), not the card-text language. */
export function DexEntry({ card, face = 0 }: { card: CardDetail; face?: number }) {
  const { lang, locale } = useI18n();
  const plane = useLore(card).data?.plane?.name ?? null;
  const e = useMemo(() => generateDexEntry(dexInputFromCard(card, face, plane)), [card, face, plane]);
  return (
    <section className={dex.dex} aria-label={T.title[lang]}>
      <div className={dex.head}>
        <span className={css.subtitle}>{T.title[lang]}</span>
        <span className={dex.category}>{e.category[lang]}</span>
      </div>
      <div className={dex.habitat}>{T.habitat[lang]}: {e.habitat[lang]}</div>
      <dl className={dex.specs}>
        {e.specs.map((s) => (
          <div key={s.id} className={dex.spec}>
            <dt title={s.label[lang]}>{s.label[lang]}</dt>
            <dd>{formatDexStat(s, lang, locale)}</dd>
          </div>
        ))}
      </dl>
      <p className={dex.entry}>{e.entry[lang]}</p>
      <span className={css.subtitle}>{T.funny[lang]}</span>
      <table className={css.table}>
        <tbody>
          {e.funny.map((s) => <tr key={s.id}><td>{s.label[lang]}</td><td>{formatDexStat(s, lang, locale)}</td></tr>)}
        </tbody>
      </table>
      <p className={css.muted} style={{ margin: 0 }}>{T.note[lang]}</p>
    </section>
  );
}
