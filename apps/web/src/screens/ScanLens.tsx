/**
 * The lens: camera view with the card outline locking on, driven by @spelldex/scanner.
 * The camera starts by itself when the browser already allows it (and the Codex is open); only when
 * the phone still has to ask for permission does the lens show a button, because iOS ties the
 * prompt to a real tap.
 * Results are turned into feedback events by scanFeedback(); hits and picks go to onPick.
 */
import { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../state/device.ts';
import { feedback, hapticTarget, unlockFeedback } from '@spelldex/design/feedback';
import { initialScanFeedback, scanFeedback, type ScanFeedbackState } from '@spelldex/scanner';
import { CameraUnavailableError, startCameraScan, type CameraScan } from '@spelldex/scanner/camera';
import type { ScanFrameResult, ScanMatch } from '@spelldex/shared/contracts';
import css from './scan.module.css';
import { useI18n, type I18n } from '../i18n/index.ts';

interface Props {
  indexUrl: string;
  /** A card was recognised (hit) or picked from the candidates. */
  onPick: (match: ScanMatch, via: 'hit' | 'pick') => void;
}

/**
 * checking: asking the browser whether the camera is already allowed (no button yet, so an allowed
 * camera never flashes a prompt); idle: permission needed, button shown; starting: waiting for the
 * camera; loading: picture live, recognition still loading.
 */
type Phase = 'checking' | 'idle' | 'starting' | 'loading' | 'running' | 'error';

export function ScanLens({ indexUrl, onPick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const scan = useRef<CameraScan | null>(null);
  const fb = useRef<ScanFeedbackState>(initialScanFeedback(0));
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrameResult | null>(null);
  const [candidates, setCandidates] = useState<ScanMatch[] | null>(null);
  const [hint, setHint] = useState(false);
  const [torch, setTorch] = useState(false);
  /** The current start came from the button (show its waiting state), not from the auto start. */
  const [manual, setManual] = useState(false);
  const { t } = useI18n();

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (scan.current) {
        scan.current.stop();
        scan.current = null;
        feedback('scan-close');
      }
    };
  }, []);

  // No await before startCameraScan: the camera request has to stay inside the tap on iOS.
  // auto: started without a tap. A refusal then only means "needs a tap", not an error.
  const busy = useRef(false);
  const open = async (auto = false) => {
    if (busy.current || scan.current) return;
    busy.current = true;
    if (!auto) void unlockFeedback();
    setManual(!auto);
    feedback('scan-open');
    setPhase('starting');
    setError(null);
    try {
      fb.current = initialScanFeedback(performance.now());
      const s = await startCameraScan({
        video: video.current!,
        indexUrl,
        onCamera: () => { if (mounted.current) setPhase('loading'); },
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
      // Left the screen while the lens was waking up.
      if (!mounted.current) {
        s.stop();
        return;
      }
      scan.current = s;
      setPhase('running');
    } catch (e) {
      if (!mounted.current) return;
      // Only a refused permission falls back to the button; anything else is a real error.
      if (auto && e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        setPhase('idle');
        return;
      }
      feedback('error');
      setPhase('error');
      setError(cameraError(e, t));
    } finally {
      busy.current = false;
    }
  };
  const openRef = useRef(open);
  openRef.current = open;

  // Start at once when the camera is already allowed: on entering the screen and when coming back
  // after a scan. Waits for the open Codex (the app always starts closed).
  const deviceOpen = useDeviceStore((s) => s.open);
  useEffect(() => {
    if (!deviceOpen) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => { if (status?.state === 'granted' && !cancelled) void openRef.current(true); };
    void cameraPermission().then((p) => {
      if (cancelled || scan.current) return;
      if (p.state === 'granted' || p.state === 'unknown') void openRef.current(true);
      else {
        setPhase((ph) => (ph === 'checking' ? 'idle' : ph));
        if (p.state === 'denied') {
          setPhase('error');
          setError(t('scan.denied'));
        }
      }
      // Allowed later (e.g. in the browser's site settings): start without another tap.
      status = p.status;
      status?.addEventListener('change', onChange);
    });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceOpen]);

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
      <video ref={video} className={css.video} playsInline muted autoPlay />
      {v && quad && v.videoWidth > 0 && (
        // Same cover-fit as the video, so video pixels map 1:1 onto the overlay.
        <svg className={css.overlay} viewBox={`0 0 ${v.videoWidth} ${v.videoHeight}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <polygon className={css.quad} data-locked={locked} points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />
        </svg>
      )}
      {(phase === 'idle' || phase === 'error' || (phase === 'starting' && manual)) && (
        <div className={css.veil}>
          {phase === 'error'
            ? <p role="alert">{error}</p>
            : <p>{t('scan.intro')}</p>}
          <button type="button" className={css.openButton} ref={hapticTarget} onClick={() => void open()} disabled={phase === 'starting'}>
            {phase === 'starting' ? t('scan.waking') : phase === 'error' ? t('common.retry') : t('scan.open')}
          </button>
          {phase === 'starting' && <p className={css.small}>{t('scan.permission')}</p>}
        </div>
      )}
      {phase === 'loading' && (
        <div className={css.hud}>
          <span className={css.hint}>{t('scan.loading')}</span>
        </div>
      )}
      {phase === 'running' && (
        <div className={css.hud}>
          {hint && <span className={css.hint}>{t('scan.moreLight')}{scan.current?.torchAvailable ? t('scan.torchQ') : '.'}</span>}
          {scan.current?.torchAvailable && (
            <button type="button" className={css.torch} aria-pressed={torch} ref={hapticTarget} onClick={toggleTorch}>
              {t('scan.torch')}
            </button>
          )}
        </div>
      )}
      {candidates && (
        <div className={css.candidates} role="group" aria-label={t('scan.which')}>
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

/** The browser's camera permission, where it can tell (Safari 16+, Chrome, Firefox). */
async function cameraPermission(): Promise<{ state: PermissionState | 'unknown'; status: PermissionStatus | null }> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return { state: status.state, status };
  } catch {
    return { state: 'unknown', status: null };
  }
}

function cameraError(e: unknown, t: I18n['t']): string {
  if (e instanceof CameraUnavailableError) return t(typeof isSecureContext !== 'undefined' && !isSecureContext ? 'scan.https' : 'scan.unsupported');
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      return t('scan.denied');
    }
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return t('scan.noCamera');
    if (e.name === 'NotReadableError' || e.name === 'AbortError') return t('scan.busy');
  }
  return t('scan.failed', { msg: (e as Error)?.message ?? String(e) });
}
