import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useCollectionStats, useProgress, useRecent } from '../data/hooks.ts';
import { data } from '../data/client.ts';
import { useDeviceStore } from '../state/device.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { CatalogGate, LanguageSwitch, ProgressBar } from './common.tsx';
import { useI18n } from '../i18n/index.ts';
import css from './screen.module.css';

export function HomeScreen() {
  const navigate = useNavigate();
  const recent = useRecent(1).data?.[0];
  const stats = useCollectionStats().data;
  const all = useProgress({ kind: 'all' }).data;
  const setAccent = useDeviceStore((s) => s.setAccent);
  const setActiveGem = useDeviceStore((s) => s.setActiveGem);
  const { t, num } = useI18n();
  useEffect(() => {
    setAccent('colorless');
    setActiveGem(null);
  }, [setAccent, setActiveGem]);

  const randomCard = async () => {
    feedback('press');
    const c = await data().catalog.random().catch(() => null);
    if (!c) {
      feedback('error');
      return;
    }
    void navigate({ to: '/karte/$id', params: { id: c.scryfallId }, search: { tab: 'overview' } });
  };

  return (
    <>
      <TopScreen>
        <div className={css.lens}>
          {recent ? (
            <Link to="/karte/$id" params={{ id: recent.scryfallId }} search={{ tab: 'overview' }} className={css.lensCard} aria-label={t('home.recent')}>
              <CardImage id={recent.scryfallId} name={t('home.recent')} />
            </Link>
          ) : (
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <span className={css.emblem}>SPELLDEX</span>
              <span className={css.muted}>{t('home.holdCard')}</span>
            </div>
          )}
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            {all && <ProgressBar value={all.seen} total={all.total} label={t('home.seen')} />}
            <div className={css.menu}>
              <Link to="/scan" className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>{t('home.scan')}</span>
                <span className={css.menuHint}>{t('home.scanHint')}</span>
              </Link>
              <Link to="/suche" search={{ q: '' }} className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>{t('home.search')}</span>
                <span className={css.menuHint}>{t('home.searchHint')}</span>
              </Link>
              <Link to="/sammlung" className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>{t('home.collection')}</span>
                <span className={css.menuHint}>{stats?.ownedCopies ? t('home.owned', { n: num(stats.ownedCopies) }) : t('home.collectionHint')}</span>
              </Link>
              <button type="button" className={css.menuItem} ref={hapticTarget} onClick={randomCard}>
                <span className={css.menuLabel}>{t('home.random')}</span>
                <span className={css.menuHint}>{t('home.randomHint')}</span>
              </button>
            </div>
            <div className={css.spread} style={{ alignItems: 'center' }}>
              <Link to="/einstellungen" className={css.link}>{t('home.settings')}</Link>
              <LanguageSwitch target="both" label={t('home.language')} />
            </div>
            <Link to="/info" className={css.link}>{t('home.info')}</Link>
          </div>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
