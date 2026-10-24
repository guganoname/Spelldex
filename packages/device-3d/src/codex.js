// Spelldex "Codex": a vertical clamshell device, built procedurally with three.js.
//
// Coordinates: 1 unit ~ 1 cm. The hinge axis is the world X axis. The base (info screen and
// controls) hangs below it, the lid (lens screen) stands above it when open. Fully open, both
// screens face +Z and lie in one plane, so the DOM overlays are axis-aligned at rest.
//
// The host owns the open spring; this module only maps t (0 closed .. 1 open, overshoot
// allowed) to poses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  leatherMaps, brassMaps, runeStripMaps, runeRingMaps, titleMaps, iconMaps,
  haloTexture, screenGlowTexture,
} from './textures.js';

export const DIM = { W: 9, HALF: 9.41, RH: 0.34, DB: 0.85, DL: 0.55, CR: 0.75 };
const BASE_CY = -(DIM.RH + DIM.HALF / 2);
const LID_CY = DIM.RH + DIM.HALF / 2;

// sRGB hex like CSS; three converts to linear on load. Mirrors @spelldex/design tokens.
export const DEFAULT_TOKENS = {
  material: {
    brass: { color: '#b08d57', metalness: 1, roughness: 0.38 },
    bronzeDark: { color: '#6e4f2e', metalness: 1, roughness: 0.5 },
    leather: { color: '#2a1a14', metalness: 0, roughness: 0.72 },
    obsidian: { color: '#0d0b10', metalness: 0, roughness: 0.08, clearcoat: 1 },
    thread: { color: '#c9b48a', metalness: 0, roughness: 0.85 },
  },
  gem: {
    W: { color: '#f4e9c8' }, U: { color: '#3f7fd0' }, B: { color: '#6b4a8e' },
    R: { color: '#d2492a' }, G: { color: '#3f9a55' }, M: { color: '#e0b04a' }, C: { color: '#b9c2c9' },
  },
  emissiveIntensity: { rest: 0.15, active: 1.2 },
  screenGlow: '#3a2a16',
};

export const BUTTONS = ['scan', 'back', 'search', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right',
  'gem-0', 'gem-1', 'gem-2', 'gem-3', 'gem-4'];
const TAB_COLORS = ['W', 'U', 'B', 'R', 'G'];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function mergeDeep(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const k of Object.keys(b || {})) {
    out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object'
      ? mergeDeep(a[k], b[k]) : b[k];
  }
  return out;
}

// ---------- geometry helpers

function addRR(path, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y); path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r); path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h); path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r); path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}
const rrShape = (w, h, r, cx, cy) => addRR(new THREE.Shape(), w, h, r, cx, cy);
function ringShape(outer, holes) {
  const s = rrShape(...outer);
  for (const h of holes) s.holes.push(addRR(new THREE.Path(), ...h));
  return s;
}

// Extruded slab between z0 and z1; the bevel grows the outline by `bevel`.
function slab(shape, z0, z1, bevel = 0.04, curveSegments = 12) {
  const bt = Math.min(bevel, (z1 - z0) / 2.01);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, z1 - z0 - 2 * bt), bevelEnabled: bt > 0,
    bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments,
  });
  g.translate(0, 0, z0 + bt);
  return g;
}

function gemGeometry(r, h, seg = 8) {
  const pts = [[0, 0], [1, 0], [0.97, 0.26], [0.8, 0.54], [0.48, 0.78], [0, 0.88]]
    .map(([x, y]) => new THREE.Vector2(x * r, y * h));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

const disc = (r, h, seg = 48) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2);
const torus = (R, tube) => new THREE.TorusGeometry(R, tube, 12, 64);
const rivet = () => new THREE.SphereGeometry(0.075, 12, 8).scale(1, 1, 0.55);

// Collects static geometry per material and merges it into one mesh per material.
class PartBin {
  constructor() { this.bins = new Map(); }
  add(key, geo, x = 0, y = 0, z = 0, rotZ = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    if (!this.bins.has(key)) this.bins.set(key, []);
    this.bins.get(key).push(g);
  }
  build(parent, mats, name) {
    for (const [key, list] of this.bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mats[key]);
      mesh.name = `${name}-${key}`;
      parent.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.bins.clear();
  }
}

// ---------- materials

