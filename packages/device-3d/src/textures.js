// Procedural textures for the Codex device. Everything is drawn into canvases at
// startup, so the device ships without image files.
import * as THREE from 'three';

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function boxBlur(src, w, h, wrap) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          let xx = x + ox, yy = y + oy;
          if (wrap) { xx = (xx + w) % w; yy = (yy + h) % h; }
          else if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += src[yy * w + xx]; n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

// Height field (0..1) -> tangent-space normal map canvas (OpenGL convention, +Y up).
function normalCanvas(height, w, h, strength, wrap) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; }
    else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return height[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      // canvas rows grow downwards, texture v grows upwards
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(values, w, h, rgbScale = [1, 1, 1]) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(1, values[i]));
    d[i * 4] = v * rgbScale[0] * 255;
    d[i * 4 + 1] = v * rgbScale[1] * 255;
    d[i * 4 + 2] = v * rgbScale[2] * 255;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function readMask(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  return m;
}

function tex(canvas, { srgb = false, repeat = null, wrap = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap || repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Dragon-scale leather: rows of overlapping scales whose rounded edges point down.
export function leatherMaps(size = 512) {
  const s = 64, r = s * 0.66, rowH = s * 0.5;
  const H = new Float32Array(size * size), C = new Float32Array(size * size), R = new Float32Array(size * size);
  const rand = rng(11);
  const tint = [];
  for (let k = 0; k < 8 * 16; k++) tint.push(0.86 + rand() * 0.2);
  let grain = new Float32Array(size * size);
  for (let i = 0; i < grain.length; i++) grain[i] = rand();
  grain = boxBlur(grain, size, size, true);
  for (let py = 0; py < size; py++) {
    const jMin = Math.floor((py - r) / rowH), jMax = Math.ceil((py + r) / rowH);
    for (let px = 0; px < size; px++) {
      let t = 0, j0 = 0, i0 = 0;
      for (let j = jMin; j <= jMax; j++) {
        const cy = j * rowH, off = (((j % 2) + 2) % 2) * s * 0.5;
        const i = Math.round((px - off) / s), cx = i * s + off;
        const d = Math.hypot(px - cx, py - cy);
        if (d < r) { t = 1 - d / r; j0 = j; i0 = i; break; }
      }
      const k = py * size + px, g = grain[k] - 0.5;
      const dome = Math.pow(t, 0.55);
      H[k] = 0.2 + 0.8 * dome + g * 0.25;
      const ti = tint[(((i0 % 8) + 8) % 8) * 16 + (((j0 % 16) + 16) % 16)];
      C[k] = ti * (0.62 + 0.38 * dome) + g * 0.12;
      R[k] = 1.05 - 0.28 * dome + g * 0.2;
    }
  }
  const Hs = boxBlur(H, size, size, true);
  return {
    map: tex(grayCanvas(C, size, size), { srgb: true, wrap: true }),
    normalMap: tex(normalCanvas(Hs, size, size, 7, true), { wrap: true }),
    roughnessMap: tex(grayCanvas(R, size, size), { wrap: true }),
  };
}

// Aged brass: soft patina blotches plus fine scratches. Used as color multiplier and roughness.
export function brassMaps(size = 512) {
  const rand = rng(5);
  const mk = () => {
    const c = makeCanvas(size), ctx = c.getContext('2d');
    return { c, ctx };
  };
  const col = mk(), rough = mk();
  col.ctx.fillStyle = '#e6e6e6'; col.ctx.fillRect(0, 0, size, size);
  rough.ctx.fillStyle = '#b4b4b4'; rough.ctx.fillRect(0, 0, size, size);
  const wrapDraw = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy); };
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, rad = 20 + rand() * 70, a = 0.08 + rand() * 0.14;
    wrapDraw((ox, oy) => {
      for (const [ctx, colr] of [[col.ctx, `rgba(70,60,40,${a})`], [rough.ctx, `rgba(255,255,255,${a * 1.4})`]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, colr); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    });
  }
  for (let i = 0; i < 900; i++) {
    const x = rand() * size, y = rand() * size, ang = rand() * Math.PI, len = 6 + rand() * 40;
    const light = rand() < 0.6;
    wrapDraw((ox, oy) => {
      rough.ctx.strokeStyle = light ? 'rgba(40,40,40,0.18)' : 'rgba(255,255,255,0.14)';
      rough.ctx.lineWidth = 0.6;
      rough.ctx.beginPath();
      rough.ctx.moveTo(x + ox, y + oy);
      rough.ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
      rough.ctx.stroke();
    });
  }
  return {
    map: tex(col.c, { srgb: true, wrap: true }),
    roughnessMap: tex(rough.c, { wrap: true }),
  };
}

