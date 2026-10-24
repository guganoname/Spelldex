/** One set as a Pokédex page: every slot, seen ones in color, unseen ones dimmed. */
import { Link } from '@tanstack/react-router';
import { setRoute } from '../app/router.tsx';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useProgress, useSeen, useSetPrintings, useSets } from '../data/hooks.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { CatalogGate, ProgressBar } from './common.tsx';
import css from './screen.module.css';

export function SetScreen() {
  const { code } = setRoute.useParams();
  const set = useSets().data?.find((s) => s.code === code.toUpperCase());
  const cards = useSetPrintings(code).data ?? [];
  const seen = useSeen(cards.map((c) => c.scryfallId)).data ?? {};
  const progress = useProgress({ kind: 'set', code }).data;
  return (
    <>
      <TopScreen>
        <div className={css.center}>
          <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            <p className={css.title}>{set?.name ?? code}</p>
            {progress && <ProgressBar value={progress.seen} total={progress.total} label="Gesehen" />}
            {progress && <ProgressBar value={progress.owned} total={progress.total} label="Im Besitz" />}
          </div>
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            <div className={css.grid}>
              {cards.map((c) => (
                <Link key={c.scryfallId} className={css.slot} data-seen={!!seen[c.scryfallId]} to="/karte/$id" params={{ id: c.scryfallId }} search={{ tab: 'overview' }}>
                  <CardImage id={c.scryfallId} name={c.name} size="small" />
                  <span className={css.slotNumber}>{c.collectorNumber}</span>
                </Link>
              ))}
            </div>
          </div>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