function buildMaterials(tokens, fontFamily) {
  const M = tokens.material;
  const leather = leatherMaps(), brass = brassMaps();
  for (const t of Object.values(leather)) t.repeat.set(0.22, 0.22);
  for (const t of Object.values(brass)) t.repeat.set(0.12, 0.12);
  const std = (tok, extra = {}) => new THREE.MeshStandardMaterial({
    color: tok.color, metalness: tok.metalness, roughness: tok.roughness, ...extra,
  });
  const strip = runeStripMaps();
  strip.map.repeat.set(1 / 5.0, 1 / 0.36); strip.map.offset.set(0.5 - 1.15 / 5.0, 0.5 - 4.08 / 0.36);
  strip.normalMap.repeat.copy(strip.map.repeat); strip.normalMap.offset.copy(strip.map.offset);
  const ring = runeRingMaps(1.36, 1.86);
  const title = titleMaps('SPELLDEX', fontFamily);
  for (const t of [title.map, title.normalMap]) { t.repeat.set(1 / 4.6, 1 / 0.8); t.offset.set(0.5, 0.5 + 3.0 / 0.8); }
  const icons = { back: iconMaps('back'), search: iconMaps('search') };
  // Cylinder caps map the canvas a quarter turn off; turn it back so the arrow points left.
  for (const ic of Object.values(icons)) for (const t of [ic.map, ic.normalMap]) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  const brassMat = std(M.brass, { map: brass.map, roughnessMap: brass.roughnessMap });
  const engraved = (maps) => std(M.brass, { map: maps.map, normalMap: maps.normalMap, roughnessMap: brass.roughnessMap });
  const glass = new THREE.MeshPhysicalMaterial({
    color: M.obsidian.color, metalness: M.obsidian.metalness, roughness: M.obsidian.roughness,
    clearcoat: M.obsidian.clearcoat ?? 1, clearcoatRoughness: 0.05,
    emissive: tokens.screenGlow, emissiveMap: screenGlowTexture(), emissiveIntensity: 0,
    envMapIntensity: 0.22,
  });
  return {
    leather: std(M.leather, { ...leather, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.3 }),
    brass: brassMat,
    bronze: std(M.bronzeDark, { roughnessMap: brass.roughnessMap }),
    thread: std(M.thread),
    strip: engraved(strip),
    ring: engraved(ring),
    title: engraved(title),
    iconBack: engraved(icons.back),
    iconSearch: engraved(icons.search),
    glassLens: glass,
    glassInfo: glass.clone(),
    halo: haloTexture(),
  };
}

function makeGem(parent, bin, mats, color, tokens, { x, y, z, r, h = r * 0.95, seg = 8, bezel = true }) {
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: tokens.emissiveIntensity.rest,
    metalness: 0.05, roughness: 0.14, flatShading: true, envMapIntensity: 1.6,
  });
  const mesh = new THREE.Mesh(gemGeometry(r, h, seg), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  if (bezel) bin.add('brass', torus(r * 1.08, r * 0.15), x, y, z + r * 0.06);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: mats.halo, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  halo.scale.setScalar(r * 5);
  halo.position.set(x, y, z + h * 0.6);
  halo.userData.noExport = true;
  halo.visible = false;
  parent.add(halo);
  const gem = {
    mesh, halo, material: mat, intensity: tokens.emissiveIntensity.rest, target: tokens.emissiveIntensity.rest,
    apply(v) {
      gem.intensity = v;
      mat.emissiveIntensity = v;
      halo.material.opacity = Math.min(0.85, Math.max(0, v - 0.2) * 0.55);
      halo.visible = halo.material.opacity > 0.01;
    },
  };
  return gem;
}

// ---------- device

/**
 * @param {{tokens?: object, fontFamily?: string}} [opts]
 */
