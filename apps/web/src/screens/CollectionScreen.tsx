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

const EXPORT_REMINDER = 50;

export function CollectionScreen() {
  const stats = useCollectionStats().data;
  const all = useProgress({ kind: 'all' }).data;
  const sets = useSets().data ?? [];
  const [filter, setFilter] = useState('');
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
    a.download = `spelldex-sammlung-${dump.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <TopScreen>
        <div className={css.center}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span className={css.emblem}>{stats?.seenCards.toLocaleString('de-DE') ?? '0'}</span>
            <span className={css.muted}>Karten gesehen · {stats?.ownedCopies ?? 0} Exemplare im Besitz</span>
          </div>
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            {all && <ProgressBar value={all.seen} total={all.total} label="Alle Karten" />}
            {sinceExport >= EXPORT_REMINDER && (
              <p className={css.muted}>{sinceExport} neue Karten seit der letzten Sicherung.</p>
            )}
            <button type="button" className={css.button} ref={hapticTarget} onClick={exportFile}>Sammlung sichern (JSON)</button>
            <input className={css.input} placeholder="Set suchen" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Set suchen" />
            <ul className={css.list}>
              {shown.map((s) => (
                <li key={s.code}>
                  <Link className={css.listItem} to="/sammlung/set/$code" params={{ code: s.code }}>
                    <div className={css.listMain}>
                      <div className={css.listName}>{s.name}</div>
                      <div className={css.listMeta}>{s.code} · {s.releaseDate.slice(0, 4)} · {s.printingCount} Karten</div>
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
