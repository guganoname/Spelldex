/* Codex-Werkstatt: Demo für Tokens, Komponenten, Bewegung, Klang und Haptik.
   Nutzt ausschließlich die Paket-Module, damit die Demo das echte Verhalten zeigt. */
import {
  EVENTS,
  FEEDBACK_EVENTS,
  capabilities,
  feedback,
  feedbackReady,
  hapticTarget,
  isIOS,
  onFeedback,
  setFeedbackPrefs,
  unlockFeedback,
  type FeedbackEvent,
  type FeedbackOptions,
  type GemColor,
  type Rarity,
} from "../src/feedback/index";
import { iosPatternProgrammatic, iosTickProgrammatic, vibrate } from "../src/feedback/haptics";
import { animateSpring, sampleSpring, type SpringHandle } from "../src/motion/spring";
import { color, motion } from "../src/tokens/tokens";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k: string) {
    try { return localStorage.getItem("sd-" + k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem("sd-" + k, v); } catch { /* privat */ }
  },
};

// iOS braucht einen Touch-Listener, damit :active greift
document.addEventListener("touchstart", () => {}, { passive: true });

// Audio bei jedem echten Tap entsperren, bis es läuft
const unlock = () => { if (!feedbackReady()) void unlockFeedback(); };
document.addEventListener("click", unlock, true);
document.addEventListener("touchend", unlock, true);

/* ---------------- Deckel ---------------- */
const device = $("#device");
const lid = $("#lid");
const DETENT = motion["lid-detent"];
let progress = 0;
let lidSpring: SpringHandle | null = null;
let isOpen = false;
let detentPlayed = false;

function renderLid(p: number) {
  progress = p;
  lid.style.transform = `rotateX(${p * 180}deg)`;
  device.style.setProperty("--p", String(Math.max(0, Math.min(1, p))));
  // Schatten des Deckels auf der Basis, solange er darüber liegt
  lid.style.zIndex = p > 0.5 ? "2" : "4";
}

function moveLid(to: 0 | 1, velocity = 0) {
  if (reduced) {
    renderLid(to);
    if (to === 1) onSettled();
    return;
  }
  lidSpring?.stop();
  lidSpring = animateSpring({
    spring: motion.spring.lid,
    from: progress,
    to,
    velocity,
    onUpdate(p) {
      renderLid(Math.max(-0.02, Math.min(1.03, p)));
      if (to === 1 && !detentPlayed && p >= DETENT) {
        detentPlayed = true;
        feedback("lid-detent");
      }
    },
    onRest(p) {
      if (p === 1) onSettled();
    },
  });
}

function onSettled() {
  if (isOpen) return;
  isOpen = true;
  device.dataset.open = "true";
  feedback("lid-settle");
  showGauge();
}

function openLid() {
  detentPlayed = false;
  moveLid(1);
}

function closeLid() {
  if (!isOpen && progress === 0) return;
  isOpen = false;
  device.dataset.open = "false";
  feedback("close");
  moveLid(0);
}

$("#seal").addEventListener("click", (e) => {
  e.stopPropagation();
  void unlockFeedback();
  feedback("latch-release");
  openLid();
});

// Deckel folgt dem Finger, rastet ab 40 % ein
{
  const front = $(".face--front");
  let startY = 0;
  let startP = 0;
  let lastY = 0;
  let lastT = 0;
  let vel = 0;
  let dragging = false;
  front.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("#seal")) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = performance.now();
    startP = progress;
    lidSpring?.stop();
    front.setPointerCapture(e.pointerId);
  });
  front.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const h = lid.offsetHeight;
    const p = Math.max(0, Math.min(1, startP + (startY - e.clientY) / (h * 1.5)));
    const now = performance.now();
    vel = (lastY - e.clientY) / (h * 1.5) / Math.max(0.001, (now - lastT) / 1000);
    lastY = e.clientY;
    lastT = now;
    if (!detentPlayed && p >= DETENT) {
      detentPlayed = true;
      feedback("lid-detent");
    }
    renderLid(p);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (progress === startP) return;
    void unlockFeedback();
    if (progress >= DETENT || vel > 1.5) moveLid(1, vel);
    else {
      detentPlayed = false;
      moveLid(0, vel);
    }
  };
  front.addEventListener("pointerup", end);
  front.addEventListener("pointercancel", end);
}

