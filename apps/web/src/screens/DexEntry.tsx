/**
 * Pokédex-style dex entry: specs about what the card shows. Always derived offline from the card
 * data; with the optional AI setting on, a caption of the artwork refines it.
 */
import { useMemo } from 'react';
import type { CardDetail } from '@spelldex/shared/contracts';
import { dexInputFromCard, formatDexStat, generateDexEntry } from '@spelldex/shared/dex';
import { useArtAiStatus, useArtHints } from '../ai/client.ts';
import { useLore } from '../data/hooks.ts';
import { useDeviceStore } from '../state/device.ts';
import { useI18n } from '../i18n/index.ts';
import css from './screen.module.css';
import dex from './dex.module.css';

/** Labels follow the UI language (app content), not the card-text language. */
export function DexEntry({ card, face = 0 }: { card: CardDetail; face?: number }) {
  const { lang, locale, t } = useI18n();
  const plane = useLore(card).data?.plane?.name ?? null;
  const aiOn = useDeviceStore((s) => s.prefs.artAi);
  const art = useArtHints(card.scryfallId, card.hasBackFace ? face : 0);
  const status = useArtAiStatus((s) => s.status);
  const hints = aiOn ? art.data ?? null : null;
  const e = useMemo(() => generateDexEntry(dexInputFromCard(card, face, plane), hints), [card, face, plane, hints]);
  return (
    <section className={dex.dex} aria-label={t('dex.title')}>
      <div className={dex.head}>
        <span className={css.subtitle}>{t('dex.title')}</span>
        <span className={dex.category}>{e.category[lang]}</span>
      </div>
      <div className={dex.habitat}>{t('dex.habitat')}: {e.habitat[lang]}</div>
      {aiOn && art.isPending && (
        <p className={dex.ai} role="status">
          {status.state === 'loading' ? t('dex.aiLoading', { pct: Math.round(status.progress * 100) }) : t('dex.aiLooking')}
        </p>
      )}
      {aiOn && art.isError && <p className={css.muted} role="status" style={{ margin: 0 }}>{t('dex.aiFailed')}</p>}
      <dl className={dex.specs}>
        {e.specs.map((s) => (
          <div key={s.id} className={dex.spec}>
            <dt title={s.label[lang]}>{s.label[lang]}</dt>
            <dd>{formatDexStat(s, lang, locale)}</dd>
          </div>
        ))}
      </dl>
      <p className={dex.entry}>{e.entry[lang]}</p>
      <span className={css.subtitle}>{t('dex.funny')}</span>
      <table className={css.table}>
        <tbody>
          {e.funny.map((s) => <tr key={s.id}><td>{s.label[lang]}</td><td>{formatDexStat(s, lang, locale)}</td></tr>)}
        </tbody>
      </table>
      {hints && (
        <details>
          <summary className={css.muted}>{t('dex.aiCaption')}</summary>
          <p className={css.muted} lang="en" style={{ margin: '4px 0 0' }}>{hints.caption}</p>
        </details>
      )}
      <p className={css.muted} style={{ margin: 0 }}>{t(hints ? 'dex.noteAi' : 'dex.note')}</p>
    </section>
  );
}
