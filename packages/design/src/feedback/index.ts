// PLACEHOLDER with the agreed signatures; replaced by the design thread's implementation.
export type FeedbackEvent =
  | 'press' | 'back' | 'tab' | 'toggle' | 'swipe' | 'latch-release' | 'lid-detent' | 'lid-settle' | 'open' | 'close'
  | 'scan-open' | 'scan-lock' | 'scan-lost' | 'scan-hit' | 'scan-ambiguous' | 'scan-pick' | 'scan-hint-light'
  | 'torch-toggle' | 'scan-close' | 'collect' | 'set-complete' | 'error';
export interface FeedbackOptions {
  gem?: 'W' | 'U' | 'B' | 'R' | 'G' | 'M' | 'C';
  rarity?: 'common' | 'uncommon' | 'rare' | 'mythic';
}
export interface FeedbackPrefs { sound: boolean; haptics: boolean; volume: number }

let prefs: FeedbackPrefs = { sound: true, haptics: true, volume: 0.8 };
const VIBRATE: Partial<Record<FeedbackEvent, number | number[]>> = {
  press: 10, tab: 10, toggle: 10, collect: 20, 'scan-hit': [15, 40, 25], error: [30, 30, 30],
};

export function feedback(event: FeedbackEvent, _opts?: FeedbackOptions): void {
  if (typeof navigator === 'undefined' || !prefs.haptics) return;
  const v = VIBRATE[event];
  if (v != null && 'vibrate' in navigator) navigator.vibrate(v);
}
export async function unlockFeedback(): Promise<void> {}
export function setFeedbackPrefs(p: Partial<FeedbackPrefs>): void {
  prefs = { ...prefs, ...p };
}
export function hapticTarget(_el: HTMLElement | null): void {}
