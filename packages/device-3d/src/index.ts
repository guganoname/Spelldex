/**
 * PLACEHOLDER, owned by the 3D thread. Agreed API:
 *   createCodex({ tokens }) -> {
 *     group: THREE.Group, setOpen(t: 0..1), getScreenRects(camera, renderer) -> ScreenAreas,
 *     setGemGlow(i: 0..4, intensity), pressButton(name: DeviceButton), pickButton(ndc, camera) -> DeviceButton | null,
 *     dispose()
 *   }
 * The app (apps/web/src/device/Device3D.tsx) owns springs and DOM placement.
 */
export const DEVICE_3D_AVAILABLE = false;
