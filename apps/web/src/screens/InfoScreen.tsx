import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useManifest } from '../data/hooks.ts';
import css from './screen.module.css';
import { useI18n } from '../i18n/index.ts';

export function InfoScreen() {
  const sources = useManifest().data?.sources ?? [];
  const { t } = useI18n();
  return (
    <>
      <TopScreen>
        <div className={css.center}><p className={css.title}>{t('info.title')}</p></div>
      </TopScreen>
      <BottomScreen>
        <div className={css.pane}>
          <p className={css.muted}>{t('info.fanContent')}</p>
          <ul className={css.list}>
            {sources.map((s) => (
              <li key={s.name} className={css.listItem}>
                <div className={css.listMain}>
                  <a className={css.link} href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                  <div className={css.listMeta}>{s.license}</div>
                </div>
              </li>
            ))}
            <li className={css.listItem}>
              <div className={css.listMain}>
                <a className={css.link} href="https://mtg.wiki" target="_blank" rel="noreferrer">MTG Wiki</a>
                <div className={css.listMeta}>{t('info.wiki')}</div>
              </div>
            </li>
          </ul>
          <p className={css.muted}>{t('info.direct')}</p>
        </div>
      </BottomScreen>
    </>
  );
}
