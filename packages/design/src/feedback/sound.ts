/**
 * Kleine Web-Audio-Engine: rendert Rezepte beim ersten Gebrauch in AudioBuffer,
 * spielt sie mit < 20 ms Latenz und zufälliger Variante/Tonhöhe ab.
 */
import { mulberry32 } from "./dsp";
import { RECIPES } from "./recipes";

const VARIANTS = 4;
/** Häufige Klänge, die nach dem Entsperren im Leerlauf vorgerendert werden */
const PREWARM = ["press", "back", "toggle", "tab:W", "tab:U", "tab:B", "tab:R", "tab:G", "latch-release", "lid-detent", "lid-settle", "scan-lock", "collect", "scan-hit:common", "scan-hit:uncommon", "scan-hit:rare", "scan-hit:mythic", "set-complete"];

export type AudioSessionMode = "ambient" | "playback";

interface NavigatorWithAudioSession {
  audioSession?: { type: string };
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cache = new Map<string, AudioBuffer[]>();
  private raw = new Map<string, Float32Array>();
  private last = new Map<string, number>();
  private rnd = mulberry32(Date.now() & 0xffff);
  volume = 0.8;
  enabled = true;
  pitchJitter = 0.03;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Muss aus einem echten Tap heraus aufgerufen werden (iOS). */
  async unlock(mode?: AudioSessionMode): Promise<void> {
    if (typeof window === "undefined") return;
    if (mode) this.setSessionMode(mode);
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    // Stiller Puffer im selben Tap: entsperrt ältere iOS-Versionen zuverlässig
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = silent;
    src.connect(this.ctx.destination);
    src.start(0);
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
    this.prewarm();
  }

  /** 'ambient' respektiert den Stummschalter, 'playback' spielt immer. Nur Safari 17+. */
  setSessionMode(mode: AudioSessionMode): boolean {
    const nav = navigator as Navigator & NavigatorWithAudioSession;
    if (!nav.audioSession) return false;
    try {
      nav.audioSession.type = mode;
      return true;
    } catch {
      return false;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Rendert alle Varianten eines Klangs als rohe Samples (auch ohne AudioContext nutzbar). */
  render(id: string): Float32Array[] {
    const out: Float32Array[] = [];
    for (let i = 0; i < VARIANTS; i++) out.push(this.renderVariant(id, i));
    return out;
  }

  private renderVariant(id: string, i: number): Float32Array {
    const key = `${id}#${i}`;
    let r = this.raw.get(key);
    if (r) return r;
    const recipe = RECIPES[id];
    if (!recipe) throw new Error(`Unbekannter Klang: ${id}`);
    r = recipe(mulberry32(hash(id) + i * 7919));
    this.raw.set(key, r);
    return r;
  }

  private toBuffer(data: Float32Array): AudioBuffer {
    const buf = this.ctx!.createBuffer(1, data.length, 44100);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Erste Variante sofort, die übrigen im Leerlauf, damit nichts ruckelt. */
  private buffers(id: string): AudioBuffer[] | null {
    if (!this.ctx) return null;
    let b = this.cache.get(id);
    if (b) return b;
    if (!RECIPES[id]) return null;
    b = [this.toBuffer(this.renderVariant(id, 0))];
    this.cache.set(id, b);
    const list = b;
    for (let i = 1; i < VARIANTS; i++) this.queue.push(() => list.push(this.toBuffer(this.renderVariant(id, i))));
    this.pump();
    return b;
  }

  /** Klänge vorab im Leerlauf rendern, z. B. scan-hit:* beim Öffnen der Linse. */
  prewarm(ids: string[] = PREWARM): void {
    for (const id of ids) if (!this.cache.has(id)) this.queue.push(() => void this.buffers(id));
    this.pump();
  }

  private queue: (() => void)[] = [];
  private pumping = false;
  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    const idle: (cb: () => void) => void =
      typeof requestIdleCallback === "function" ? (cb) => requestIdleCallback(cb, { timeout: 400 }) : (cb) => setTimeout(cb, 16);
    const next = () => {
      const job = this.queue.shift();
      if (!job) {
        this.pumping = false;
        return;
      }
      job();
      idle(next);
    };
    idle(next);
  }

  play(id: string, gain = 1): void {
    if (!this.enabled || !this.ready) return;
    const variants = this.buffers(id);
    if (!variants?.length) return;
    // Zufällige Variante, nie zweimal dieselbe hintereinander
    let i = Math.floor(this.rnd() * variants.length);
    if (variants.length > 1 && i === this.last.get(id)) i = (i + 1) % variants.length;
    this.last.set(id, i);
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = variants[i]!;
    src.playbackRate.value = 1 + (this.rnd() * 2 - 1) * this.pitchJitter;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master!);
    src.start();
  }

}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
