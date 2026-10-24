/**
 * Die zentrale Feedback-Schicht. Komponenten rufen nur feedback('press') usw.
 * Ohne window/AudioContext (SSR, Vitest mit jsdom) ist alles ein No-op.
 */
import { EVENTS, type FeedbackEvent, type FeedbackOptions } from "./events";
import { canVibrate, iosPlayPattern, isIOS, setHapticsEnabled, setIosHapticMode, vibrate, type IosHapticMode } from "./haptics";
import { SoundEngine, type AudioSessionMode } from "./sound";

export type { FeedbackEvent, FeedbackOptions, GemColor, Rarity, EventSpec } from "./events";
export { EVENTS, FEEDBACK_EVENTS } from "./events";
export { hapticTarget, isIOS, canVibrate } from "./haptics";
export type { IosHapticMode } from "./haptics";
export type { AudioSessionMode } from "./sound";

export interface FeedbackPrefs {
  sound: boolean;
  haptics: boolean;
  /** 0..1 */
  volume: number;
  /** 'ambient' respektiert den Lautlos-Schalter des iPhones */
  audioSession: AudioSessionMode;
  /** iPhone: 'tap' nur Element-Tick, 'hybrid' zusätzlich Muster per Code (Standard) */
  iosHaptics: IosHapticMode;
}

const engine = new SoundEngine();
const prefs: FeedbackPrefs = { sound: true, haptics: true, volume: 0.8, audioSession: "ambient", iosHaptics: "hybrid" };
const lastFired = new Map<FeedbackEvent, number>();
type Listener = (event: FeedbackEvent, opts: FeedbackOptions) => void;
const listeners = new Set<Listener>();

const hasRuntime = () => typeof window !== "undefined";

/** Beim ersten echten Tap aufrufen (z. B. auf das Siegel). Entsperrt Audio auf iOS. */
export async function unlockFeedback(): Promise<void> {
  if (!hasRuntime()) return;
  await engine.unlock(prefs.audioSession);
}

export function feedbackReady(): boolean {
  return engine.ready;
}

export function feedback(event: FeedbackEvent, opts: FeedbackOptions = {}): void {
  if (!hasRuntime()) return;
  const spec = EVENTS[event];
  if (!spec) return;
  const now = performance.now();
  if (spec.debounceMs && now - (lastFired.get(event) ?? -Infinity) < spec.debounceMs) return;
  lastFired.set(event, now);

  if (prefs.sound) {
    const id = spec.sound(opts);
    if (id) engine.play(id, opts.intensity ?? 1);
  }
  if (prefs.haptics && !isIOS && spec.android != null) {
    const p = typeof spec.android === "function" ? spec.android(opts) : spec.android;
    vibrate(p);
  }
  // iOS: der erste Tick kommt vom Element (hapticTarget); im Hybrid-Modus ergänzt der Code
  // Muster und Ticks für Ereignisse kurz nach einem Tap (z. B. Scan-Treffer).
  if (prefs.haptics && isIOS && spec.iosPattern) {
    const p = typeof spec.iosPattern === "function" ? spec.iosPattern(opts) : spec.iosPattern;
    iosPlayPattern(p, spec.ios === "tap");
  }
  for (const l of listeners) l(event, opts);
}

/** Für visuelle Reaktionen (Glühen, Blitz), die an dieselben Ereignisse gekoppelt sind. */
export function onFeedback(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getFeedbackPrefs(): Readonly<FeedbackPrefs> {
  return { ...prefs };
}

export function setFeedbackPrefs(p: Partial<FeedbackPrefs>): void {
  Object.assign(prefs, p);
  engine.enabled = prefs.sound;
  engine.setVolume(prefs.volume);
  if (p.haptics !== undefined) setHapticsEnabled(prefs.haptics);
  if (p.iosHaptics) setIosHapticMode(p.iosHaptics);
  if (p.audioSession && hasRuntime()) engine.setSessionMode(prefs.audioSession);
}

/** Zugriff für Werkzeuge (Demo, Tests): rohe Samples eines Klangs. */
export function renderSound(id: string): Float32Array[] {
  return engine.render(id);
}

/** Klang direkt abspielen, ohne Haptik (Sound-Board, Vorschau). */
export function playSound(id: string, gain = 1): void {
  engine.play(id, gain);
}

export const capabilities = () => ({
  ios: isIOS,
  vibrate: canVibrate,
  audio: hasRuntime() && ("AudioContext" in window || "webkitAudioContext" in window),
  audioSession: hasRuntime() && "audioSession" in navigator,
});
