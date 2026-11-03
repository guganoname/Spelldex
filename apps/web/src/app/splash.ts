/**
 * The boot splash lives in index.html (painted before any script). The device shell calls
 * hideSplash() once it has drawn its first frame; until then nothing else of the app is visible.
 */
const SAFETY_MS = 15_000;

let hidden = false;
let resolveGone: () => void;
/** Resolves when the splash starts fading out. */
export const splashGone = new Promise<void>((r) => { resolveGone = r; });

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  resolveGone();
  const el = document.getElementById('boot');
  if (!el) return;
  // Two frames: the shell's first frame is committed before the fade starts.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.dataset.done = '';
    const remove = () => el.remove();
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 800);
  }));
}

export const splashVisible = () => !hidden;

/** Never leave the app stuck behind the splash, whatever fails on the way. */
export function armSplashSafety(): void {
  setTimeout(hideSplash, SAFETY_MS);
}
