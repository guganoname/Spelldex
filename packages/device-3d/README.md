# @spelldex/device-3d

The Codex: a vertical clamshell in aged brass and dragon-scale leather, built procedurally in three.js. Geometry and textures are generated at startup, so the package ships no image files. `assets/codex.glb` is an exported copy (meshopt + WebP, about 1 MB, clip `open`) for previews and tools; the app uses `createCodex()`.

## Use

```ts
import { createCodex, codexEnvironment, quadToMatrix3d, lidEvents } from '@spelldex/device-3d';

scene.environment = codexEnvironment(renderer); // required: brass is black without reflections
scene.environmentIntensity = 0.7;              // AgX tone mapping, exposure ~0.92, warm key light top left
const codex = createCodex({ tokens });       // tokens: material/gem colors from @spelldex/design, sRGB hex
scene.add(codex.group);

// every frame while something moves (render on demand otherwise)
codex.setOpen(spring.t);                     // 0 closed .. 1 open; overshoot allowed
const moving = codex.update(dt);             // seal pulse, gem fades, key travel
codex.frameCamera(camera);                   // straight-on at t >= 1
const { top, bottom } = codex.getScreenRects(camera, renderer);
// top = lens (lid), bottom = info screen. At rest axisAligned is true: place by rect.
// While moving, size the element once at its open size and use quadToMatrix3d(w, h, corners).
// Hide the overlay while !facing or t < ~0.82; the glass glows ("wakes") between 0.72 and 1.

for (const ev of lidEvents(prevT, t)) feedback(ev); // 'latch-release', 'lid-detent' (40 %)
```

Taps: `pickButton(ndc, camera)` returns a `DeviceButton` while the lid is open, `pickPart()` returns `'seal'` (closed cover, opens) or `'hinge'` (close). `pressButton(name)` plays the key travel; `gem-N` also lights that tab. `setScanning(true)` pulses the scan crystal and the blue status light.

## Layout (1 unit ≈ 1 cm)

Hinge axis is world X at the origin. Open, the device spans 9 × 19.5 (the phone's 9:19.5), both screens face +Z in one plane. Lens 7.58 × 7.28, info screen 7.58 × 5.48. Light comes from the top left, as in the design system.

## Demo

`demo/index.html` is the standalone prototype with placeholder screens and sounds. Serve the package folder (for example `npx serve packages/device-3d`) and open `/demo/`.

## Budget (measured in headless Chromium)

About 45 draw calls and 65k triangles open. The gem glow uses additive sprites instead of a bloom pass, so no postprocessing runs on phones.
