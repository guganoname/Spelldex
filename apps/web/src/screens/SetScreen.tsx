/** One set as a Pokédex page: every slot, seen ones in color, unseen ones dimmed. */
import { Link } from '@tanstack/react-router';
import { setRoute } from '../app/router.tsx';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { useProgress, useSeen, useSetPrintings, useSets } from '../data/hooks.ts';
import { CardImage } from '../ui/CardImage.tsx';
import { CatalogGate, ProgressBar } from './common.tsx';
import css from './screen.module.css';
import { useI18n } from '../i18n/index.ts';

export function SetScreen() {
  const { code } = setRoute.useParams();
  const set = useSets().data?.find((s) => s.code === code.toUpperCase());
  const printings = useSetPrintings(code);
  const cards = printings.data ?? [];
  const { t } = useI18n();
  const seen = useSeen(cards.map((c) => c.scryfallId)).data ?? {};
  const progress = useProgress({ kind: 'set', code }).data;
  return (
    <>
      <TopScreen>
        <div className={css.center}>
          <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            <p className={css.title}>{set?.name ?? code}</p>
            {progress && <ProgressBar value={progress.seen} total={progress.total} label={t('set.seen')} />}
            {progress && <ProgressBar value={progress.owned} total={progress.total} label={t('set.owned')} />}
          </div>
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <div className={css.pane}>
            {printings.isSuccess && cards.length === 0 && <p className={css.muted}>{t('set.empty')}</p>}
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
