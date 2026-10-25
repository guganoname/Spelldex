/**
 * Device state shared by the DOM UI and the 3D scene (both read the same store).
 * Hardware buttons are events: the shell emits them, the active screen handles them.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect, useRef } from 'react';
import type { CatalogStatus, ColorAccent, DeviceButton, GemIndex } from '@spelldex/shared/contracts';

export type ShellKind = '3d' | '2d';

interface Prefs {
  sound: boolean;
  haptics: boolean;
  volume: number;
  /** null = follow prefers-reduced-motion */
  reducedMotion: boolean | null;
  /** null = decide by GPU capability */
  shell: ShellKind | null;
  cardLanguage: 'de' | 'en';
  /** 'ambient' respects the iPhone mute switch, 'playback' plays anyway */
  audioSession: 'ambient' | 'playback';
  /** iPhone: 'hybrid' adds coded tick patterns, 'tap' only the element tick */
  iosHaptics: 'hybrid' | 'tap';
}

const DEFAULT_PREFS: Prefs = {
  sound: true, haptics: true, volume: 0.8, reducedMotion: null, shell: null, cardLanguage: 'de',
  audioSession: 'ambient', iosHaptics: 'hybrid',
};

interface DeviceState {
  /** Lid target: true = open. The shell animates towards it with a spring. */
  open: boolean;
  /** Set by the shell when the lid comes to rest, 0 (closed) or 1 (open). Not per frame: every
   * store write also persists to localStorage, which stutters the lid on phones. */
  lidProgress: number;
  /** Reading mode: the info screen grows to (almost) the full width below the lens. */
  reading: boolean;
  /** First real tap happened: audio and haptics unlocked. */
  unlocked: boolean;
  accent: ColorAccent;
  activeGem: GemIndex | null;
  catalog: CatalogStatus;
  prefs: Prefs;
  setOpen(open: boolean): void;
  setLidProgress(p: number): void;
  setReading(reading: boolean): void;
  setUnlocked(): void;
  setAccent(a: ColorAccent): void;
  setActiveGem(g: GemIndex | null): void;
  setCatalog(s: CatalogStatus): void;
  setPrefs(p: Partial<Prefs>): void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      open: false,
      lidProgress: 0,
      reading: false,
      unlocked: false,
      accent: 'colorless',
      activeGem: null,
      catalog: { phase: 'empty', version: null, storage: null },
      prefs: DEFAULT_PREFS,
      setOpen: (open) => set({ open }),
      setLidProgress: (lidProgress) => set({ lidProgress }),
      setReading: (reading) => set({ reading }),
      setUnlocked: () => set({ unlocked: true }),
      setAccent: (accent) => set({ accent }),
      setActiveGem: (activeGem) => set({ activeGem }),
      setCatalog: (catalog) => set({ catalog }),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
    }),
    {
      name: 'spelldex-device',
      storage: createJSONStorage(() => localStorage),
      // From the second start the device opens in its last state.
      partialize: (s) => ({ prefs: s.prefs, open: s.open, reading: s.reading }),
      // Stored prefs from older versions lack newer fields; keep the defaults for those.
      merge: (stored, current) => {
        const p = (stored ?? {}) as Partial<Pick<DeviceState, 'prefs' | 'open' | 'reading'>>;
        return { ...current, ...p, prefs: { ...current.prefs, ...p.prefs } };
      },
    },
  ),
);

type ButtonHandler = (b: DeviceButton) => boolean | void;
const handlers: ButtonHandler[] = [];

/** Called by the shell (2D or 3D) when a hardware button is pressed. Newest handler wins. */
export function emitButton(b: DeviceButton): void {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!(b) === true) return;
  }
}

/** Screens register for hardware buttons; return true to consume the press. */
export function useDeviceButton(handler: ButtonHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: ButtonHandler = (b) => ref.current(b);
    handlers.push(h);
    return () => {
      handlers.splice(handlers.indexOf(h), 1);
    };
  }, []);
}

/** The part of the prefs that the design package's feedback engine reads. */
export function feedbackPrefs(p: Prefs) {
  return { sound: p.sound, haptics: p.haptics, volume: p.volume, audioSession: p.audioSession, iosHaptics: p.iosHaptics };
}

export function prefersReducedMotion(prefs: Prefs): boolean {
  if (prefs.reducedMotion != null) return prefs.reducedMotion;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
