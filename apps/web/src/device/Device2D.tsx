/**
 * Phase-1 shell and permanent fallback: the device drawn in CSS. Same contract as the 3D shell.
 * The lid is a CSS 3D flap driven by a spring (Motion); everything inside the screens is DOM.
 */
import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { motion as motionTokens } from '@spelldex/design/tokens';
import { feedback, hapticTarget, unlockFeedback } from '@spelldex/design/feedback';
import type { DeviceButton, GemIndex } from '@spelldex/shared/contracts';
import { ENTRY_TAB_LABELS, tabForGem } from '@spelldex/shared/contracts';
import { emitButton, useDeviceStore } from '../state/device.ts';
import { useSlotRef } from './slots.tsx';
import css from './Device2D.module.css';

const GEMS: { gem: GemIndex; mana: string }[] = [
  { gem: 0, mana: 'w' }, { gem: 1, mana: 'u' }, { gem: 2, mana: 'b' }, { gem: 3, mana: 'r' }, { gem: 4, mana: 'g' },
];

function Key({ button, className, label, children }: { button: DeviceButton; className: string | undefined; label: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      ref={hapticTarget}
      className={className}
      aria-label={label}
      onClick={() => {
        feedback(button === 'back' ? 'back' : 'press');
        emitButton(button);
      }}
    >
      {children}
    </button>
  );
}

export default function Device2D({ reducedMotion }: { reducedMotion: boolean }) {
  const open = useDeviceStore((s) => s.open);
  const setOpen = useDeviceStore((s) => s.setOpen);
  const setLidProgress = useDeviceStore((s) => s.setLidProgress);
  const unlocked = useDeviceStore((s) => s.unlocked);
  const setUnlocked = useDeviceStore((s) => s.setUnlocked);
  const accent = useDeviceStore((s) => s.accent);
  const activeGem = useDeviceStore((s) => s.activeGem);
  const topRef = useSlotRef('top');
  const bottomRef = useSlotRef('bottom');

  // progress 0 = closed (lid down over the body), 1 = open.
  const progress = useMotionValue(open ? 1 : 0);
  const rotate = useTransform(progress, [0, 1], [-178, 0]);
  const coverOpacity = useTransform(progress, [0, 0.45, 0.55], [1, 1, 0]);
  const glassOpacity = useTransform(progress, [0.6, 1], [0, 1]);
  const lidHeight = useRef(1);

  // Only rest positions: a store write per frame also hits localStorage (persist) and stutters.
  useEffect(() => progress.on('change', (v) => { if (v === 0 || v === 1) setLidProgress(v); }), [progress, setLidProgress]);

  useEffect(() => {
    const target = open ? 1 : 0;
    if (reducedMotion) {
      progress.set(target);
      return;
    }
    const controls = animate(progress, target, { ...motionTokens.spring.lid, restDelta: 0.001 });
    return () => controls.stop();
  }, [open, reducedMotion, progress]);

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

  // Drag the closed lid upwards to open; it follows the finger and latches past 40 %.
  const bind = useDrag(
    ({ first, movement: [, my], last, velocity: [, vy], direction: [, dy], event }) => {
      if (first) {
        unlock();
        lidHeight.current = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect().height ?? 400;
      }
      const start = open ? 1 : 0;
      const p = Math.min(1, Math.max(0, start + (-my / lidHeight.current)));
      if (!last) {
        progress.set(p);
        return;
      }
      const fling = vy > 0.5 ? dy < 0 : null;
      const next = fling ?? p > 0.4;
      if (next !== open) toggle(next);
      else void animate(progress, next ? 1 : 0, motionTokens.spring.lid);
    },
    { axis: 'y', filterTaps: true, pointer: { touch: true } },
  );

  return (
    <div className={css.stage} data-accent={accent} data-open={open || undefined}>
      <div className={css.device}>
        {/* Upper half: the lens. In the closed state it is folded down over the body. */}
        <motion.section className={css.lid} style={{ rotateX: rotate }} {...(bind() as object)}>
          <div className={css.lidInner}>
            <div className={css.hingeTop} aria-hidden />
            <motion.div className={css.glass} style={{ opacity: glassOpacity }}>
              <div ref={topRef} className={css.screen} data-screen="top" />
            </motion.div>
          </div>
          <motion.div className={css.cover} style={{ opacity: coverOpacity }} aria-hidden={open}>
            <button type="button" ref={hapticTarget} className={css.seal} onClick={() => toggle(true)} aria-label="Spelldex öffnen">
              <span className={css.sealRune}>✦</span>
            </button>
            <p className={css.coverTitle}>SPELLDEX</p>
          </motion.div>
        </motion.section>

        <div className={css.hinge} aria-hidden>
          <button type="button" className={css.hingeKnob} tabIndex={-1} onClick={() => toggle(false)} aria-label="Schließen" />
        </div>

        {/* Lower half: info screen and controls in the thumb zone. */}
        <section className={css.body}>
          <div className={css.glass}>
            <div ref={bottomRef} className={css.screen} data-screen="bottom" />
          </div>
          <div className={css.controls}>
            <div className={css.dpad} role="group" aria-label="Steuerkreuz">
              <Key button="dpad-up" className={`${css.dkey} ${css.up}`} label="Hoch" />
              <Key button="dpad-left" className={`${css.dkey} ${css.left}`} label="Links" />
              <Key button="dpad-right" className={`${css.dkey} ${css.right}`} label="Rechts" />
              <Key button="dpad-down" className={`${css.dkey} ${css.down}`} label="Runter" />
            </div>
            <Key button="scan" className={css.scan} label="Scannen">
              <span aria-hidden>◉</span>
            </Key>
            <div className={css.smallKeys}>
              <Key button="back" className={css.small} label="Zurück">‹</Key>
              <Key button="search" className={css.small} label="Suchen">⌕</Key>
            </div>
          </div>
          <div className={css.gems} role="tablist" aria-label="Eintrag">
            {GEMS.map(({ gem, mana }) => (
              <Key
                key={gem}
                button={`gem-${gem}`}
                className={`${css.gem} ${css[`gem_${mana}`] ?? ''}`}
                label={ENTRY_TAB_LABELS[tabForGem(gem)]}
              >
                <span className={css.gemCore} data-active={activeGem === gem || undefined} />
              </Key>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
