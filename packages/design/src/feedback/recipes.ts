/**
 * Klangrezepte im ASMR-Stil: nah, leise, trocken, echte Materialien
 * (Messing, Leder, Pergament, Kristallglas). Jedes Rezept erzeugt bei jedem
 * Seed eine leicht andere Variante; die Engine rendert 4 Varianten pro Klang.
 */
import { alloc, choir, creak, finish, jit, midi, modal, noise, tone, type Rng } from "./dsp";
import { tokens } from "../tokens/tokens";
import type { GemColor, Rarity } from "./events";

type Recipe = (rng: Rng) => Float32Array;

const GLASS: [number, number, number][] = [
  [1, 1, 1],
  [2.32, 0.32, 0.45],
  [4.25, 0.14, 0.22],
  [6.63, 0.06, 0.12],
];

function glass(out: Float32Array, rng: Rng, at: number, f: number, gain: number, tau = 0.7) {
  modal(out, {
    at,
    gain,
    attack: 0.002,
    modes: GLASS.map(([r, a, t]) => [f * r * jit(rng, 0.004), a, t * tau] as [number, number, number]),
  });
}

/** Kurzer mechanischer Klick: Rauschimpuls im Band plus kleine Körperresonanz. */
function click(out: Float32Array, rng: Rng, at: number, f: number, gain: number, len = 0.012) {
  noise(out, rng, { at, dur: len * 4, gain, attack: 0.0004, tau: len / 3, filters: [{ type: "bp", f: f * jit(rng, 0.08), q: 1.4 }] });
  modal(out, { at, gain: gain * 0.25, modes: [[f * 0.31 * jit(rng, 0.05), 1, 0.012]] });
}

function thump(out: Float32Array, at: number, f: number, gain: number, tau = 0.04) {
  tone(out, { at, f: f * 1.8, fEnd: f, glide: tau / 3, dur: tau * 6, gain, attack: 0.001, tau });
}

/** Messing-Klingen: unharmonische Moden einer kleinen Metallplatte. */
function brassRing(out: Float32Array, rng: Rng, at: number, f: number, gain: number, tau = 0.18) {
  const ratios = [1, 1.59, 2.14, 2.65, 3.91];
  modal(out, {
    at,
    gain,
    modes: ratios.map((r, i) => [f * r * jit(rng, 0.01), 1 / (i + 1.2), tau / (1 + i * 0.4)] as [number, number, number]),
  });
}

function paper(out: Float32Array, rng: Rng, at: number, dur: number, gain: number, f = 2600) {
  noise(out, rng, { at, dur, gain, swell: true, filters: [{ type: "bp", f: f * jit(rng, 0.1), fEnd: f * 0.7, q: 0.8 }, { type: "lp", f: 6000 }] });
}

const R = (sec: number, peak: number, body: (o: Float32Array) => void): Float32Array => {
  const o = alloc(sec);
  body(o);
  return finish(o, peak);
};

const press: Recipe = (rng) =>
  R(0.18, 0.42, (o) => {
    click(o, rng, 0, 3300, 1);
    thump(o, 0.001, 150 * jit(rng, 0.06), 0.55, 0.025);
    click(o, rng, 0.05 + rng() * 0.012, 4300, 0.32, 0.008); // Rückfedern beim Loslassen
  });

const back: Recipe = (rng) =>
  R(0.2, 0.4, (o) => {
    click(o, rng, 0, 2200, 1);
    thump(o, 0.001, 110 * jit(rng, 0.06), 0.7, 0.03);
    click(o, rng, 0.06 + rng() * 0.01, 3000, 0.25, 0.008);
  });

const tab = (gem: GemColor): Recipe => (rng) =>
  R(1.6, 0.36, (o) => {
    click(o, rng, 0, 5200, 0.18, 0.006);
    glass(o, rng, 0.004, tokens.sound.gemPitch[gem], 1, 0.75);
    glass(o, rng, 0.004, tokens.sound.gemPitch[gem] * 2.005, 0.12, 0.4);
  });

const toggle: Recipe = (rng) =>
  R(0.4, 0.5, (o) => {
    click(o, rng, 0, 2600, 0.8);
    brassRing(o, rng, 0.002, 1850 * jit(rng, 0.03), 0.35, 0.12);
    click(o, rng, 0.055 + rng() * 0.01, 3600, 1, 0.01);
    thump(o, 0.056, 130, 0.45, 0.03);
  });

const swipe: Recipe = (rng) => R(0.3, 0.2, (o) => paper(o, rng, 0, 0.24, 1, 3400));