$("#close").addEventListener("click", closeLid);

/* ---------------- Tabs ---------------- */
const tabs = $$<HTMLButtonElement>(".sd-gem");
let current = 0;
const history: number[] = [];

function selectTab(i: number, push = true) {
  if (i === current) return;
  const dir = i > current ? 1 : -1;
  if (push) history.push(current);
  tabs.forEach((t, k) => {
    t.setAttribute("aria-selected", String(k === i));
    t.tabIndex = k === i ? 0 : -1;
    const panel = document.getElementById(t.getAttribute("aria-controls")!)!;
    panel.hidden = k !== i;
    if (k === i) {
      panel.style.setProperty("--from", `${dir * 14}px`);
      panel.style.animation = "none";
      void panel.offsetWidth;
      panel.style.animation = "";
    }
  });
  current = i;
  if (i === 0) showGauge();
}

tabs.forEach((t, i) => {
  t.tabIndex = i === 0 ? 0 : -1;
  t.addEventListener("click", () => {
    feedback("tab", { gem: t.dataset.gem as GemColor });
    selectTab(i);
  });
  t.addEventListener("keydown", (e) => {
    const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!k) return;
    const n = (current + k + tabs.length) % tabs.length;
    tabs[n]!.focus();
    tabs[n]!.click();
  });
});

$$(".dpad__b").forEach((b) =>
  b.addEventListener("click", () => {
    const d = b.dataset.d;
    if (d === "left" || d === "right") {
      const n = (current + (d === "right" ? 1 : -1) + tabs.length) % tabs.length;
      feedback("tab", { gem: tabs[n]!.dataset.gem as GemColor });
      selectTab(n);
    } else {
      feedback("press");
      $(".panels").scrollBy({ top: d === "down" ? 80 : -80, behavior: reduced ? "auto" : "smooth" });
    }
  }),
);

$("#back").addEventListener("click", () => {
  feedback("back");
  const prev = history.pop();
  if (prev !== undefined) selectTab(prev, false);
});

/* ---------------- Stärke-Anzeige ---------------- */
{
  const ticks = $("#ticks");
  let html = "";
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    const r1 = 41, r2 = i % 5 === 0 ? 34 : 37;
    html += `<line x1="${60 + r1 * Math.cos(a)}" y1="${62 - r1 * Math.sin(a)}" x2="${60 + r2 * Math.cos(a)}" y2="${62 - r2 * Math.sin(a)}"/>`;
  }
  ticks.innerHTML = html;
}
let gaugeSpring: SpringHandle | null = null;
function showGauge(value = 72) {
  const needle = $("#needle");
  const fill = $("#gaugeFill");
  const label = $("#gaugeVal");
  gaugeSpring?.stop();
  gaugeSpring = animateSpring({
    spring: motion.spring.card,
    from: 0,
    to: value,
    onUpdate(v) {
      needle.style.transform = `rotate(${-90 + (v / 100) * 180}deg)`;
      fill.style.strokeDasharray = `${Math.max(0, v)} 100`;
      label.textContent = String(Math.round(Math.max(0, v)));
    },
  });
}

/* ---------------- Sparkline (Beispieldaten) ---------------- */
{
  const svg = $("#spark") as unknown as SVGSVGElement;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts: number[] = [];
  let v = 4.4;
  for (let i = 0; i < 90; i++) {
    v += (r() - 0.48) * 0.18;
    v = Math.max(3.9, Math.min(5.4, v));
    pts.push(v);
  }
  pts[89] = 4.8;
  const min = 3.8, max = 5.5;
  const x = (i: number) => (i / 89) * 296 + 2;
  const y = (p: number) => 64 - ((p - min) / (max - min)) * 58;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  svg.innerHTML = `
    <defs><linearGradient id="sf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color.mana.U}" stop-opacity=".35"/><stop offset="1" stop-color="${color.mana.U}" stop-opacity="0"/></linearGradient></defs>
    <g stroke="rgba(232,201,131,.08)">${[16, 36, 56].map((gy) => `<line x1="0" x2="300" y1="${gy}" y2="${gy}"/>`).join("")}</g>
    <path d="${line} L298 70 L2 70 Z" fill="url(#sf)"/>
    <path d="${line}" fill="none" stroke="${color.mana.U}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(89)}" cy="${y(4.8)}" r="3.2" fill="${color["ink-gold"]}"/>`;
}

