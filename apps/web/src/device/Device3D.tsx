/**
 * 3D shell: React Three Fiber around @spelldex/device-3d's createCodex().
 * The scene renders only on change (frameloop="demand"). Screens stay DOM: two overlays sized to
 * the open pose, moved with matrix3d while the lid swings, plain rectangles at rest (sharp text).
 * Springs, gestures, picking and feedback live here; the codex only maps t to a pose.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { animate, useMotionValue } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import type * as THREE from 'three';
import { createCodex, lidEvents, tokensFromDesign, quadToMatrix3d, type Codex, type CodexScreenQuad } from '@spelldex/device-3d';
import { motion as motionTokens, tokens as designTokens } from '@spelldex/design/tokens';
import { feedback, hapticTarget, unlockFeedback } from '@spelldex/design/feedback';
import { ENTRY_TAB_LABELS, tabForGem, type DeviceButton, type GemIndex } from '@spelldex/shared/contracts';
import { emitButton, useDeviceStore } from '../state/device.ts';
import { useSlotRef } from './slots.tsx';
import css from './Device3D.module.css';

/** Below this lid progress the screens are hidden (they face away or are too oblique). */
const SCREEN_VISIBLE_FROM = 0.82;
/** The screens fade in over this much lid progress instead of popping in. */
const SCREEN_FADE = 0.12;
/** Reading mode: the info screen widens to the viewport, below the lens, at most this wide. */
const READING_MAX_WIDTH = 640;
const READING_MARGIN = 8;
/** Frame-time probe while the lid moves: too slow on average drops the pixel ratio to 1. */
const PROBE_FRAMES = 30;
const PROBE_SLOW_MS = 22;

interface Overlay { width: number; height: number; left: number; top: number }
interface Layout { top: Overlay; bottom: Overlay; vw: number; vh: number }

function Scene({ codex, progress, onFrame }: {
  codex: Codex;
  progress: ReturnType<typeof useMotionValue<number>>;
  onFrame(camera: THREE.PerspectiveCamera, size: { width: number; height: number }): void;
}) {
  const { camera, size, invalidate, gl, scene, setDpr } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  // Reflections, AgX tone mapping and the warm key light from the top left the materials are tuned
  // for. Without the reflections brass renders almost black.
  useEffect(() => {
    const unstage = codex.stage(scene, gl);
    invalidate();
    return unstage;
  }, [codex, gl, scene, invalidate]);

  // Survives re-runs of the effect below, so the probe runs once per mount.
  const probe = useRef({ frames: 0, ms: 0, done: false });

  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const moving = codex.update((now - last) / 1000);
      const p = probe.current;
      // kick() resets `last`, so idle gaps never count as slow frames.
      if (!p.done && moving) {
        p.frames++;
        p.ms += now - last;
        if (p.frames >= PROBE_FRAMES) {
          p.done = true;
          if (p.ms / p.frames > PROBE_SLOW_MS && gl.getPixelRatio() > 1) setDpr(1);
        }
      }
      last = now;
      codex.frameCamera(cam, size.width / size.height);
      onFrame(cam, size);
      invalidate();
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const unsub = progress.on('change', (v) => {
      codex.setOpen(v);
      kick();
    });
    codex.setOpen(progress.get());
    kick();
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [codex, cam, size, progress, onFrame, invalidate, gl, setDpr]);

  return (
    <>
      <primitive object={codex.group} />
    </>
  );
}

