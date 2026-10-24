// Erzeugt src/tokens/tokens.css und src/tokens/tokens.ts aus tokens.json.
// Bewusst ohne Abhängigkeit; tokens.json ist DTCG, Style Dictionary kann es später direkt lesen.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "src/tokens/tokens.json"), "utf8"));

// Federn über dieselbe Implementierung wie zur Laufzeit
const bundled = await build({
  entryPoints: [join(root, "src/motion/spring.ts")],
  bundle: true, write: false, format: "esm", platform: "node",
});
const { springToCss } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));

const get = (path) => path.split(".").reduce((o, k) => o?.[k], src);
const resolve = (v) => {
  if (typeof v === "string" && /^\{.+\}$/.test(v)) {
    const ref = get(v.slice(1, -1));
    if (!ref) throw new Error("Unbekannte Referenz " + v);
    return resolve(ref.$value);
  }
  return v;
};
const isToken = (n) => n && typeof n === "object" && "$value" in n;

const css = [];
const flat = {};
function walk(node, path) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    const p = [...path, k];
    if (isToken(v)) flat[p.join(".")] = { value: resolve(v.$value), type: v.$type };
    else if (v && typeof v === "object") walk(v, p);
  }
}
walk(src, []);

const cssName = (p) =>
  "--sd-" +
  p
    .replace(/^semantic\./, "")
    .replace(/^color\.mana\.(\w)$/, (_, c) => "mana." + c.toLowerCase())
    .replace(/^color\./, "")
    .replace(/\./g, "-");
for (const [p, t] of Object.entries(flat)) {
  if (p.startsWith("material.") || p.startsWith("gem.") || p.startsWith("sound.")) continue;
  if (t.type === "spring") {
    const { easing, durationMs } = springToCss(t.value);
    const n = p.split(".").pop();
    css.push(`  --sd-spring-${n}: ${easing};`);
    css.push(`  --sd-spring-${n}-duration: ${durationMs}ms;`);
    continue;
  }
  let val = t.value;
  if (Array.isArray(val)) val = val.map((f) => (/\s/.test(f) && !f.includes("-apple") ? `"${f}"` : f)).join(", ");
  css.push(`  ${cssName(p)}: ${val};`);
}

const header = "/* Generiert von scripts/build-tokens.mjs aus tokens.json. Nicht von Hand ändern. */\n";
writeFileSync(join(root, "src/tokens/tokens.css"), header + ":root {\n" + css.join("\n") + "\n}\n");

// TS: verschachteltes Objekt mit aufgelösten Werten
function plain(node) {
  if (isToken(node)) return resolve(node.$value);
  const o = {};
  for (const [k, v] of Object.entries(node)) if (!k.startsWith("$")) o[k] = plain(v);
  return o;
}
const t = plain(src);
for (const [k, v] of Object.entries(t.motion.spring)) t.motion.spring[k] = { type: "spring", ...v };
const springCss = Object.fromEntries(Object.entries(t.motion.spring).map(([k, v]) => [k, springToCss(v)]));
const groups = Object.keys(t);
const ts = `${header.trim()}
${groups.map((g) => `export const ${g.replace(/-(\w)/g, (_, c) => c.toUpperCase())} = ${JSON.stringify(t[g], null, 2)} as const;`).join("\n\n")}

export const tokens = { ${groups.join(", ")} } as const;

/** Federn für Motion ({type:'spring'}) und @react-spring/three (tension = stiffness, friction = damping). */
export const spring = motion.spring;

/** CSS-Näherung jeder Feder für transition-timing-function. */
export const springCss = ${JSON.stringify(springCss, null, 2)} as const;

export type ManaColor = keyof typeof color.mana;
export type SpringName = keyof typeof spring;
`;
writeFileSync(join(root, "src/tokens/tokens.ts"), ts);
console.log(`tokens: ${css.length} CSS-Variablen, ${Object.keys(springCss).length} Federn`);
