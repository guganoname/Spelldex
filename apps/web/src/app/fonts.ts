/**
 * Bundled fonts (SIL OFL, from Fontsource, precached by the service worker so they work offline).
 * Before this the tokens named Cinzel, Crimson Pro and Inter but nothing loaded them, so every
 * device showed its own fallback serif.
 */
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/crimson-pro/latin-400.css';
import '@fontsource/crimson-pro/latin-400-italic.css';
import '@fontsource/crimson-pro/latin-600.css';
import '../styles/fonts.css';

const WAIT_MS = 2500;

let ready: Promise<void> | null = null;

/** Resolves when the display fonts are usable, or after a short timeout (never rejects). */
export function fontsReady(): Promise<void> {
  if (!ready) {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    ready = !fonts
      ? Promise.resolve()
      : Promise.race([
          Promise.all([
            fonts.load('600 104px Cinzel'),
            fonts.load('400 20px Cinzel'),
            fonts.load('400 16px "Inter Variable"'),
            fonts.load('400 17px "Crimson Pro"'),
          ]).then(() => undefined),
          new Promise<void>((r) => setTimeout(r, WAIT_MS)),
        ]).catch(() => undefined);
  }
  return ready;
}
