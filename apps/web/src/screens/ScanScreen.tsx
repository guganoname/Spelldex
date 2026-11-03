/**
 * Scan screen. The camera view and the worker come from @spelldex/scanner (scanner team).
 * This screen owns the flow: hit -> mark seen -> feedback -> open the entry. The set + collector
 * number lookup stays as fallback (no camera, no scan index in this data build).
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import type { Rarity } from '@spelldex/design/feedback';
import type { ScanMatch } from '@spelldex/shared/contracts';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { data } from '../data/client.ts';
import { MANIFEST_URL } from '../data/client.ts';
import { useManifest, useMarkSeen } from '../data/hooks.ts';
import { CatalogGate } from './common.tsx';
import { ScanLens } from './ScanLens.tsx';
import css from './screen.module.css';
import { useI18n } from '../i18n/index.ts';

export function ScanScreen() {
  const navigate = useNavigate();
  const markSeen = useMarkSeen();
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const manifest = useManifest().data;
  const scanIndex = manifest?.artifacts.scanIndex;
  const indexUrl = scanIndex ? new URL(scanIndex.path, new URL(MANIFEST_URL, location.href)).href : null;

  const open = async (scryfallId: string) => {
    const [r, card] = await Promise.all([
      markSeen.mutateAsync({ id: scryfallId, source: 'scan' }),
      data().catalog.getCard(scryfallId),
    ]);
    const rarity = (['common', 'uncommon', 'rare', 'mythic'] as const).find((x) => x === card?.rarity) as Rarity | undefined;
    feedback(r.newCard ? 'collect' : 'scan-hit', { rarity });
    void navigate({ to: '/karte/$id', params: { id: scryfallId }, search: { tab: 'overview' } });
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setCode.trim() || !number.trim()) return;
    const card = await data().catalog.findBySetNumber(setCode.trim(), number.trim()).catch(() => null);
    if (!card) {
      feedback('error');
      setError(t('scan.notFound'));
      return;
    }
    setError(null);
    await open(card.scryfallId);
  };

  return (
    <>
      <TopScreen>
        {indexUrl ? (
          <ScanLens
            indexUrl={indexUrl}
            onPick={(m: ScanMatch) =>
              open(m.scryfallId).catch(() => {
                // Index and catalog out of sync (e.g. a print missing from this data version).
                feedback('error');
                setError(t('scan.notInCatalog', { set: m.set.toUpperCase(), n: m.collectorNumber }));
              })
            }
          />
        ) : (
          <div className={css.center}>
            <p className={css.muted}>{t('scan.noIndex')}</p>
          </div>
        )}
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <form className={css.pane} onSubmit={lookup}>
            <span className={css.subtitle}>{t('scan.enter')}</span>
            <div className={css.row}>
              <input className={css.input} placeholder={t('scan.setPlaceholder')} value={setCode} onChange={(e) => setSetCode(e.target.value)} autoCapitalize="characters" aria-label={t('scan.setLabel')} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
              <input className={css.input} placeholder={t('scan.numberPlaceholder')} value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" aria-label={t('scan.numberLabel')} autoComplete="off" enterKeyHint="done" />
            </div>
            <button type="submit" className={css.button} ref={hapticTarget} disabled={!setCode.trim() || !number.trim()}>{t('scan.submit')}</button>
            {error && <p className={css.muted} role="alert">{error}</p>}
          </form>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
