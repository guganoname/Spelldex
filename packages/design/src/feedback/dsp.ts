/**
 * Winzige Offline-DSP: alle Spelldex-Sounds entstehen als Float32-Samples im Code.
 * Keine Audiodateien, keine Lizenzen, deterministisch per Seed (testbar in Node).
 */

export const SR = 44100;

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufall um 1 herum: jit(rng, 0.05) liefert 0.95..1.05 */
export const jit = (rng: Rng, amount: number) => 1 + (rng() * 2 - 1) * amount;

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function alloc(sec: number): Float32Array {
  return new Float32Array(Math.ceil(sec * SR));
}

type FilterType = "lp" | "hp" | "bp";

/** RBJ-Biquad, Frequenz pro Sample änderbar. */
export class Biquad {
  private b0 = 0; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: FilterType, f: number, private q = 0.707) {
    this.set(f);
  }
  set(f: number, q = this.q) {
    this.q = q;
    const w0 = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cs = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number, b1: number, b2: number;
    if (this.type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (this.type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export interface FilterSpec {
  type: FilterType;
  f: number;
  /** Zielfrequenz am Ende (exponentieller Sweep) */
  fEnd?: number;
  q?: number;
}

/** Gefiltertes Rauschen mit Attack/Decay-Hüllkurve. */
export function noise(
  out: Float32Array,
  rng: Rng,
  o: { at: number; dur: number; gain: number; attack?: number; tau?: number; filters?: FilterSpec[]; swell?: boolean },
) {
  const start = Math.floor(o.at * SR);
  const n = Math.min(Math.floor(o.dur * SR), out.length - start);
  const filters = (o.filters ?? []).map((f) => ({ spec: f, bq: new Biquad(f.type, f.f, f.q ?? 0.707) }));
  const attack = Math.max(1, Math.floor((o.attack ?? 0.001) * SR));
  const tau = o.tau ?? o.dur / 4;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) {
      const k = i / n;
      for (const f of filters) if (f.spec.fEnd) f.bq.set(f.spec.f * Math.pow(f.spec.fEnd / f.spec.f, k));
    }
    let x = rng() * 2 - 1;
    for (const f of filters) x = f.bq.process(x);
    let env: number;
    if (o.swell) env = Math.sin((Math.PI * i) / n) ** 2;
    else env = i < attack ? i / attack : Math.exp(-(t - attack / SR) / tau);
    const fade = n - i < 64 ? (n - i) / 64 : 1;
    out[start + i]! += x * env * fade * o.gain;
  }
}

/** Gedämpfte Sinus-Moden: Glas, Messing, Kristall. modes: [Frequenz, Amplitude, Abklingzeit s] */
export function modal(
  out: Float32Array,
  o: { at: number; modes: [number, number, number][]; gain: number; attack?: number; fEnvDrop?: number },
) {
  const start = Math.floor(o.at * SR);
  const attack = Math.max(1, Math.floor((o.attack ?? 0.0015) * SR));
  for (const [f, amp, tau] of o.modes) {
    if (f >= SR * 0.45) continue;
    const n = Math.min(Math.floor(tau * 5 * SR), out.length - start);
    // Sinus per Rekursion und Hüllkurve per Multiplikation: kein sin/exp pro Sample
    const w = (2 * Math.PI * f) / SR;
    const k = 2 * Math.cos(w);
    const decay = Math.exp(-1 / SR / tau);
    let y1 = 0;
    let y2 = -Math.sin(w);
    let env = 1;
    const g = amp * o.gain;
    for (let i = 0; i < n; i++) {
      const y = k * y1 - y2;
      y2 = y1;
      y1 = y;
      const a = i < attack ? i / attack : 1;
      const fade = n - i < 128 ? (n - i) / 128 : 1;
      out[start + i]! += y2 * env * a * fade * g;
      env *= decay;
    }
  }
}

/** Sinus mit Tonhöhen-Glide (exponentiell von f nach fEnd). */
export function tone(
  out: Float32Array,
  o: { at: number; f: number; fEnd?: number; glide?: number; dur: number; gain: number; attack?: number; tau?: number; release?: number },
) {
  const start = Math.floor(o.at * SR);
  const n = Math.min(Math.floor(o.dur * SR), out.length - start);
  const attack = Math.max(1, Math.floor((o.attack ?? 0.002) * SR));
  const rel = Math.floor((o.release ?? 0.02) * SR);
  const glide = o.glide ?? o.dur / 3;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = o.fEnd ? o.fEnd + (o.f - o.fEnd) * Math.exp(-t / glide) : o.f;
    ph += (2 * Math.PI * f) / SR;
    let env = i < attack ? i / attack : o.tau ? Math.exp(-(t - attack / SR) / o.tau) : 1;
    if (n - i < rel) env *= (n - i) / rel;
    out[start + i]! += Math.sin(ph) * env * o.gain;
  }
}

