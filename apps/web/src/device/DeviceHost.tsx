/**
 * Picks the shell: 3D when the GPU can carry it and the user did not opt out; otherwise the 2D
 * shell. Both render the same screen slots.
 *
 * Loading: the boot splash from index.html covers the page until the chosen shell has drawn its
 * first (closed) frame, so there is no Suspense fallback here. Showing the 2D shell while the 3D
 * one loads made a second, different device appear for a few seconds.
 *
 * Robustness: if the 3D shell throws or the GPU context is lost for good, the app switches to the
 * 2D shell for this session instead of going blank.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { feedback, hapticTarget, unlockFeedback } from '@spelldex/design/feedback';
import { prefersReducedMotion, useDeviceStore } from '../state/device.ts';
import { useT } from '../i18n/index.ts';
import { fontsReady } from '../app/fonts.ts';
import { splashGone } from '../app/splash.ts';
import Device2D from './Device2D.tsx';
import css from './DeviceHost.module.css';

// The 3D title on the leather is drawn into a canvas texture once, so the font must be there first.
const Device3D = lazy(() => Promise.all([import('./Device3D.tsx'), fontsReady()]).then(([m]) => m));

function canRun3D(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    // Free the probe context right away: iOS allows only a few live WebGL contexts per page.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return mem === undefined || mem >= 3;
  } catch {
    return false;
  }
}

class ShellBoundary extends Component<{ onError(e: unknown): void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: unknown) {
    this.props.onError(e);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function DeviceHost() {
  const prefs = useDeviceStore((s) => s.prefs);
  const reduced = prefersReducedMotion(prefs);
  const [failed3D, setFailed3D] = useState(false);
  const t = useT();
  const use3D = useMemo(
    () => !failed3D && prefs.shell !== '2d' && !reduced && canRun3D(),
    [prefs.shell, reduced, failed3D],
  );
  const fail = useCallback((e: unknown) => {
    console.error('[device-3d] falling back to 2D', e);
    setFailed3D(true);
  }, []);

  return (
    <>
      {use3D ? (
        <ShellBoundary onError={fail}>
          <Suspense fallback={null}>
            <Device3D reducedMotion={reduced} onFail={fail} />
          </Suspense>
        </ShellBoundary>
      ) : (
        <Device2D reducedMotion={reduced} />
      )}
      {failed3D && <Notice text={t('device.fallback2d')} />}
      {/* The 2D cover is the seal itself; the 3D Codex rests small at the top and needs the hint. */}
      {use3D && <OpenHint />}
    </>
  );
}

/** One-line notice at the top that fades out by itself. */
function Notice({ text }: { text: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(id);
  }, []);
  if (!shown) return null;
  return <p className={css.notice} role="status">{text}</p>;
}

/** Discoverability: while the Codex rests closed, a quiet hint (and a big tap target) below it. */
function OpenHint() {
  const open = useDeviceStore((s) => s.open);
  const lid = useDeviceStore((s) => s.lidProgress);
  const setOpen = useDeviceStore((s) => s.setOpen);
  const unlocked = useDeviceStore((s) => s.unlocked);
  const setUnlocked = useDeviceStore((s) => s.setUnlocked);
  const t = useT();
  const closed = !open && lid === 0;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!closed) {
      setVisible(false);
      return;
    }
    // Counted from when the device is actually visible, not from mount behind the splash.
    let id = 0;
    let live = true;
    void splashGone.then(() => {
      if (live) id = window.setTimeout(() => setVisible(true), 1600);
    });
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [closed]);
  if (!closed) return null;
  return (
    <button
      type="button"
      className={css.openHint}
      data-visible={visible || undefined}
      data-open-hint
      ref={hapticTarget}
      onClick={() => {
        if (!unlocked) {
          setUnlocked();
          void unlockFeedback();
        }
        feedback('open');
        setOpen(true);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
      <span>{t('device.openHint')}</span>
    </button>
  );
}
