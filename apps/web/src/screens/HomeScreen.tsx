import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useCollectionStats, useProgress, useRecent } from '../data/hooks.ts';
import { data } from '../data/client.ts';
import { useDeviceStore } from '../state/device.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { CatalogGate, ProgressBar } from './common.tsx';
import css from './screen.module.css';

export function HomeScreen() {
  const navigate = useNavigate();
  const recent = useRecent(1).data?.[0];
  const stats = useCollectionStats().data;
  const all = useProgress({ kind: 'all' }).data;
  const setAccent = useDeviceStore((s) => s.setAccent);
  const setActiveGem = useDeviceStore((s) => s.setActiveGem);
  useEffect(() => {
    setAccent('colorless');
    setActiveGem(null);
  }, [setAccent, setActiveGem]);

  const randomCard = async () => {
    feedback('press');
    const c = await data().catalog.random();
    if (c) void navigate({ to: '/karte/$id', params: { id: c.scryfallId }, search: { tab: 'overview' } });
  };

  return (
    <>
      <TopScreen>
        <div className={css.lens}>
          {recent ? (
            <Link to="/karte/$id" params={{ id: recent.scryfallId }} search={{ tab: 'overview' }} className={css.lensCard} aria-label="Zuletzt gesehen">
              <CardImage id={recent.scryfallId} name="Zuletzt gesehen" />
            </Link>
          ) : (
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <span className={css.emblem}>SPELLDEX</span>
              <span className={css.muted}>Halte eine Karte vor die Linse.</span>
            </div>
          )}
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            {all && <ProgressBar value={all.seen} total={all.total} label="Karten gesehen" />}
            <div className={css.menu}>
              <Link to="/scan" className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>Scannen</span>
                <span className={css.menuHint}>Karte erkennen</span>
              </Link>
              <Link to="/suche" search={{ q: '' }} className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>Suchen</span>
                <span className={css.menuHint}>Offline, alle Karten</span>
              </Link>
              <Link to="/sammlung" className={css.menuItem} ref={hapticTarget} onClick={() => feedback('press')}>
                <span className={css.menuLabel}>Sammlung</span>
                <span className={css.menuHint}>{stats ? `${stats.ownedCopies} im Besitz` : 'Sets und Ziele'}</span>
              </Link>
              <button type="button" className={css.menuItem} ref={hapticTarget} onClick={randomCard}>
                <span className={css.menuLabel}>Zufall</span>
                <span className={css.menuHint}>Eine Karte entdecken</span>
              </button>
            </div>
            <div className={css.spread}>
              <Link to="/einstellungen" className={css.link}>Einstellungen</Link>
              <Link to="/info" className={css.link}>Quellen und Hinweise</Link>
            </div>
          </div>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
