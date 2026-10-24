/**
 * Vertrag der Feedback-Schicht: jedes Ereignis in der App bekommt hier genau
 * eine Zeile. Komponenten rufen nie Sound oder Haptik direkt auf.
 * Fällt eine Ebene weg (z. B. iPhone-Haptik nach einem iOS-Update), ändert
 * sich nur diese Tabelle.
 */

export type FeedbackEvent =
  | "press"
  | "back"
  | "tab"
  | "toggle"
  | "swipe"
  | "latch-release"
  | "lid-detent"
  | "lid-settle"
  | "open"
  | "close"
  | "scan-open"
  | "scan-lock"
  | "scan-lost"
  | "scan-hit"
  | "scan-ambiguous"
  | "scan-pick"
  | "scan-hint-light"
  | "torch-toggle"
  | "scan-close"
  | "collect"
  | "set-complete"
  | "error";

export type GemColor = "W" | "U" | "B" | "R" | "G" | "M" | "C";
export type Rarity = "common" | "uncommon" | "rare" | "mythic";

export interface FeedbackOptions {
  /** Edelstein bzw. Farbidentität: bestimmt die Tonhöhe bei 'tab' */
  gem?: GemColor;
  /** Seltenheit der erkannten Karte: staffelt 'scan-hit' */
  rarity?: Rarity;
  /** 0..1, skaliert die Lautstärke dieses einen Aufrufs */
  intensity?: number;
}

export interface EventSpec {
  /** Klang-ID in RECIPES, ggf. abhängig von den Optionen */
  sound: (o: FeedbackOptions) => string | null;
  /** Vibrationsmuster für Android (ms). null = keine Vibration */
  android: number | number[] | ((o: FeedbackOptions) => number | number[]) | null;
  /**
   * iPhone: 'tap' = System-Tick kommt vom Element selbst (hapticTarget),
   * 'none' = Ereignis ohne Tap (Timer, Kamera), keine Haptik möglich.
   */
  ios: "tap" | "none";
  /** Mindestabstand zwischen zwei Auslösungen */
  debounceMs?: number;
}

const s = (id: string) => () => id;

export const EVENTS: Record<FeedbackEvent, EventSpec> = {
  press: { sound: s("press"), android: 10, ios: "tap" },
  back: { sound: s("back"), android: 10, ios: "tap" },
  tab: { sound: (o) => `tab:${o.gem ?? "C"}`, android: 10, ios: "tap", debounceMs: 40 },
  toggle: { sound: s("toggle"), android: [8, 40, 12], ios: "tap" },
  swipe: { sound: s("swipe"), android: null, ios: "none", debounceMs: 120 },
  "latch-release": { sound: s("latch-release"), android: 14, ios: "tap" },
  "lid-detent": { sound: s("lid-detent"), android: 18, ios: "none" },
  "lid-settle": { sound: s("lid-settle"), android: [0, 30, 20], ios: "none" },
  open: { sound: s("open"), android: [14, 300, 18, 200, 24], ios: "tap" },
  close: { sound: s("close"), android: [20, 240, 14], ios: "tap" },
  "scan-open": { sound: s("scan-open"), android: 12, ios: "tap" },
  "scan-lock": { sound: s("scan-lock"), android: null, ios: "none", debounceMs: 600 },
  "scan-lost": { sound: s("scan-lost"), android: null, ios: "none", debounceMs: 600 },
  "scan-hit": {
    sound: (o) => `scan-hit:${o.rarity ?? "common"}`,
    android: (o) =>
      o.rarity === "mythic" ? [15, 40, 25, 60, 40] : o.rarity === "rare" ? [15, 40, 30] : [15, 40, 25],
    ios: "none",
    debounceMs: 800,
  },
  "scan-ambiguous": { sound: s("scan-ambiguous"), android: [10, 60, 10], ios: "none" },
  "scan-pick": { sound: s("scan-pick"), android: 12, ios: "tap" },
  "scan-hint-light": { sound: s("scan-hint-light"), android: null, ios: "none", debounceMs: 4000 },
  "torch-toggle": { sound: s("torch-toggle"), android: 10, ios: "tap" },
  "scan-close": { sound: s("scan-close"), android: 8, ios: "tap" },
  collect: { sound: s("collect"), android: 20, ios: "tap" },
  "set-complete": { sound: s("set-complete"), android: [20, 60, 20, 60, 40, 120, 60], ios: "tap" },
  error: { sound: s("error"), android: [30, 50, 30], ios: "tap" },
};

export const FEEDBACK_EVENTS = Object.keys(EVENTS) as FeedbackEvent[];