/* ---------------- Sammlung ---------------- */
function bindToggle(el: HTMLElement, onChange?: (on: boolean) => void) {
  el.addEventListener("click", () => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    feedback("toggle");
    onChange?.(on);
  });
}
bindToggle($("#own"));
bindToggle($("#foil"));
{
  let n = 1;
  const out = $("#count");
  $("#plus").addEventListener("click", () => { n = Math.min(99, n + 1); out.textContent = String(n); feedback("press"); });
  $("#minus").addEventListener("click", () => {
    if (n === 0) return feedback("error");
    n -= 1; out.textContent = String(n); feedback("press");
  });
}
$("#stamp").addEventListener("click", () => {
  const m = $("#stampmark");
  delete m.dataset.on;
  void m.offsetWidth;
  m.dataset.on = "";
  feedback("collect");
});
$("#complete").addEventListener("click", () => {
  const s = $("#seal2");
  delete s.dataset.locked;
  delete s.dataset.ceremony;
  void s.offsetWidth;
  s.dataset.ceremony = "";
  feedback("set-complete");
});

/* ---------------- Scan-Ablauf (simuliert) ---------------- */
let rarity: Rarity = "rare";
let scanning = false;
$("#scan").addEventListener("click", () => {
  if (scanning) return;
  if (!isOpen) {
    feedback("error");
    return;
  }
  scanning = true;
  const lens = $("#lens");
  const card = $("#mtgcard");
  const status = $("#lensStatus");
  const flash = $("#flash");
  feedback("scan-open");
  card.dataset.state = "hidden";
  delete lens.dataset.locked;
  lens.dataset.scanning = "";
  status.textContent = "Suche Kartenumriss …";
  const t = (ms: number, fn: () => void) => setTimeout(fn, reduced ? Math.min(ms, 300) : ms);
  t(450, () => {
    feedback("scan-lock");
    lens.dataset.locked = "";
    $$(".lens .sd-bracket").forEach((b) => b.style.setProperty("--inset-y", "12px"));
    status.textContent = "Karte erkannt, stabilisiere …";
  });
  t(900, () => {
    delete lens.dataset.scanning;
    feedback("scan-hit", { rarity });
    flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 520, easing: "ease-out" });
    card.dataset.state = "materialize";
    status.textContent = `Shivan Dragon · ${rarity}`;
    if (current === 0) showGauge();
  });
  t(1700, () => {
    $$(".lens .sd-bracket").forEach((b) => b.style.removeProperty("--inset-y"));
    delete lens.dataset.locked;
    scanning = false;
  });
});

/* ---------------- Werkbank: Klang ---------------- */
const LABELS: Record<FeedbackEvent, string> = {
  press: "Taste drücken",
  back: "Zurück",
  tab: "Edelstein-Tab",
  toggle: "Messing-Schalter",
  swipe: "Wischen, Pergament",
  "latch-release": "Siegel, Riegel",
  "lid-detent": "Deckel rastet",
  "lid-settle": "Deckel liegt, Summen",
  open: "Aufklappen komplett",
  close: "Zuklappen",
  "scan-open": "Linse öffnet",
  "scan-lock": "Rahmen rastet ein",
  "scan-lost": "Karte verloren",
  "scan-hit": "Scan-Treffer",
  "scan-ambiguous": "Mehrere Kandidaten",
  "scan-pick": "Kandidat gewählt",
  "scan-hint-light": "Hinweis Licht",
  "torch-toggle": "Taschenlampe",
  "scan-close": "Linse schließt",
  collect: "Stempel, gesehen",
  "set-complete": "Set komplett",
  error: "Fehler",
};
const GEMS: GemColor[] = ["W", "U", "B", "R", "G", "M", "C"];
let gemIdx = 0;
{
  const board = $("#board");
  for (const ev of FEEDBACK_EVENTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.ev = ev;
    const ios = EVENTS[ev].ios === "tap" ? "iPhone-Tick" : "ohne iPhone-Tick";
    b.innerHTML = `<b>${LABELS[ev]}</b><small>${ev} · ${ios}</small>`;
    b.addEventListener("click", () => {
      const opts: FeedbackOptions = {};
      if (ev === "tab") opts.gem = GEMS[gemIdx++ % GEMS.length];
      if (ev === "scan-hit") opts.rarity = rarity;
      feedback(ev, opts);
    });
    board.appendChild(b);
  }
}
onFeedback((ev) => {
  const b = document.querySelector<HTMLElement>(`#board [data-ev="${ev}"]`);
  if (!b) return;
  b.dataset.fired = "";
  setTimeout(() => delete b.dataset.fired, 400);
});

