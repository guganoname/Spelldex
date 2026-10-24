/**
 * Federn für DOM und 3D. Dieselben Werte wie Motion ({type:'spring'}) und
 * @react-spring/three ({mass, tension: stiffness, friction: damping}).
 * Hier: ein kleiner, unterbrechbarer Löser für Stellen ohne Bibliothek
 * (Demo, Canvas) und ein Export als CSS linear() für reine CSS-Übergänge.
 */

export interface SpringParams {
  mass: number;
  stiffness: number;
  damping: number;
}

export interface SpringState {
  x: number;
  v: number;
}

const REST_DELTA = 0.0005;
const REST_SPEED = 0.002;

/** Ein Schritt mit semi-impliziter Euler-Integration, in 1-ms-Teilschritten für Stabilität. */
export function stepSpring(p: SpringParams, s: SpringState, target: number, dtSec: number): SpringState {
  let { x, v } = s;
  const steps = Math.max(1, Math.ceil(dtSec / 0.001));
  const h = dtSec / steps;
  for (let i = 0; i < steps; i++) {
    const a = (-p.stiffness * (x - target) - p.damping * v) / p.mass;
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

export function isAtRest(s: SpringState, target: number, scale = 1): boolean {
  return Math.abs(s.x - target) < REST_DELTA * scale && Math.abs(s.v) < REST_SPEED * scale;
}

/** Simuliert 0 -> 1 und liefert Abtastwerte bis zur Ruhe. */
export function sampleSpring(p: SpringParams, fps = 120, maxSec = 4): number[] {
  let s: SpringState = { x: 0, v: 0 };
  const out = [0];
  const dt = 1 / fps;
  for (let t = 0; t < maxSec; t += dt) {
    s = stepSpring(p, s, 1, dt);
    out.push(s.x);
    if (isAtRest(s, 1)) break;
  }
  out[out.length - 1] = 1;
  return out;
}

/** CSS-Näherung: { easing: 'linear(...)', durationMs }. */
export function springToCss(p: SpringParams, points = 32): { easing: string; durationMs: number } {
  const fps = 120;
  const samples = sampleSpring(p, fps);
  const durationMs = Math.round(((samples.length - 1) / fps) * 1000);
  const stops: string[] = [];
  for (let i = 0; i <= points; i++) {
    const idx = Math.round((i / points) * (samples.length - 1));
    stops.push(String(Math.round(samples[idx]! * 1000) / 1000));
  }
  return { easing: `linear(${stops.join(", ")})`, durationMs };
}

export interface SpringHandle {
  /** Neues Ziel, Geschwindigkeit bleibt erhalten (unterbrechbar). */
  retarget(to: number): void;
  /** Wert direkt setzen, z. B. während der Finger zieht. */
  jump(x: number, v?: number): void;
  stop(): void;
  readonly value: number;
  readonly velocity: number;
}

/** rAF-getriebene Feder. onUpdate bekommt Wert und Geschwindigkeit. */
export function animateSpring(opts: {
  spring: SpringParams;
  from: number;
  to: number;
  velocity?: number;
  onUpdate: (x: number, v: number) => void;
  onRest?: (x: number) => void;
}): SpringHandle {
  let s: SpringState = { x: opts.from, v: opts.velocity ?? 0 };
  let target = opts.to;
  let raf = 0;
  let last = 0;
  let running = false;

  const tick = (now: number) => {
    const dt = Math.min(0.064, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    s = stepSpring(opts.spring, s, target, dt);
    if (isAtRest(s, target, Math.max(1, Math.abs(target)))) {
      s = { x: target, v: 0 };
      opts.onUpdate(s.x, 0);
      running = false;
      opts.onRest?.(s.x);
      return;
    }
    opts.onUpdate(s.x, s.v);
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  start();

  return {
    retarget(to) {
      target = to;
      start();
    },
    jump(x, v = 0) {
      cancelAnimationFrame(raf);
      running = false;
      s = { x, v };
      opts.onUpdate(x, v);
    },
    stop() {
      cancelAnimationFrame(raf);
      running = false;
    },
    get value() {
      return s.x;
    },
    get velocity() {
      return s.v;
    },
  };
}
