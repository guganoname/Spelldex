/**
 * The lens: camera view with the card outline locking on, driven by @spelldex/scanner.
 * The camera starts only after a real tap (permission prompt + audio/haptics unlock).
 * Results are turned into feedback events by scanFeedback(); hits and picks go to onPick.
 */
import { useEffect, useRef, useState } from 'react';
import { feedback, hapticTarget, unlockFeedback } from '@spelldex/design/feedback';
import { initialScanFeedback, scanFeedback, type ScanFeedbackState } from '@spelldex/scanner';
import { startCameraScan, type CameraScan } from '@spelldex/scanner/camera';
import type { ScanFrameResult, ScanMatch } from '@spelldex/shared/contracts';
import css from './scan.module.css';

interface Props {
  indexUrl: string;
  /** A card was recognised (hit) or picked from the candidates. */
  onPick: (match: ScanMatch, via: 'hit' | 'pick') => void;
}

type Phase = 'idle' | 'starting' | 'running' | 'error';

export function ScanLens({ indexUrl, onPick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const scan = useRef<CameraScan | null>(null);
  const fb = useRef<ScanFeedbackState>(initialScanFeedback(0));
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrameResult | null>(null);
  const [candidates, setCandidates] = useState<ScanMatch[] | null>(null);
  const [hint, setHint] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => () => {
    if (scan.current) {
      scan.current.stop();
      scan.current = null;
      feedback('scan-close');
    }
  }, []);

  const open = async () => {
    unlockFeedback();
    feedback('scan-open');
    setPhase('starting');
    try {
      fb.current = initialScanFeedback(performance.now());
      scan.current = await startCameraScan({
        video: video.current!,
        indexUrl,
        onResult: (r) => {
          const step = scanFeedback(fb.current, r, performance.now());
          fb.current = step.state;
          for (const ev of step.events) {
            if (ev === 'scan-hint-light') setHint(true);
            // scan-hit is played by the screen once it knows rarity and whether the card is new.
            else if (ev !== 'scan-hit') feedback(ev);
          }
          if (r.state === 'hit') { setHint(false); setCandidates(null); onPickRef.current(r.match, 'hit'); }
          if (r.state === 'ambiguous') setCandidates(r.candidates);
          setFrame(r);
        },
      });
      setPhase('running');
    } catch (e) {
      setPhase('error');
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben.'
        : `Die Linse lässt sich nicht öffnen: ${(e as Error).message}`);
    }
  };

  const toggleTorch = () => {
    const next = !torch;
    setTorch(next);
    feedback('torch-toggle');
    void scan.current?.setTorch(next);
  };

  const pick = (m: ScanMatch) => {
    feedback('scan-pick');
    setCandidates(null);
    scan.current?.reset();
    onPickRef.current(m, 'pick');
  };

  const v = video.current;
  const quad = frame && 'quad' in frame ? frame.quad : null;
  const locked = frame?.state === 'hit' || (frame?.state === 'tracking' && !!frame.lockedId);

  return (
    <div className={css.lens}>
      <video ref={video} className={css.video} playsInline muted />
      {v && quad && v.videoWidth > 0 && (
        // Same cover-fit as the video, so video pixels map 1:1 onto the overlay.
        <svg className={css.overlay} viewBox={`0 0 ${v.videoWidth} ${v.videoHeight}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <polygon className={css.quad} data-locked={locked} points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />
        </svg>
      )}
      {phase !== 'running' && (
        <div className={css.veil}>
          {phase === 'error' ? <p role="alert">{error}</p> : <p>Halte eine Karte vor die Linse. Spelldex erkennt sie am Bild, ganz ohne Internet.</p>}
          <button type="button" className={css.openButton} ref={hapticTarget} onClick={open} disabled={phase === 'starting'}>
            {phase === 'starting' ? 'Linse erwacht …' : 'Linse öffnen'}
          </button>
        </div>
      )}
      {phase === 'running' && (
        <div className={css.hud}>
          {hint && <span className={css.hint}>Mehr Licht hilft{scan.current?.torchAvailable ? ' – Taschenlampe?' : '.'}</span>}
          {scan.current?.torchAvailable && (
            <button type="button" className={css.torch} aria-pressed={torch} ref={hapticTarget} onClick={toggleTorch}>
              Licht
            </button>
          )}
        </div>
      )}
      {candidates && (
        <div className={css.candidates} role="group" aria-label="Welche Karte?">
          {candidates.map((c) => (
            <button key={c.scryfallId} type="button" ref={hapticTarget} onClick={() => pick(c)}>
              {c.set.toUpperCase()} #{c.collectorNumber}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