$$<HTMLButtonElement>("#rarity [role=radio]").forEach((b, _, all) =>
  b.addEventListener("click", () => {
    all.forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    rarity = b.dataset.r as Rarity;
    feedback("press");
  }),
);

/* Einstellungen */
const prefSound = $("#prefSound");
const prefHaptics = $("#prefHaptics");
const prefPlayback = $("#prefPlayback");
const prefPattern = $("#prefPattern");
const vol = $<HTMLInputElement>("#vol");
function loadPrefs() {
  const s = store.get("sound"), h = store.get("haptics"), p = store.get("playback"), v = store.get("volume");
  if (s) prefSound.setAttribute("aria-checked", s);
  if (h) prefHaptics.setAttribute("aria-checked", h);
  if (p) prefPlayback.setAttribute("aria-checked", p);
  const ip = store.get("iosPattern");
  if (ip) prefPattern.setAttribute("aria-checked", ip);
  if (v) vol.value = v;
  applyPrefs();
}
function applyPrefs() {
  setFeedbackPrefs({
    sound: prefSound.getAttribute("aria-checked") === "true",
    haptics: prefHaptics.getAttribute("aria-checked") === "true",
    audioSession: prefPlayback.getAttribute("aria-checked") === "true" ? "playback" : "ambient",
    volume: Number(vol.value),
    iosHaptics: prefPattern.getAttribute("aria-checked") === "true" ? "hybrid" : "tap",
  });
  store.set("iosPattern", prefPattern.getAttribute("aria-checked")!);
  store.set("sound", prefSound.getAttribute("aria-checked")!);
  store.set("haptics", prefHaptics.getAttribute("aria-checked")!);
  store.set("playback", prefPlayback.getAttribute("aria-checked")!);
  store.set("volume", vol.value);
}
bindToggle(prefSound, applyPrefs);
bindToggle(prefHaptics, applyPrefs);
bindToggle(prefPlayback, applyPrefs);
bindToggle(prefPattern, applyPrefs);
vol.addEventListener("input", applyPrefs);
vol.addEventListener("change", () => feedback("press"));
loadPrefs();

