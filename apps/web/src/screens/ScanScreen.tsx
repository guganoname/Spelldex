/**
 * Scan screen. The camera view and the worker come from @spelldex/scanner (scanner team).
 * This screen owns the flow: hit -> mark seen -> feedback -> open the entry. Until the scanner
 * lands it offers the set + collector number lookup, which the scanner also uses as fallback.
 */
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { feedback, hapticTarget } from '@spelldex/design/feedback';
import { SCANNER_AVAILABLE } from '@spelldex/scanner';
import { TopScreen, BottomScreen } from '../device/slots.tsx';
import { data } from '../data/client.ts';
import { useMarkSeen } from '../data/hooks.ts';
import { CatalogGate } from './common.tsx';
import css from './screen.module.css';

export function ScanScreen() {
  const navigate = useNavigate();
  const markSeen = useMarkSeen();
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = async (scryfallId: string) => {
    const r = await markSeen.mutateAsync({ id: scryfallId, source: 'scan' });
    feedback(r.newCard ? 'collect' : 'scan-hit');
    void navigate({ to: '/karte/$id', params: { id: scryfallId }, search: { tab: 'overview' } });
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const card = await data().catalog.findBySetNumber(setCode.trim(), number.trim());
    if (!card) {
      feedback('error');
      setError('Keine Karte mit diesem Set-Code und dieser Nummer.');
      return;
    }
    setError(null);
    await open(card.scryfallId);
  };

  return (
    <>
      <TopScreen>
        <div className={css.center}>
          {SCANNER_AVAILABLE ? null : (
            <p className={css.muted}>Die Kamera-Erkennung kommt mit dem Scanner-Modul. Bis dahin: Set-Code und Nummer unten links auf der Karte eingeben.</p>
          )}
        </div>
      </TopScreen>
      <BottomScreen>
        <CatalogGate>
          <form className={css.pane} onSubmit={lookup}>
            <span className={css.subtitle}>Karte eintragen</span>
            <div className={css.row}>
              <input className={css.input} placeholder="Set, z. B. DSK" value={setCode} onChange={(e) => setSetCode(e.target.value)} autoCapitalize="characters" aria-label="Set-Code" />
              <input className={css.input} placeholder="Nr., z. B. 123" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" aria-label="Sammlernummer" />
            </div>
            <button type="submit" className={css.button} ref={hapticTarget}>Eintragen</button>
            {error && <p className={css.muted} role="alert">{error}</p>}
          </form>
        </CatalogGate>
      </BottomScreen>
    </>
  );
}
