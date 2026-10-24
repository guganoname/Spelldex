/**
 * 3D shell: React Three Fiber around @spelldex/device-3d's createCodex().
 * The scene renders only on change (frameloop="demand"). Screens stay DOM: two overlays sized to
 * the open pose, moved with matrix3d while the lid swings, plain rectangles at rest (sharp text).
 * Springs, gestures, picking and feedback live here; the codex only maps t to a pose.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
/** Frame-time probe while the lid moves: too slow on average drops the pixel ratio to 1. */
const PROBE_FRAMES = 30;
const PROBE_SLOW_MS = 22;

interface Overlay { width: number; height: number; left: number; top: number }

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
  const topRef = useSlotRef('top');
  const bottomRef = useSlotRef('bottom');

  const codex = useMemo(() => createCodex({ tokens: tokensFromDesign(designTokens) }), []);
  useEffect(() => () => codex.dispose(), [codex]);

  const progress = useMotionValue(open ? 1 : 0);
  const wrapper = useRef<HTMLDivElement>(null);
  const topEl = useRef<HTMLDivElement>(null);
  const bottomEl = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [overlays, setOverlays] = useState<{ top: Overlay; bottom: Overlay } | null>(null);
  const prevT = useRef(progress.get());
  // Stable ref callbacks (inline ones would re-register the slots on every render).
  const setTop = useCallback((el: HTMLDivElement | null) => { topEl.current = el; topRef(el); }, [topRef]);
  const setBottom = useCallback((el: HTMLDivElement | null) => { bottomEl.current = el; bottomRef(el); }, [bottomRef]);
  const setWrapper = useCallback((el: HTMLDivElement | null) => { wrapper.current = el; hapticTarget(el); }, []);

  useEffect(() => codex.setActiveTab(activeGem ?? -1), [codex, activeGem]);

  useEffect(
    () =>
      progress.on('change', (v) => {
        setLidProgress(v);
        for (const e of lidEvents(prevT.current, v)) feedback(e);
        prevT.current = v;
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

  /** Size the DOM screens once, in the open pose, so text never rescales while moving. */
  const measure = (camera: THREE.PerspectiveCamera, size: { width: number; height: number }) => {
    const t = codex.t;
    codex.setOpen(1);
    codex.frameCamera(camera, size.width / size.height);
    camera.updateMatrixWorld();
    const r = codex.getScreenRects(camera, size);
    codex.setOpen(t);
    codex.frameCamera(camera, size.width / size.height);
    const box = (q: CodexScreenQuad): Overlay => ({ width: q.rect.width, height: q.rect.height, left: q.rect.left, top: q.rect.top });
    setOverlays({ top: box(r.top), bottom: box(r.bottom) });
  };

  const onFrame = (camera: THREE.PerspectiveCamera, size: { width: number; height: number }) => {
    cameraRef.current = camera;
    if (!overlays) {
      measure(camera, size);
      return;
    }
    camera.updateMatrixWorld();
    const rects = codex.getScreenRects(camera, size);
    const place = (el: HTMLDivElement | null, q: CodexScreenQuad, o: Overlay) => {
      if (!el) return;
      const visible = q.facing && codex.t >= SCREEN_VISIBLE_FROM;
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.transform = q.axisAligned
        ? `translate(${q.rect.left - o.left}px, ${q.rect.top - o.top}px)`
        : quadToMatrix3d(o.width, o.height, q.corners.map((p) => ({ x: p.x - o.left, y: p.y - o.top })));
    };
    place(topEl.current, rects.top, overlays.top);
    place(bottomEl.current, rects.bottom, overlays.bottom);
  };

  useEffect(() => {
    const onResize = () => setOverlays(null);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

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
      {overlays && (
        <>
          <div
            ref={setTop}
            className={css.screen}
            data-screen="top"
            style={{ left: overlays.top.left, top: overlays.top.top, width: overlays.top.width, height: overlays.top.height }}
          />
          <div
            ref={setBottom}
            className={css.screen}
            data-screen="bottom"
            style={{ left: overlays.bottom.left, top: overlays.bottom.top, width: overlays.bottom.width, height: overlays.bottom.height }}
          />
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