/* ---------------- Werkbank: Haptik-Labor ---------------- */
const ua = navigator.userAgent;
const env = {
  ios: isIOS,
  osUA: (ua.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/)?.[1] ?? "").replace(/_/g, "."),
  safari: ua.match(/Version\/([\d.]+)/)?.[1] ?? "",
  inAppWebView: isIOS && !/Safari\//.test(ua),
  standalone: matchMedia("(display-mode: standalone)").matches,
  iframe: window.top !== window,
  audioSession: capabilities().audioSession,
  vibrate: capabilities().vibrate,
  switchSupport: (() => {
    const i = document.createElement("input");
    i.type = "checkbox";
    i.setAttribute("switch", "");
    return "switch" in i;
  })(),
};
{
  const dl = $("#env");
  const rows: [string, string][] = [
    ["Gerät", env.ios ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : "Desktop/anderes"],
    ["Browser", env.safari ? `Safari ${env.safari}` : env.inAppWebView ? "App-WebView (nicht Safari)" : "anderer Browser"],
    ["iOS laut UA", env.osUA ? `${env.osUA} (ab iOS 26 eingefroren, Safari-Version zählt)` : "—"],
    ["Safari-Schalter", env.switchSupport ? "unterstützt" : "nicht unterstützt"],
    ["Eingebettet", env.iframe ? "ja, in Claude-Rahmen" : "nein"],
    ["Vibration API", env.vibrate ? "ja" : "nein"],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

interface Variant {
  id: string;
  name: string;
  desc: string;
  build: (row: HTMLElement) => void;
}
const VARIANTS: Variant[] = [
  {
    id: "A-lib",
    name: "A · ios-haptics 3.2.0",
    desc: "Die Bibliothek wie geplant: unsichtbarer Schalter liegt über der Taste.",
    build(row) {
      const b = key("Antippen");
      hapticTarget(b);
      b.addEventListener("click", () => feedback("press"));
      row.prepend(b);
    },
  },
  {
    id: "B-label",
    name: "B · Label-Weiterleitung",
    desc: "Wie im neuen README beschrieben: ein Label über der Taste reicht den Tap an einen versteckten Schalter weiter.",
    build(row) {
      const b = key("Antippen");
      const id = "sw-b";
      const sw = document.createElement("input");
      sw.type = "checkbox";
      sw.setAttribute("switch", "");
      sw.id = id;
      sw.tabIndex = -1;
      sw.setAttribute("aria-hidden", "true");
      Object.assign(sw.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0.01", pointerEvents: "none" });
      document.body.appendChild(sw);
      const l = document.createElement("label");
      l.htmlFor = id;
      l.setAttribute("aria-hidden", "true");
      Object.assign(l.style, { position: "absolute", inset: "0", cursor: "pointer" });
      b.appendChild(l);
      b.addEventListener("click", () => feedback("press"));
      row.prepend(b);
    },
  },
  {
    id: "C-prog",
    name: "C · Per Code im Tap",
    desc: "Normale Taste, der Code klickt im selben Moment ein verstecktes Schalter-Label.",
    build(row) {
      const b = key("Antippen");
      b.addEventListener("click", () => { iosTickProgrammatic(); feedback("press"); });
      row.prepend(b);
    },
  },
  {
    id: "D-pattern",
    name: "D · Muster aus 3 Ticks",
    desc: "Wie C, aber drei Ticks im Abstand von 90 ms. Spürst du einen, drei oder keinen?",
    build(row) {
      const b = key("Antippen");
      b.addEventListener("click", () => { iosPatternProgrammatic([0, 90, 180]); feedback("toggle"); });
      row.prepend(b);
    },
  },
  {
    id: "E-delay",
    name: "E · Verzögert 350 ms",
    desc: "Tick erst nach 350 ms, wie bei einem Scan-Treffer kurz nach dem Tap.",
    build(row) {
      const b = key("Antippen");
      b.addEventListener("click", () => { feedback("press"); setTimeout(iosTickProgrammatic, 350); });
      row.prepend(b);
    },
  },
  {
    id: "F-native",
    name: "F · Sichtbarer System-Schalter",
    desc: "Kontrolle: Safaris echter Schalter. Spürst du hier nichts, ist System-Haptik aus (Einstellungen › Töne & Haptik).",
    build(row) {
      const sw = document.createElement("input");
      sw.type = "checkbox";
      sw.setAttribute("switch", "");
      sw.className = "native-switch try";
      sw.setAttribute("aria-label", "System-Schalter");
      row.prepend(sw);
    },
  },
  {
    id: "G-vibrate",
    name: "G · Android-Vibration",
    desc: "navigator.vibrate mit dem Scan-Treffer-Muster. Auf dem iPhone ohne Wirkung.",
    build(row) {
      const b = key("Antippen");
      b.addEventListener("click", () => {
        const ok = vibrate([15, 40, 25]);
        b.dataset.result = String(ok);
        $("#saveState").textContent = ok ? "Vibration angefordert." : "Browser hat die Vibration abgelehnt oder kennt sie nicht.";
      });
      row.prepend(b);
    },
  },
];

function key(label: string) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sd-key try";
  b.textContent = label;
  return b;
}

type Db = {
  collection(p: string): {
    add(d: Record<string, unknown>): Promise<unknown>;
    orderBy(f: string, d?: "asc" | "desc"): { limit(n: number): { onSnapshot(next: (s: { docs: { id: string; data(): Record<string, unknown> | undefined }[] }) => void, err?: (e: unknown) => void): () => void } };
  };
};
let db: Db | null = null;
const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
claude?.use("db").then((d) => {
  db = d as Db | null;
  if (!db) return;
  db.collection("haptik-tests").orderBy("at", "desc").limit(40).onSnapshot(
    (snap) => renderResults(snap.docs.map((d) => d.data() ?? {})),
    () => undefined,
  );
});

function renderResults(rows: Record<string, unknown>[]) {
  const ul = $("#results");
  if (!rows.length) {
    ul.innerHTML = `<li class="muted">Noch keine Messung gespeichert.</li>`;
    return;
  }
  ul.innerHTML = rows
    .map((r) => {
      const when = new Date(String(r.at)).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const dev = r.ios ? `Safari ${r.safari || "?"}${r.inAppWebView ? " (App)" : ""}` : String(r.platform ?? "");
      return `<li><span>${String(r.variant).replace(/</g, "")} · ${dev.replace(/</g, "")}</span><span class="${r.felt ? "ok" : "no"}">${r.felt ? "gespürt" : "nichts"} · ${when}</span></li>`;
    })
    .join("");
}

{
  const ol = $("#variants");
  for (const v of VARIANTS) {
    const li = document.createElement("li");
    li.className = "variant";
    li.innerHTML = `<header><b>${v.name}</b></header><p>${v.desc}</p><div class="row"><button class="vote" data-v="yes" aria-pressed="false">Gespürt</button><button class="vote" data-v="no" aria-pressed="false">Nichts</button></div>`;
    const row = $(".row", li);
    v.build(row);
    $$<HTMLButtonElement>(".vote", li).forEach((btn, _, all) =>
      btn.addEventListener("click", async () => {
        all.forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
        const felt = btn.dataset.v === "yes";
        const state = $("#saveState");
        if (!db) {
          state.textContent = "Gespeichert nur hier: Ergebnis-Speicher ist in dieser Ansicht nicht verfügbar.";
          return;
        }
        state.textContent = "Speichere …";
        try {
          await db.collection("haptik-tests").add({
            variant: v.id,
            felt,
            at: new Date().toISOString(),
            ios: env.ios,
            osUA: env.osUA,
            safari: env.safari,
            inAppWebView: env.inAppWebView,
            standalone: env.standalone,
            iframe: env.iframe,
            switchSupport: env.switchSupport,
            platform: /Android/.test(ua) ? "Android" : env.ios ? "iOS" : "Desktop",
            ua: ua.slice(0, 300),
          });
          state.textContent = `${v.name}: ${felt ? "gespürt" : "nichts"} gespeichert. Danke!`;
        } catch {
          state.textContent = "Speichern hat nicht geklappt. Bitte später erneut tippen.";
        }
      }),
    );
    ol.appendChild(li);
  }
}

/* ---------------- Werkbank: Tokens ---------------- */
{
  const sw = $("#swatches");
  const names: [string, string][] = [
    ["brass", "Messing"], ["bronze", "Bronze"], ["leather", "Leder"], ["obsidian", "Obsidian"],
    ["parchment", "Pergament"], ["ink-gold", "Goldtinte"], ["ink-dim", "Tinte matt"],
  ];
  const c = color as Record<string, unknown>;
  const all: [string, string][] = [
    ...names.map(([k, n]) => [n, String(c[k])] as [string, string]),
    ...Object.entries(color.mana).map(([k, v]) => [`Mana ${k}`, v] as [string, string]),
  ];
  sw.innerHTML = all.map(([n, v]) => `<div class="sw"><span style="background:${v}"></span><b>${n}</b>${v}</div>`).join("");

  const sp = $("#springs");
  for (const [name, s] of Object.entries(motion.spring)) {
    const pts = sampleSpring(s, 60);
    const max = Math.max(...pts, 1.05);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * 140).toFixed(1)} ${(46 - (p / max) * 42).toFixed(1)}`).join(" ");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "spring";
    b.innerHTML = `<b>spring.${name}</b><small>Masse ${s.mass} · Steifigkeit ${s.stiffness} · Dämpfung ${s.damping}</small><svg viewBox="0 0 140 50" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="140" y1="${46 - 42 / max}" y2="${46 - 42 / max}" stroke="rgba(232,201,131,.2)" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="${color["brass-light"]}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><span class="dot"></span>`;
    const dot = $(".dot", b);
    let h: SpringHandle | null = null;
    let at = 0;
    b.addEventListener("click", () => {
      feedback("press");
      at = at ? 0 : 1;
      h?.stop();
      h = animateSpring({ spring: s, from: h?.value ?? (at ? 0 : 1), to: at, velocity: h?.velocity ?? 0, onUpdate: (x) => (dot.style.transform = `translateX(${x * (b.clientWidth - 34)}px)`) });
    });
    sp.appendChild(b);
  }
}

/* ---------------- Haptik an alle echten Tap-Ziele ---------------- */
for (const el of $$("#seal, .sd-key:not(.try), .sd-gem, .sd-toggle, .dpad__b, #board button, .seg button, .vote, .spring")) hapticTarget(el);

renderLid(0);
