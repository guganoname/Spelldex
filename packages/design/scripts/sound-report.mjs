// Rendert alle Klänge in Node: Pegel, Länge, Renderzeit; optional WAVs nach out/
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
const b = await build({ entryPoints: ["src/feedback/recipes.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { RECIPES } = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
const { mulberry32 } = await import("data:text/javascript;base64," + Buffer.from((await build({ entryPoints: ["src/feedback/dsp.ts"], bundle: true, write: false, format: "esm" })).outputFiles[0].text).toString("base64"));
const wav = process.argv.includes("--wav");
if (wav) mkdirSync("out", { recursive: true });
let total = 0;
for (const [id, r] of Object.entries(RECIPES)) {
  const t = performance.now();
  const d = r(mulberry32(42));
  const ms = performance.now() - t; total += ms;
  let peak = 0, sum = 0, nan = false;
  for (const x of d) { if (!Number.isFinite(x)) nan = true; peak = Math.max(peak, Math.abs(x)); sum += x * x; }
  const rms = Math.sqrt(sum / d.length);
  console.log(id.padEnd(18), (d.length / 44100).toFixed(2) + "s", "peak", peak.toFixed(2), "rms", (20 * Math.log10(rms)).toFixed(1) + "dB", ms.toFixed(1) + "ms", nan ? "NaN!" : "");
  if (wav) {
    const buf = Buffer.alloc(44 + d.length * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + d.length * 2, 4); buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(44100, 24);
    buf.writeUInt32LE(88200, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(d.length * 2, 40);
    d.forEach((x, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
    writeFileSync(`out/${id.replace(":", "_")}.wav`, buf);
  }
}
console.log("gesamt", total.toFixed(0) + "ms (1 Variante je Klang)");
