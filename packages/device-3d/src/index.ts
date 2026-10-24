/**
 * The 3D shell of the Codex. Procedural three.js geometry and canvas textures, no image files.
 * The app owns springs, gestures and DOM placement (apps/web/src/device); this package maps the
 * lid progress t to poses and reports where the two screens are.
 */
import type { DeviceButton, ScreenAreas } from '@spelldex/shared/contracts';
import type { Codex, CodexButton } from './codex.js';

export { createCodex, codexEnvironment, quadToMatrix3d, lidEvents, DEFAULT_TOKENS, DIM, BUTTONS } from './codex.js';
export type { Codex, CodexTokens, CodexScreenQuad, CodexButton, CodexGem } from './codex.js';

export const DEVICE_3D_AVAILABLE = true;

/** URL of the optimized glTF (meshopt + WebP, opening clip "open") for tools and previews. */
export const CODEX_GLB_URL = new URL('../assets/codex.glb', import.meta.url).href;

// Compile-time check that the device's button names and screen quads match the shared contract.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const buttonsMatch: Same<CodexButton, DeviceButton> = true;
type _ScreensFit = ReturnType<Codex['getScreenRects']> extends ScreenAreas ? true : never;
const screensFit: _ScreensFit = true;
void buttonsMatch;
void screensFit;