export default function Device3D({ reducedMotion }: { reducedMotion: boolean }) {
  const open = useDeviceStore((s) => s.open);
  const setOpen = useDeviceStore((s) => s.setOpen);
  const setLidProgress = useDeviceStore((s) => s.setLidProgress);
  const unlocked = useDeviceStore((s) => s.unlocked);
  const setUnlocked = useDeviceStore((s) => s.setUnlocked);
  const activeGem = useDeviceStore((s) => s.activeGem);
  const reading = useDeviceStore((s) => s.reading);
  const setReading = useDeviceStore((s) => s.setReading);
  const topRef = useSlotRef('top');
  const bottomRef = useSlotRef('bottom');

  const codex = useMemo(() => createCodex({ tokens: tokensFromDesign(designTokens) }), []);
  useEffect(() => () => codex.dispose(), [codex]);

  const progress = useMotionValue(open ? 1 : 0);
  const wrapper = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLDivElement>(null);
  const bottomEl = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const needsMeasure = useRef(true);
  const prevT = useRef(progress.get());
  const readingActive = reading && open && layout != null;
  const readingRef = useRef(readingActive);
  readingRef.current = readingActive;
  // Stable ref callbacks (inline ones would re-register the slots on every render).
  const setWrapper = useCallback((el: HTMLDivElement | null) => { wrapper.current = el; hapticTarget(el); }, []);

  useEffect(() => codex.setActiveTab(activeGem ?? -1), [codex, activeGem]);

  useEffect(
    () =>
      progress.on('change', (v) => {
        for (const e of lidEvents(prevT.current, v)) feedback(e);
        prevT.current = v;
        // Rest positions only: every store write is also persisted, which stutters the lid.
        if (v === 0 || v === 1) setLidProgress(v);
      }),
    [progress, setLidProgress],
  );

  useEffect(() => {
    const target = open ? 1 : 0;
    if (reducedMotion) {
      progress.set(target);
      return;
    }
    const c = animate(progress, target, { ...motionTokens.spring.lid, restDelta: 0.001 });
    return () => c.stop();
  }, [open, reducedMotion, progress]);

  /** Size the DOM screens in the open pose, so text never rescales while moving. */
  const measure = useCallback((camera: THREE.PerspectiveCamera, size: { width: number; height: number }): Layout => {
    const t = codex.t;
    codex.setOpen(1);
    codex.frameCamera(camera, size.width / size.height);
    camera.updateMatrixWorld();
    const r = codex.getScreenRects(camera, size);
    codex.setOpen(t);
    codex.frameCamera(camera, size.width / size.height);
    const box = (q: CodexScreenQuad): Overlay => ({ width: q.rect.width, height: q.rect.height, left: q.rect.left, top: q.rect.top });
    return { top: box(r.top), bottom: box(r.bottom), vw: size.width, vh: size.height };
  }, [codex]);

  // Stable, so the render loop in <Scene> is not torn down on every render of this component.
  const onFrame = useCallback((camera: THREE.PerspectiveCamera, size: { width: number; height: number }) => {
    cameraRef.current = camera;
    if (needsMeasure.current || !layoutRef.current) {
      needsMeasure.current = false;
      layoutRef.current = measure(camera, size);
      setLayout(layoutRef.current);
    }
    const o = layoutRef.current;
    camera.updateMatrixWorld();
    const rects = codex.getScreenRects(camera, size);
    const fade = Math.min(1, Math.max(0, (codex.t - SCREEN_VISIBLE_FROM) / SCREEN_FADE));
    const place = (el: HTMLDivElement | null, q: CodexScreenQuad, box: Overlay, docked: boolean) => {
      if (!el) return;
      const visible = q.facing && fade > 0;
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.opacity = fade < 1 ? String(fade) : '';
      // In reading mode the info screen is laid out by CSS, not glued to the device.
      if (docked) return;
      el.style.transform = q.axisAligned
        ? `translate(${q.rect.left - box.left}px, ${q.rect.top - box.top}px)`
        : quadToMatrix3d(box.width, box.height, q.corners.map((p) => ({ x: p.x - box.left, y: p.y - box.top })));
    };
    place(topEl.current, rects.top, o.top, false);
    place(bottomEl.current, rects.bottom, o.bottom, readingRef.current);
  }, [codex, measure]);

  // Re-measure on resize (rotation, toolbars, keyboard) without unmounting the screens: their
  // content (scroll position, input focus, a running camera) must survive.
  useEffect(() => {
    const onResize = () => { needsMeasure.current = true; };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  // Reading mode grows and shrinks the info screen with a FLIP animation on `translate`/`scale`
  // (the docked transform stays untouched; in reading mode it is overridden by CSS).
  const flipFrom = useRef<DOMRect | null>(null);
  const setReadingAnimated = (next: boolean) => {
    flipFrom.current = bottomEl.current?.getBoundingClientRect() ?? null;
    feedback(next ? 'open' : 'close');
    setReading(next);
  };
  useLayoutEffect(() => {
    const el = bottomEl.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!el || !from || reducedMotion || typeof el.animate !== 'function') return;
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) return;
    el.animate(
      [
        { translate: `${from.left - to.left}px ${from.top - to.top}px`, scale: `${from.width / to.width} ${from.height / to.height}` },
        { translate: '0px 0px', scale: '1 1' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [readingActive, reducedMotion]);

  const readingStyle = (l: Layout): React.CSSProperties => {
    const width = Math.min(l.vw - 2 * READING_MARGIN, READING_MAX_WIDTH);
    return {
      left: (l.vw - width) / 2,
      width,
      top: l.top.top + l.top.height + 10,
      bottom: `max(${READING_MARGIN}px, env(safe-area-inset-bottom))`,
      height: 'auto',
    };
  };

  const unlock = () => {
    if (!unlocked) {
      setUnlocked();
      void unlockFeedback();
    }
  };
  const toggle = (next: boolean) => {
    unlock();
    feedback(next ? 'open' : 'close');
    setOpen(next);
  };

  const ndc = (x: number, y: number) => {
    const r = wrapper.current!.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
  };

  // Tap: hardware buttons, seal (open), hinge (close). Drag: lid follows the finger.
  const bind = useDrag(
    ({ tap, first, last, movement: [, my], velocity: [, vy], direction: [, dy], xy: [x, y], event, cancel }) => {
      const camera = cameraRef.current;
      if (!camera) return;
      // Gestures that start on a screen belong to the DOM inside it (scrolling, buttons).
      if ((event.target as Element | null)?.closest?.('[data-screen]')) {
        if (first) cancel();
        return;
      }
      if (tap) {
        unlock();
        const p = ndc(x, y);
        const button = codex.pickButton(p, camera);
        if (button) {
          codex.pressButton(button);
          feedback(button === 'back' ? 'back' : button.startsWith('gem-') ? 'tab' : 'press');
          emitButton(button);
          return;
        }
        const part = codex.pickPart(p, camera);
        if (part === 'seal' && !open) toggle(true);
        else if (part === 'hinge' && open) toggle(false);
        return;
      }
      if (first) unlock();
      const h = wrapper.current?.getBoundingClientRect().height ?? 800;
      const start = open ? 1 : 0;
      const p = Math.min(1.05, Math.max(0, start - my / (h * 0.45)));
      if (!last) {
        progress.set(p);
        return;
      }
      const fling = vy > 0.5 ? dy < 0 : null;
      const next = fling ?? p > 0.4;
      if (next !== open) toggle(next);
      else void animate(progress, next ? 1 : 0, motionTokens.spring.lid);
    },
    { filterTaps: true, axis: 'y', pointer: { touch: true } },
  );

  return (
    <div className={css.stage} ref={setWrapper} {...(bind() as object)}>
      <Canvas
        className={css.canvas}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 10] }}
      >
        <Scene codex={codex} progress={progress} onFrame={onFrame} />
      </Canvas>
      {layout && (
        <>
          <div
            ref={topEl}
            className={css.screen}
            data-screen="top"
            style={{ left: layout.top.left, top: layout.top.top, width: layout.top.width, height: layout.top.height }}
          >
            <div ref={topRef} className={css.slot} />
          </div>
          {open && !readingActive && (
            <button
              type="button"
              className={css.grip}
              data-screen="grip"
              style={{ left: layout.bottom.left + layout.bottom.width / 2, top: layout.bottom.top }}
              aria-label="Lesemodus: Infobildschirm vergrößern"
              ref={hapticTarget}
              onClick={() => setReadingAnimated(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
            </button>
          )}
          <div
            ref={bottomEl}
            className={css.screen}
            data-screen="bottom"
            data-reading={readingActive || undefined}
            style={
              readingActive
                ? readingStyle(layout)
                : { left: layout.bottom.left, top: layout.bottom.top, width: layout.bottom.width, height: layout.bottom.height }
            }
          >
            {readingActive && (
              <div className={css.readingBar}>
                <button type="button" className={css.barButton} ref={hapticTarget} aria-label="Zurück" onClick={() => { feedback('back'); emitButton('back'); }}>
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <span className={css.barTitle}>Lesemodus</span>
                <button type="button" className={css.barButton} ref={hapticTarget} aria-label="Lesemodus beenden" onClick={() => setReadingAnimated(false)}>
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>
            )}
            <div ref={bottomRef} className={css.slot} />
          </div>
        </>
      )}
      {/* The 3D keys are not DOM: mirror them for screen readers and keyboards. */}
      <nav className={css.srOnly} aria-label="Gerätetasten">
        {!open && <button type="button" onClick={() => toggle(true)}>Spelldex öffnen</button>}
        {open && <button type="button" onClick={() => toggle(false)}>Schließen</button>}
        {(['scan', 'search', 'back'] as DeviceButton[]).map((b) => (
          <button key={b} type="button" onClick={() => emitButton(b)}>{{ scan: 'Scannen', search: 'Suchen', back: 'Zurück' }[b as 'scan']}</button>
        ))}
        {([0, 1, 2, 3, 4] as GemIndex[]).map((g) => (
          <button key={g} type="button" aria-pressed={activeGem === g} onClick={() => emitButton(`gem-${g}`)}>
            {ENTRY_TAB_LABELS[tabForGem(g)]}
          </button>
        ))}
      </nav>
    </div>
  );
}