const latchRelease: Recipe = (rng) =>
  R(0.7, 0.55, (o) => {
    click(o, rng, 0, 5200, 1, 0.006);
    brassRing(o, rng, 0.001, 2350 * jit(rng, 0.02), 0.6, 0.32);
    click(o, rng, 0.03, 2600, 0.5, 0.01);
    thump(o, 0.03, 95, 0.35, 0.05);
  });

const lidDetent: Recipe = (rng) =>
  R(0.4, 0.55, (o) => {
    thump(o, 0, 88 * jit(rng, 0.05), 1, 0.06);
    click(o, rng, 0.002, 1700, 0.6, 0.014);
    brassRing(o, rng, 0.003, 980, 0.15, 0.1);
  });

const lidSettle: Recipe = (rng) =>
  R(2.0, 0.42, (o) => {
    creak(o, rng, { at: 0, dur: 0.32, gain: 0.5, rate: [35, 90, 30], res: [[720, 0.004], [1450, 0.003], [260, 0.006]] });
    thump(o, 0.28, 70, 0.9, 0.08);
    // Bildschirm erwacht: tiefes Summen mit Oberton, langsam einschwingend
    tone(o, { at: 0.34, f: 98, fEnd: 110, glide: 0.3, dur: 1.5, gain: 0.16, attack: 0.25, tau: 0.6, release: 0.4 });
    tone(o, { at: 0.34, f: 220, dur: 1.4, gain: 0.05, attack: 0.3, tau: 0.5, release: 0.4 });
    glass(o, rng, 0.42, 1318.5, 0.08, 0.9);
  });

const open: Recipe = (rng) =>
  R(2.6, 0.5, (o) => {
    const parts = [latchRelease(rng), lidDetent(rng), lidSettle(rng)];
    const at = [0, 0.38, 0.62];
    parts.forEach((p, k) => {
      const s = Math.floor(at[k]! * 44100);
      for (let i = 0; i < p.length && s + i < o.length; i++) o[s + i]! += p[i]!;
    });
    creak(o, rng, { at: 0.08, dur: 0.45, gain: 0.35, rate: [20, 70, 40], res: [[640, 0.004], [1300, 0.003]] });
  });

const close: Recipe = (rng) =>
  R(0.8, 0.55, (o) => {
    creak(o, rng, { at: 0, dur: 0.3, gain: 0.4, rate: [60, 40, 20], res: [[680, 0.004], [1400, 0.003]] });
    thump(o, 0.26, 72, 1, 0.07);
    click(o, rng, 0.33, 4800, 0.7, 0.006);
    brassRing(o, rng, 0.331, 2350, 0.35, 0.2);
  });

const scanOpen: Recipe = (rng) =>
  R(0.5, 0.4, (o) => {
    click(o, rng, 0, 3800, 0.6, 0.006);
    noise(o, rng, { at: 0.01, dur: 0.2, gain: 0.5, swell: true, filters: [{ type: "bp", f: 700, fEnd: 2600, q: 3 }] });
    click(o, rng, 0.2, 4400, 0.5, 0.006);
    glass(o, rng, 0.21, 1760, 0.12, 0.4);
  });

const scanClose: Recipe = (rng) =>
  R(0.45, 0.35, (o) => {
    noise(o, rng, { at: 0, dur: 0.18, gain: 0.5, swell: true, filters: [{ type: "bp", f: 2400, fEnd: 650, q: 3 }] });
    click(o, rng, 0.18, 3000, 0.7, 0.008);
  });

const scanLock: Recipe = (rng) =>
  R(0.15, 0.22, (o) => {
    click(o, rng, 0, 6200, 1, 0.004);
    glass(o, rng, 0.001, 2637, 0.1, 0.12);
  });

const scanLost: Recipe = (rng) =>
  R(0.25, 0.1, (o) => tone(o, { at: 0, f: 880 * jit(rng, 0.02), fEnd: 620, glide: 0.05, dur: 0.16, gain: 1, attack: 0.01, tau: 0.05 }));

const RARITY: Record<Rarity, { notes: number[]; pulse: number; shimmer: number; peak: number }> = {
  common: { notes: [62, 69], pulse: 62, shimmer: 0, peak: 0.55 },
  uncommon: { notes: [62, 66, 69], pulse: 58, shimmer: 6, peak: 0.6 },
  rare: { notes: [62, 66, 69, 74], pulse: 52, shimmer: 12, peak: 0.66 },
  mythic: { notes: [62, 66, 69, 73, 76, 81], pulse: 45, shimmer: 26, peak: 0.72 },
};

