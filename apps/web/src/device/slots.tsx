/**
 * The two screens of the device are DOM containers owned by the shell (2D or 3D). Routes render
 * into them with <TopScreen> and <BottomScreen>, so screen content never depends on which shell
 * is active.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Slots {
  top: HTMLElement | null;
  bottom: HTMLElement | null;
}

type SlotRef = (el: HTMLElement | null) => void;
const SlotContext = createContext<{ slots: Slots; refs: Record<keyof Slots, SlotRef> } | null>(null);

export function ScreenSlotsProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ top: null, bottom: null });
  // Stable ref callbacks: a new function per render would re-run the ref and loop.
  const refs = useMemo(() => {
    const make = (name: keyof Slots): SlotRef => (el) => setSlots((s) => (s[name] === el ? s : { ...s, [name]: el }));
    return { top: make('top'), bottom: make('bottom') };
  }, []);
  const value = useMemo(() => ({ slots, refs }), [slots, refs]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/** Used by shells: ref={useSlotRef('top')} on the element that covers the screen glass. */
export function useSlotRef(name: keyof Slots): SlotRef {
  const ctx = useContext(SlotContext);
  if (!ctx) throw new Error('ScreenSlotsProvider missing');
  return ctx.refs[name];
}

function Portal({ name, children }: { name: keyof Slots; children: ReactNode }) {
  const ctx = useContext(SlotContext);
  const el = ctx?.slots[name];
  return el ? createPortal(children, el) : null;
}

export const TopScreen = ({ children }: { children: ReactNode }) => <Portal name="top">{children}</Portal>;
export const BottomScreen = ({ children }: { children: ReactNode }) => <Portal name="bottom">{children}</Portal>;