// Own rune alphabet: a stem plus one to three branches. Deliberately not any real script
// or Wizards symbol.
export function drawRune(ctx, x, y, s, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  const h = s / 2;
  ctx.beginPath();
  ctx.moveTo(0, -h); ctx.lineTo(0, h);
  const n = 1 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const kind = Math.floor(r() * 6), side = r() < 0.5 ? -1 : 1, y0 = (Math.floor(r() * 3) - 1) * h * 0.5;
    switch (kind) {
      case 0: ctx.moveTo(0, y0 - h * 0.45); ctx.lineTo(side * h * 0.6, y0); break;
      case 1: ctx.moveTo(0, y0); ctx.lineTo(side * h * 0.6, y0 + h * 0.45); break;
      case 2: ctx.moveTo(0, y0 - h * 0.4); ctx.lineTo(side * h * 0.55, y0); ctx.lineTo(0, y0 + h * 0.4); break;
      case 3: ctx.moveTo(-h * 0.45, y0); ctx.lineTo(h * 0.45, y0); break;
      case 4: ctx.moveTo(side * h * 0.34 + h * 0.13, y0); ctx.arc(side * h * 0.34, y0, h * 0.13, 0, Math.PI * 2); break;
      default: ctx.moveTo(-h * 0.5, -h); ctx.lineTo(h * 0.5, -h * 0.55); break;
    }
  }
  ctx.stroke();
  ctx.restore();
}

// Turns a white-on-black drawing into an engraving: dark grooves in the color map and
// matching normals.
function engrave(w, h, draw, { strength = 3, groove = 0.55 } = {}) {
  const m = makeCanvas(w, h), ctx = m.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  draw(ctx);
  const mask = boxBlur(readMask(m), w, h, false);
  const height = new Float32Array(mask.length), colr = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) { height[i] = 1 - mask[i]; colr[i] = 1 - mask[i] * groove; }
  return {
    map: tex(grayCanvas(colr, w, h, [1, 0.95, 0.86]), { srgb: true }),
    normalMap: tex(normalCanvas(height, w, h, strength, false)),
  };
}

export function runeStripMaps(seed = 3) {
  const w = 1024, h = 72;
  return engrave(w, h, (ctx) => {
    const r = rng(seed);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 8); ctx.lineTo(w - 10, 8); ctx.moveTo(10, h - 8); ctx.lineTo(w - 10, h - 8); ctx.stroke();
    ctx.lineWidth = 4.5;
    for (let x = 34; x < w - 20; x += 50) drawRune(ctx, x, h / 2, 36, r);
  });
}

export function runeRingMaps(inner, outer, seed = 9) {
  const size = 1024, scale = size / (outer * 2), c = size / 2;
  return engrave(size, size, (ctx) => {
    const r = rng(seed);
    ctx.lineWidth = 5;
    for (const rad of [inner + 0.07, outer - 0.07]) {
      ctx.beginPath(); ctx.arc(c, c, rad * scale, 0, Math.PI * 2); ctx.stroke();
    }
    const mid = (inner + outer) / 2 * scale, count = 30;
    ctx.lineWidth = 6;
    for (let k = 0; k < count; k++) {
      const a = k / count * Math.PI * 2;
      drawRune(ctx, c + Math.cos(a) * mid, c + Math.sin(a) * mid, (outer - inner) * scale * 0.5, r, a + Math.PI / 2);
    }
  }, { strength: 2.5 });
}

export function titleMaps(text, fontFamily) {
  const w = 1024, h = 176;
  return engrave(w, h, (ctx) => {
    ctx.font = `600 104px ${fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const spaced = text.split('').join('  ');
    ctx.fillText(spaced, w / 2, h / 2 + 6);
    ctx.lineWidth = 4;
    const tw = ctx.measureText(spaced).width / 2 + 30;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + sgn * tw, h / 2); ctx.lineTo(w / 2 + sgn * (w / 2 - 30), h / 2);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2 + sgn * (w / 2 - 30), h / 2, 7, 0, Math.PI * 2); ctx.fill();
    }
  }, { strength: 2.5, groove: 0.6 });
}

export function iconMaps(kind) {
  const s = 256;
  return engrave(s, s, (ctx) => {
    ctx.lineWidth = 16;
    ctx.beginPath();
    if (kind === 'back') {
      ctx.moveTo(150, 70); ctx.lineTo(90, 128); ctx.lineTo(150, 186);
    } else {
      ctx.arc(115, 115, 46, 0, Math.PI * 2);
      ctx.moveTo(150, 150); ctx.lineTo(190, 190);
    }
    ctx.stroke();
  }, { strength: 3, groove: 0.65 });
}

export function haloTexture() {
  const c = makeCanvas(128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: true });
}

export function screenGlowTexture() {
  const c = makeCanvas(256), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 190);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#5a5a5a'); g.addColorStop(1, '#101010');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return tex(c, { srgb: true });
}