/**
 * Leder-Knarzen: Stick-Slip-Impulse mit wechselnder Rate, jeder Impuls regt
 * Resonanzen an. rate: [Start, Mitte, Ende] in Impulsen pro Sekunde.
 */
export function creak(
  out: Float32Array,
  rng: Rng,
  o: { at: number; dur: number; gain: number; rate: [number, number, number]; res: [number, number][] },
) {
  let t = 0;
  const grain = Math.floor(0.025 * SR);
  while (t < o.dur) {
    const k = t / o.dur;
    const rate = k < 0.5 ? o.rate[0] + (o.rate[1] - o.rate[0]) * k * 2 : o.rate[1] + (o.rate[2] - o.rate[1]) * (k - 0.5) * 2;
    const env = Math.sin(Math.PI * k) ** 0.7;
    const amp = env * (0.35 + 0.65 * rng());
    const start = Math.floor((o.at + t) * SR);
    for (const [f, tau] of o.res) {
      const ff = f * jit(rng, 0.08);
      const w = (2 * Math.PI * ff) / SR;
      const n = Math.min(grain, out.length - start);
      for (let i = 0; i < n; i++) out[start + i]! += Math.sin(w * i) * Math.exp(-i / SR / tau) * amp * o.gain;
    }
    t += (1 / rate) * jit(rng, 0.35);
  }
}

/** Bandbegrenzter Sägezahn (PolyBLEP) durch Formantfilter: Chor-Vokal "ah". */
export function choir(
  out: Float32Array,
  rng: Rng,
  o: { at: number; dur: number; gain: number; notes: number[]; attack: number; release: number },
) {
  const start = Math.floor(o.at * SR);
  const n = Math.min(Math.floor(o.dur * SR), out.length - start);
  const voices: { f: number; ph: number; vib: number }[] = [];
  for (const f of o.notes) for (const d of [-7, 0, 6]) voices.push({ f: f * Math.pow(2, (d + (rng() - 0.5) * 3) / 1200), ph: rng(), vib: rng() * 6 });
  const formants = [
    { bq: new Biquad("bp", 800, 6), g: 1 },
    { bq: new Biquad("bp", 1150, 7), g: 0.5 },
    { bq: new Biquad("bp", 2900, 9), g: 0.25 },
  ];
  const lp = new Biquad("lp", 4200, 0.7);
  const blep = (t: number, dt: number) => {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  };
  const a = Math.floor(o.attack * SR);
  const r = Math.floor(o.release * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = 0;
    for (const v of voices) {
      const f = v.f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t + v.vib));
      const dt = f / SR;
      v.ph += dt;
      if (v.ph >= 1) v.ph -= 1;
      x += 2 * v.ph - 1 - blep(v.ph, dt);
    }
    x /= voices.length;
    let y = 0;
    for (const fm of formants) y += fm.bq.process(x) * fm.g;
    y = lp.process(y);
    let env = i < a ? (i / a) ** 2 : 1;
    if (n - i < r) env *= ((n - i) / r) ** 2;
    out[start + i]! += y * env * o.gain;
  }
}

/** DC entfernen, weich begrenzen, auf Spitzenpegel normalisieren, Enden ausblenden. */
export function finish(buf: Float32Array, peak: number): Float32Array {
  const hp = new Biquad("hp", 28, 0.707);
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = hp.process(buf[i]!);
    max = Math.max(max, Math.abs(buf[i]!));
  }
  // Ende abschneiden, sobald es dauerhaft still ist (-66 dB)
  let end = buf.length;
  const floor = max * 0.0005;
  while (end > 1 && Math.abs(buf[end - 1]!) < floor) end--;
  end = Math.min(buf.length, end + 256);
  const out = buf.subarray(0, end);
  const scale = max > 0 ? 1 / max : 1;
  const drive = 1.4;
  const norm = Math.tanh(drive);
  for (let i = 0; i < out.length; i++) out[i] = (Math.tanh(out[i]! * scale * drive) / norm) * peak;
  const fade = Math.min(256, out.length);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i]! *= i / fade;
  return out;
}
