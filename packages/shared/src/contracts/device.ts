/**
 * The device ("Codex") is the frame every view lives in. Two implementations share one contract:
 * the 2D CSS shell in apps/web (Phase 1, also the fallback) and the 3D shell built on
 * @spelldex/device-3d. Both expose the same hardware buttons and two screen areas.
 */

export type GemIndex = 0 | 1 | 2 | 3 | 4;

export type DeviceButton =
  | 'scan' | 'back' | 'search'
  | 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right'
  | `gem-${GemIndex}`;

/** Tabs of a card entry, mapped to the five gem buttons in this order. */
export const ENTRY_TABS = ['overview', 'market', 'combos', 'lore', 'printings'] as const;
export type EntryTab = (typeof ENTRY_TABS)[number];

export const ENTRY_TAB_LABELS: Record<EntryTab, string> = {
  overview: 'Übersicht',
  market: 'Markt',
  combos: 'Kombos & Decks',
  lore: 'Lore',
  printings: 'Drucke',
};

export function gemForTab(tab: EntryTab): GemIndex {
  return ENTRY_TABS.indexOf(tab) as GemIndex;
}

export function tabForGem(gem: GemIndex): EntryTab {
  return ENTRY_TABS[gem]!;
}

/** Lid state as seen by the app; `progress` is 0 (closed) .. 1 (open), driven by a spring. */
export type LidPhase = 'closed' | 'opening' | 'open' | 'closing';

/** Projected screen area in CSS pixels relative to the device viewport. */
export interface ScreenArea {
  corners: [Pt, Pt, Pt, Pt];
  rect: { x: number; y: number; width: number; height: number };
  /** True when the screen is axis-aligned (device at rest): place DOM without matrix3d. */
  axisAligned: boolean;
}
export interface Pt { x: number; y: number }
export interface ScreenAreas { top: ScreenArea; bottom: ScreenArea }
