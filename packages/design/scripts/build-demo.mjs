// Baut die Werkstatt-Demo als eine einzige HTML-Datei (für das Artifact).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = (p) => readFileSync(join(root, p), "utf8");
const js = await build({
  entryPoints: [join(root, "demo/demo.ts")],
  bundle: true, write: false, format: "iife", minify: true, target: ["safari16", "chrome110"],
  legalComments: "inline",
});
const html = r("demo/demo.html")
  .replace("/*__TOKENS__*/", () => r("src/tokens/tokens.css"))
  .replace("/*__COMPONENTS__*/", () => r("src/components/components.css"))
  .replace("/*__DEMO_CSS__*/", () => r("demo/demo.css"))
  .replace("/*__DEMO_JS__*/", () => js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
writeFileSync(join(root, "demo/codex-werkstatt.html"), html);
console.log("demo/codex-werkstatt.html", (html.length / 1024).toFixed(0) + " KB");
