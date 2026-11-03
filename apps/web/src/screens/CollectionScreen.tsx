/** Collection overview: totals, export reminder, sets with progress. */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { data } from '../data/client.ts';
import { useCollectionStats, useProgress, useSets } from '../data/hooks.ts';
import { CatalogGate, ProgressBar } from './common.tsx';
import css from './screen.module.css';
import { useI18n } from '../i18n/index.ts';

const EXPORT_REMINDER = 50;

export function CollectionScreen() {
  const stats = useCollectionStats().data;
  const all = useProgress({ kind: 'all' }).data;
  const sets = useSets().data ?? [];
  const [filter, setFilter] = useState('');
  const { t, num } = useI18n();
  const sinceExport = useQuery({ queryKey: ['collection', 'since-export'], queryFn: () => data().collection.newSinceExport() }).data ?? 0;
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? sets.filter((s) => s.name.toLowerCase().includes(f) || s.code.toLowerCase() === f) : sets.slice(0, 80);
  }, [sets, filter]);

  const exportFile = async () => {
    feedback('press');
    const dump = await data().collection.exportJson();
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('collection.exportFile')}-${dump.exportedAt.slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    // Safari reads the blob asynchronously after click(); revoking at once can cancel the download.
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  return (
    <>
      <TopScreen>
        <div className={css.center}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span className={css.emblem}>{num(stats?.seenCards ?? 0)}</span>
            <span className={css.muted}>{t('collection.seenOwned', { n: num(stats?.ownedCopies ?? 0) })}</span>
          </div>
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            {all && <ProgressBar value={all.seen} total={all.total} label={t('collection.all')} />}
            {sinceExport >= EXPORT_REMINDER && (
              <p className={css.muted}>{t('collection.sinceExport', { n: num(sinceExport) })}</p>
            )}
            <button type="button" className={css.button} ref={hapticTarget} onClick={exportFile}>{t('collection.export')}</button>
            <input className={css.input} type="search" placeholder={t('collection.findSet')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('collection.findSet')} />
            {sets.length > 0 && shown.length === 0 && <p className={css.muted}>{t('collection.noSets')}</p>}
            <ul className={css.list}>
              {shown.map((s) => (
                <li key={s.code}>
                  <Link className={css.listItem} to="/sammlung/set/$code" params={{ code: s.code }}>
                    <div className={css.listMain}>
                      <div className={css.listName}>{s.name}</div>
                      <div className={css.listMeta}>{s.code} · {s.releaseDate.slice(0, 4)} · {t('collection.cards', { n: num(s.printingCount) })}</div>
                    </div>
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