export function createCodex(opts = {}) {
  const tokens = mergeDeep(DEFAULT_TOKENS, opts.tokens || {});
  const fontFamily = opts.fontFamily || '"Cinzel", "Trajan Pro", Georgia, serif';
  const mats = buildMaterials(tokens, fontFamily);
  const { W, HALF, RH, DB, DL, CR } = DIM;
  const EI = tokens.emissiveIntensity;
  const gemColor = (k) => tokens.gem[k].color;

  const group = new THREE.Group();
  group.name = 'Codex';
  const buttons = new Map(); // name -> { mesh, rest }
  const pickables = [];
  const addButton = (name, mesh) => {
    mesh.name = `btn-${name}`;
    mesh.userData.button = name;
    buttons.set(name, { mesh, restZ: mesh.position.z, press: 0 });
    pickables.push(mesh);
  };

  // ---- base: info screen, gem tabs, controls
  const base = new THREE.Group();
  base.name = 'Base';
  base.position.y = BASE_CY;
  group.add(base);
  const bb = new PartBin();
  base.add(new THREE.Mesh(slab(rrShape(W - 0.16, HALF - 0.16, CR - 0.08), -DB, 0, 0.08), mats.leather));
  const rim = ringShape([W - 0.06, HALF - 0.06, CR - 0.03], [[W - 0.76, HALF - 0.76, CR - 0.32]]);
  bb.add('brass', slab(rim, -0.03, 0.07, 0.03));

  const info = { cx: 0, cy: 1.15, w: 7.7, h: 5.6 };
  const infoTop = info.cy + info.h / 2 + 0.36, infoBottom = -2.45;
  bb.add('brass', slab(ringShape(
    [8.2, infoTop - infoBottom, 0.5, 0, (infoTop + infoBottom) / 2],
    [[info.w + 0.06, info.h + 0.06, 0.3, 0, info.cy]],
  ), 0, 0.15, 0.04));
  const infoGlass = new THREE.Mesh(new THREE.PlaneGeometry(info.w, info.h), mats.glassInfo);
  infoGlass.position.set(0, info.cy, 0.03);
  infoGlass.name = 'screen-info';
  base.add(infoGlass);
  const infoAnchor = new THREE.Object3D();
  infoAnchor.position.set(0, info.cy, 0.035);
  infoAnchor.userData.size = [info.w - 0.12, info.h - 0.12];
  base.add(infoAnchor);

  const tabGems = TAB_COLORS.map((k, i) => {
    const g = makeGem(base, bb, mats, gemColor(k), tokens, { x: (i - 2) * 1.4, y: -2.05, z: 0.14, r: 0.29, h: 0.26 });
    addButton(`gem-${i}`, g.mesh);
    return g;
  });

  const cy = -3.45;
  // D-pad on a bronze dish; one mesh, the direction comes from the hit point.
  bb.add('bronze', disc(0.74, 0.06), -2.75, cy, 0.03);
  const arm = 0.23, len = 0.64, cr = 0.08;
  const cross = new THREE.Shape();
  cross.moveTo(-arm, len - cr); cross.absarc(-arm + cr, len - cr, cr, Math.PI, Math.PI / 2, true);
  cross.lineTo(arm - cr, len); cross.absarc(arm - cr, len - cr, cr, Math.PI / 2, 0, true);
  cross.lineTo(arm, arm); cross.lineTo(len - cr, arm); cross.absarc(len - cr, arm - cr, cr, Math.PI / 2, 0, true);
  cross.lineTo(len, -arm + cr); cross.absarc(len - cr, -arm + cr, cr, 0, -Math.PI / 2, true);
  cross.lineTo(arm, -arm); cross.lineTo(arm, -len + cr); cross.absarc(arm - cr, -len + cr, cr, 0, -Math.PI / 2, true);
  cross.lineTo(-arm + cr, -len); cross.absarc(-arm + cr, -len + cr, cr, -Math.PI / 2, -Math.PI, true);
  cross.lineTo(-arm, -arm); cross.lineTo(-len + cr, -arm); cross.absarc(-len + cr, -arm + cr, cr, -Math.PI / 2, -Math.PI, true);
  cross.lineTo(-len, arm - cr); cross.absarc(-len + cr, arm - cr, cr, Math.PI, Math.PI / 2, true);
  cross.lineTo(-arm, arm); cross.lineTo(-arm, len - cr);
  const dpad = new THREE.Mesh(slab(cross, 0, 0.18, 0.05), mats.brass);
  dpad.position.set(-2.75, cy, 0.06);
  dpad.name = 'btn-dpad';
  dpad.userData.button = 'dpad';
  base.add(dpad);
  pickables.push(dpad);
  for (const d of ['up', 'down', 'left', 'right']) buttons.set(`dpad-${d}`, { mesh: dpad, restZ: dpad.position.z, press: 0, tilt: d });

  // Scan: the big crystal lens in the thumb zone.
  bb.add('bronze', disc(0.66, 0.06), 0, cy, 0.03);
  bb.add('brass', torus(0.7, 0.085), 0, cy, 0.1);
  const scanMat = new THREE.MeshPhysicalMaterial({
    color: gemColor('M'), emissive: gemColor('M'), emissiveIntensity: EI.rest, roughness: 0.06,
    metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5,
  });
  const scan = new THREE.Mesh(new THREE.SphereGeometry(0.6, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    .rotateX(Math.PI / 2).scale(1, 1, 0.5), scanMat);
  scan.position.set(0, cy, 0.06);
  base.add(scan);
  addButton('scan', scan);
  const scanGem = { material: scanMat, intensity: EI.rest, target: EI.rest, apply(v) { scanGem.intensity = v; scanMat.emissiveIntensity = v; } };

  for (const [name, x, mat] of [['back', 2.35, mats.iconBack], ['search', 3.35, mats.iconSearch]]) {
    bb.add('brass', torus(0.37, 0.05), x, cy, 0.06);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.16, 40).rotateX(Math.PI / 2), [mats.brass, mat, mats.brass]);
    b.position.set(x, cy, 0.09);
    base.add(b);
    addButton(name, b);
  }

  const rivets = (bin, h) => {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) bin.add('brass', rivet(), sx * (W / 2 - 0.42), sy * (h / 2 - 0.42), 0.07);
      bin.add('brass', rivet(), sx * (W / 2 - 0.2), 0, 0.07);
    }
  };
  rivets(bb, HALF);
  bb.build(base, mats, 'base');

  // ---- lid: pivot on the hinge axis, built in its open pose
  const lidPivot = new THREE.Group();
  lidPivot.name = 'LidPivot';
  group.add(lidPivot);
  const lid = new THREE.Group();
  lid.name = 'Lid';
  lid.position.y = LID_CY;
  lidPivot.add(lid);
  const lb = new PartBin();
  lid.add(new THREE.Mesh(slab(rrShape(W - 0.16, HALF - 0.16, CR - 0.08), -DL, 0, 0.08), mats.leather));
  lb.add('brass', slab(rim, -0.03, 0.07, 0.03));
  const lens = { cy: -0.25, w: 7.7, h: 7.4 };
  lb.add('brass', slab(ringShape([8.2, lens.h + 0.7, 0.5, 0, lens.cy], [[lens.w + 0.06, lens.h + 0.06, 0.3, 0, lens.cy]]), 0, 0.15, 0.04));
  const lensGlass = new THREE.Mesh(new THREE.PlaneGeometry(lens.w, lens.h), mats.glassLens);
  lensGlass.position.set(0, lens.cy, 0.03);
  lensGlass.name = 'screen-lens';
  lid.add(lensGlass);
  const lensAnchor = new THREE.Object3D();
  lensAnchor.position.set(0, lens.cy, 0.035);
  lensAnchor.userData.size = [lens.w - 0.12, lens.h - 0.12];
  lid.add(lensAnchor);
  const statusGems = [['M', -3.3], ['U', -2.8], ['G', -2.3]].map(([k, x]) =>
    makeGem(lid, lb, mats, gemColor(k), tokens, { x, y: 4.1, z: 0.02, r: 0.16, h: 0.15, seg: 6 }));
  const strip = new THREE.Mesh(slab(rrShape(5.0, 0.36, 0.1, 1.15, 4.08), 0, 0.06, 0.02), mats.strip);
  lid.add(strip);
  rivets(lb, HALF);

  // Cover: the outside of the lid, built upright as seen when closed.
  const cover = new THREE.Group();
  cover.name = 'Cover';
  cover.position.z = -DL;
  cover.rotation.x = Math.PI;
  lid.add(cover);
  const cb = new PartBin();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const X = sx * W / 2, Y = sy * HALF / 2, L = 1.35;
      const p = (dx, dy) => new THREE.Vector2(X - sx * dx, Y - sy * dy);
      const pts = [p(L, 0)];
      const cx = CR, steps = 8;
      pts.push(p(cx, 0));
      for (let k = 1; k <= steps; k++) {
        const a = k / steps * Math.PI / 2;
        pts.push(p(cx - Math.sin(a) * cx, cx - Math.cos(a) * cx));
      }
      pts.push(p(0, L));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, u = 1 - t;
        const ctrl = 0.42;
        pts.push(p(u * u * 0 + 2 * u * t * ctrl + t * t * L, u * u * L + 2 * u * t * ctrl + t * t * 0));
      }
      cb.add('brass', slab(new THREE.Shape(pts), -0.02, 0.08, 0.03));
      cb.add('brass', rivet(), X - sx * 0.4, Y - sy * 0.4, 0.09);
    }
  }
  const medY = 0.45;
  cb.add('bronze', disc(1.98, 0.08, 64), 0, medY, 0.02);
  cb.add('brass', torus(1.98, 0.11), 0, medY, 0.07);
  cb.add('brass', torus(1.33, 0.07), 0, medY, 0.07);
  cb.add('brass', disc(1.3, 0.1, 64), 0, medY, 0.06);
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.36, 1.86, 96), mats.ring);
  ringMesh.position.set(0, medY, 0.066);
  cover.add(ringMesh);
  const seal = makeGem(cover, cb, mats, gemColor('C'), tokens, { x: 0, y: medY, z: 0.1, r: 0.82, h: 0.95, seg: 10, bezel: false });
  pickables.push(seal.mesh);
  seal.mesh.userData.button = 'seal';
  const pentaGems = TAB_COLORS.map((k, i) => {
    const a = Math.PI / 2 - i * Math.PI * 2 / 5;
    return makeGem(cover, cb, mats, gemColor(k), tokens, { x: Math.cos(a) * 2.5, y: medY + Math.sin(a) * 2.5, z: 0.02, r: 0.24, h: 0.22 });
  });
  const titlePlate = new THREE.Mesh(slab(rrShape(4.6, 0.8, 0.18, 0, -3.0), 0, 0.1, 0.03), mats.title);
  cover.add(titlePlate);
  cb.add('brass', slab(rrShape(1.3, 0.8, 0.28, 0, -4.25), 0, 0.09, 0.03));
  cb.add('brass', rivet(), -0.35, -4.2, 0.1);
  cb.add('brass', rivet(), 0.35, -4.2, 0.1);

  // Saddle stitching around the cover.
  const stitchPath = addRR(new THREE.Path(), W - 1.0, HALF - 1.0, 0.45);
  const stitchCount = Math.floor(stitchPath.getLength() / 0.26);
  const stitches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.04, 0.03), mats.thread, stitchCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < stitchCount; i++) {
    const u = i / stitchCount, pt = stitchPath.getPointAt(u), tg = stitchPath.getTangentAt(u);
    q.setFromAxisAngle(zAxis, Math.atan2(tg.y, tg.x));
    stitches.setMatrixAt(i, m4.compose(new THREE.Vector3(pt.x, pt.y, 0.01), q, one));
  }
  stitches.name = 'cover-stitches';
  cover.add(stitches);
  cb.build(cover, mats, 'cover');
  lb.build(lid, mats, 'lid');

  // ---- hinge: three brass knuckles on a bronze core
  const hinge = new THREE.Group();
  hinge.name = 'Hinge';
  group.add(hinge);
  const hb = new PartBin();
  const knuckle = (x0, x1) => hb.add('brass', new THREE.CylinderGeometry(0.38, 0.38, x1 - x0, 32).rotateZ(Math.PI / 2), (x0 + x1) / 2, 0, 0);
  knuckle(-4.15, -1.55); knuckle(-1.45, 1.45); knuckle(1.55, 4.15);
  for (const x of [-4.15, -1.55, -1.45, 1.45, 1.55, 4.15]) hb.add('brass', new THREE.TorusGeometry(0.37, 0.035, 8, 32).rotateY(Math.PI / 2), x, 0, 0);
  hb.add('bronze', new THREE.CylinderGeometry(0.29, 0.29, 8.6, 24).rotateZ(Math.PI / 2));
  for (const sx of [-1, 1]) hb.add('brass', new THREE.SphereGeometry(0.3, 20, 12).scale(0.55, 1, 1), sx * 4.3, 0, 0);
  hb.build(hinge, mats, 'hinge');
  for (const m of hinge.children) { m.userData.button = 'hinge'; pickables.push(m); }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // ---------- state
  let t = 0;
  let time = 0;
  let activeTab = 0;
  let scanning = false;
  const allGems = [...tabGems, ...statusGems, ...pentaGems, seal, scanGem];
  const sealCycle = TAB_COLORS.map((k) => new THREE.Color(gemColor(k)));
  const tmpColor = new THREE.Color();

  function setOpen(v) {
    t = v;
    // Overshoot past 1 swings the lid back only a little: heavy lid, soft stop.
    const lt = v > 1 ? 1 + (v - 1) * 0.6 : Math.max(0, v);
    lidPivot.rotation.x = Math.PI * (1 - lt);
    const wake = smooth(0.72, 1.0, v);
    mats.glassLens.emissiveIntensity = wake * 0.9;
    mats.glassInfo.emissiveIntensity = wake * 0.9;
  }
  setOpen(0);

  /** Advances idle effects. Returns true while something still moves (render-on-demand hosts). */
  function update(dt) {
    time += dt;
    let moving = false;
    const openish = t > 0.6;
    tabGems.forEach((g, i) => { g.target = openish ? (i === activeTab ? EI.active : EI.rest + 0.15) : EI.rest * 0.5; });
    statusGems[0].target = openish ? 0.9 : 0;
    statusGems[1].target = scanning ? 0.5 + 0.7 * (0.5 + 0.5 * Math.sin(time * 9)) : (openish ? 0.25 : 0);
    statusGems[2].target = openish ? 0.6 : 0;
    scanGem.target = openish ? (scanning ? 1.4 : 0.45) : EI.rest * 0.5;
    const closed = t < 0.08;
    if (closed) {
      const p = 0.5 + 0.5 * Math.sin(time * 1.6);
      seal.target = 0.35 + 0.45 * p;
      const f = (time / 2.4) % 5, i0 = Math.floor(f), mix = smooth(0, 1, f - i0);
      tmpColor.copy(sealCycle[i0]).lerp(sealCycle[(i0 + 1) % 5], mix);
      seal.material.emissive.copy(tmpColor);
      seal.halo.material.color.copy(tmpColor);
      pentaGems.forEach((g, i) => { g.target = 0.2 + 0.5 * Math.max(0, Math.sin(time * 1.6 - i * 0.9)); });
      moving = true;
    } else {
      seal.target = 0.2;
      pentaGems.forEach((g) => { g.target = 0.15; });
    }
    if (scanning) moving = true;
    const k = 1 - Math.exp(-dt * 10);
    for (const g of allGems) {
      if (g.manual != null) g.target = g.manual;
      const d = g.target - g.intensity;
      if (Math.abs(d) > 0.003) { g.apply(g.intensity + d * k); moving = true; }
    }
    for (const [, b] of buttons) {
      if (b.press > 0) {
        b.press = Math.max(0, b.press - dt / 0.14);
        const depth = Math.sin(Math.min(1, b.press) * Math.PI / 2) * 0.045;
        b.mesh.position.z = b.restZ - depth;
        if (b.tilt) {
          const a = depth * 2.2;
          b.mesh.rotation.set(b.tilt === 'up' ? -a : b.tilt === 'down' ? a : 0, b.tilt === 'left' ? -a : b.tilt === 'right' ? a : 0, 0);
        }
        moving = true;
      }
    }
    return moving;
  }

  // ---------- camera framing

  const _pos = new THREE.Vector3(), _tgt = new THREE.Vector3();
  /** Frames the device for a given t. At t>=1 the camera looks straight on, so screens are axis-aligned. */
  function frameCamera(camera, aspect = camera.aspect) {
    const k = smooth(0.15, 1, t);
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const needOpen = Math.max(19.5 * 1.035, (W * 1.07) / aspect);
    const needClosed = Math.max(10.3 * 1.22, (W * 1.32) / aspect);
    const dOpen = needOpen / (2 * tanH), dClosed = needClosed / (2 * tanH);
    const closedTgt = new THREE.Vector3(0, BASE_CY + 0.25, 0.4);
    const closedPos = new THREE.Vector3(0.16, -0.26, 1).normalize().multiplyScalar(dClosed).add(closedTgt);
    const openPos = new THREE.Vector3(0, 0, dOpen);
    _tgt.lerpVectors(closedTgt, new THREE.Vector3(0, 0, 0), k);
    _pos.lerpVectors(closedPos, openPos, k);
    _pos.z += Math.sin(Math.PI * clamp01(t)) * dOpen * 0.18;
    camera.position.copy(_pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(_tgt);
    camera.updateMatrixWorld();
  }

  // ---------- screen rectangles for DOM overlays

  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
  function quadFor(anchor, camera, width, height) {
    const [w, h] = anchor.userData.size;
    const corners = [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([x, y]) => {
      _v.set(x, y, 0);
      anchor.localToWorld(_v);
      _v.project(camera);
      return { x: (_v.x + 1) / 2 * width, y: (1 - _v.y) / 2 * height };
    });
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
    const eps = 0.5;
    const axisAligned = Math.abs(corners[0].y - corners[1].y) < eps && Math.abs(corners[3].y - corners[2].y) < eps
      && Math.abs(corners[0].x - corners[3].x) < eps && Math.abs(corners[1].x - corners[2].x) < eps;
    anchor.getWorldPosition(_c);
    _n.set(0, 0, 1).transformDirection(anchor.matrixWorld);
    const facing = _n.dot(_v.copy(camera.position).sub(_c)) > 0;
    return {
      corners, axisAligned, facing,
      rect: { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top },
      // world units -> CSS px at rest, for corner radii etc.
      pxPerUnit: (right - left) / w,
    };
  }
  /**
   * Screen rectangles in CSS pixels relative to the canvas. `top` is the lens (lid), `bottom` the
   * info screen. Pass a renderer or {width,height} in CSS pixels.
   */
  function getScreenRects(camera, renderer) {
    let width, height;
    if (renderer && renderer.domElement) { width = renderer.domElement.clientWidth; height = renderer.domElement.clientHeight; }
    else { width = renderer.width; height = renderer.height; }
    group.updateMatrixWorld();
    camera.updateMatrixWorld();
    return { top: quadFor(lensAnchor, camera, width, height), bottom: quadFor(infoAnchor, camera, width, height) };
  }

  // ---------- buttons

  const raycaster = new THREE.Raycaster();
  const _local = new THREE.Vector3();
  function pick(ndc, camera) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    const name = hit.object.userData.button;
    if (name === 'seal') return t < 0.5 ? 'seal' : null;
    if (name === 'hinge') return 'hinge';
    if (t < 0.5) return null;
    if (name !== 'dpad') return name;
    _local.copy(hit.point);
    dpad.worldToLocal(_local);
    if (Math.abs(_local.x) > Math.abs(_local.y)) return _local.x > 0 ? 'dpad-right' : 'dpad-left';
    return _local.y > 0 ? 'dpad-up' : 'dpad-down';
  }
  /** Hardware button under ndc, or null. Only while open. */
  function pickButton(ndc, camera) {
    const name = pick(ndc, camera);
    return name === 'seal' || name === 'hinge' ? null : name;
  }
  /** Non-button parts: 'seal' (closed cover) or 'hinge' (close gesture). */
  function pickPart(ndc, camera) {
    const name = pick(ndc, camera);
    return name === 'seal' || name === 'hinge' ? name : null;
  }
  function pressButton(name) {
    const b = buttons.get(name);
    if (!b) return;
    if (b.tilt) for (const d of ['up', 'down', 'left', 'right']) buttons.get(`dpad-${d}`).press = 0;
    b.press = 1;
    if (name.startsWith('gem-')) setActiveTab(Number(name.slice(4)));
  }
  function setActiveTab(i) { activeTab = i; }
  function setGemGlow(i, intensity) { tabGems[i].manual = intensity == null ? null : intensity; }
  function setScanning(on) { scanning = !!on; }

  /** Opening clip for glTF export: LidPivot rotation, closed -> open. */
  function openClip(duration = 0.8) {
    const times = [], values = [], qq = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, k = 1 - Math.pow(1 - u, 3);
      times.push(u * duration);
      qq.setFromEuler(e.set(Math.PI * (1 - k), 0, 0));
      values.push(qq.x, qq.y, qq.z, qq.w);
    }
    return new THREE.AnimationClip('open', duration, [new THREE.QuaternionKeyframeTrack('LidPivot.quaternion', times, values)]);
  }

  function dispose() {
    const seen = new Set();
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
        m.dispose();
      }
    });
  }

  return {
    group, hinge, lidPivot, dims: DIM, buttons: BUTTONS,
    gems: { tabs: tabGems, status: statusGems, cover: pentaGems, seal, scan: scanGem },
    get t() { return t; },
    setOpen, update, frameCamera, getScreenRects, pickButton, pickPart, pressButton,
    setActiveTab, setGemGlow, setScanning, openClip, dispose,
  };
}

/** CSS matrix3d that maps a w×h element (transform-origin 0 0) onto four corners TL,TR,BR,BL. */
export function quadToMatrix3d(w, h, corners) {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0, hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,1)`;
}

/** Lid events for the feedback layer, from consecutive t values. */
export function lidEvents(prev, next) {
  const out = [];
  if (prev <= 0.001 && next > 0.001) out.push('latch-release');
  if (prev < 0.4 && next >= 0.4) out.push('lid-detent');
  return out;
}