const scanHit = (rarity: Rarity): Recipe => (rng) => {
  const r = RARITY[rarity];
  const tail = rarity === "mythic" ? 2.6 : rarity === "rare" ? 2.1 : 1.7;
  return R(tail, r.peak, (o) => {
    // Materialisieren: aufsteigender Luftzug, dann Akkord
    noise(o, rng, { at: 0, dur: 0.26, gain: 0.35, swell: true, filters: [{ type: "bp", f: 500, fEnd: 5200, q: 1.6 }] });
    const t0 = 0.22;
    r.notes.forEach((n, i) => glass(o, rng, t0 + i * 0.028 + rng() * 0.006, midi(n + 12), 0.55 / Math.sqrt(i + 1), 1.1));
    tone(o, { at: t0, f: midi(r.pulse) * 1.6, fEnd: midi(r.pulse) / 2, glide: 0.08, dur: 0.6, gain: 0.9, attack: 0.004, tau: 0.16 });
    for (let i = 0; i < r.shimmer; i++) {
      const at = t0 + 0.12 + rng() * (tail - 1.0);
      glass(o, rng, at, midi(86 + Math.floor(rng() * 12)), 0.05 + rng() * 0.05, 0.25);
    }
  });
};

const scanAmbiguous: Recipe = (rng) =>
  R(1.2, 0.38, (o) => {
    glass(o, rng, 0, midi(76), 0.7, 0.6);
    glass(o, rng, 0.14, midi(79), 0.6, 0.7);
  });

const scanPick: Recipe = (rng) =>
  R(1.0, 0.42, (o) => {
    click(o, rng, 0, 3300, 0.8);
    thump(o, 0.001, 150, 0.4, 0.025);
    glass(o, rng, 0.004, midi(81), 0.45, 0.6);
  });

const scanHintLight: Recipe = (rng) =>
  R(1.5, 0.32, (o) => {
    glass(o, rng, 0, midi(74), 0.6, 0.9);
    glass(o, rng, 0.22, midi(69), 0.6, 1.0);
  });

const torchToggle: Recipe = (rng) =>
  R(0.25, 0.42, (o) => {
    click(o, rng, 0, 4200, 1, 0.006);
    brassRing(o, rng, 0.001, 3100, 0.2, 0.06);
    noise(o, rng, { at: 0.004, dur: 0.06, gain: 0.08, tau: 0.02, filters: [{ type: "hp", f: 7000 }] });
  });

const collect: Recipe = (rng) =>
  R(0.6, 0.62, (o) => {
    thump(o, 0, 120 * jit(rng, 0.05), 1, 0.05);
    noise(o, rng, { at: 0, dur: 0.12, gain: 0.7, attack: 0.001, tau: 0.025, filters: [{ type: "bp", f: 1600, q: 0.9 }] });
    noise(o, rng, { at: 0.001, dur: 0.05, gain: 0.5, attack: 0.0005, tau: 0.008, filters: [{ type: "bp", f: 420, q: 3 }] });
    paper(o, rng, 0.04, 0.12, 0.25, 2200);
  });

const setComplete: Recipe = (rng) =>
  R(3.2, 0.6, (o) => {
    choir(o, rng, { at: 0, dur: 2.6, gain: 1.4, notes: [midi(50), midi(57), midi(62), midi(66)], attack: 0.5, release: 1.2 });
    [62, 66, 69, 74, 78].forEach((n, i) => glass(o, rng, 0.45 + i * 0.09, midi(n + 12), 0.35, 1.2));
    tone(o, { at: 0.45, f: midi(38), dur: 1.6, gain: 0.5, attack: 0.02, tau: 0.6, release: 0.5 });
  });

const error: Recipe = (rng) =>
  R(0.4, 0.42, (o) => {
    for (const at of [0, 0.11]) {
      noise(o, rng, { at, dur: 0.08, gain: 1, attack: 0.001, tau: 0.018, filters: [{ type: "bp", f: 260 * jit(rng, 0.05), q: 2.5 }] });
      thump(o, at, 80, 0.6, 0.03);
    }
  });

export type SoundId = string;

const GEMS: GemColor[] = ["W", "U", "B", "R", "G", "M", "C"];
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "mythic"];

export const RECIPES: Record<SoundId, Recipe> = {
  press,
  back,
  toggle,
  swipe,
  "latch-release": latchRelease,
  "lid-detent": lidDetent,
  "lid-settle": lidSettle,
  open,
  close,
  "scan-open": scanOpen,
  "scan-close": scanClose,
  "scan-lock": scanLock,
  "scan-lost": scanLost,
  "scan-ambiguous": scanAmbiguous,
  "scan-pick": scanPick,
  "scan-hint-light": scanHintLight,
  "torch-toggle": torchToggle,
  collect,
  "set-complete": setComplete,
  error,
  ...Object.fromEntries(GEMS.map((g) => [`tab:${g}`, tab(g)])),
  ...Object.fromEntries(RARITIES.map((r) => [`scan-hit:${r}`, scanHit(r)])),
};
