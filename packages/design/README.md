# @spelldex/design

Designsystem für den Codex: Tokens, skeuomorphe Komponenten, Federn, synthetisierte UI-Klänge und Haptik.
Live-Demo zum Testen auf dem iPhone: https://claude.ai/artifact/1eWRgTX2Ke8tsF5mJGKmda

## Benutzen

```ts
import "@spelldex/design/tokens.css";
import "@spelldex/design/components/components.css";
import { feedback, unlockFeedback, hapticTarget, setFeedbackPrefs } from "@spelldex/design/feedback";
import { motion, color, material } from "@spelldex/design/tokens";

// 1. Beim ersten echten Tap (Siegel) Audio entsperren
<button ref={hapticTarget} onClick={() => { unlockFeedback(); feedback("latch-release"); }} />

// 2. Jede Interaktion läuft über feedback(), nie direkt über Sound/Haptik
feedback("tab", { gem: "U" });
feedback("scan-hit", { rarity: "mythic" });

// 3. Jedes echt angetippte Element bekommt ref={hapticTarget} (iPhone-Tick, sonst No-op)
```

Ohne `window` (SSR, Vitest/jsdom) sind alle Feedback-Funktionen No-ops.

## Inhalt

| Pfad | Was |
|---|---|
| `src/tokens/tokens.json` | Einzige Quelle (DTCG). Farben sRGB-Hex, Licht oben links. `npm run tokens` erzeugt `tokens.css` (`--sd-*`) und `tokens.ts`. |
| `src/tokens/tokens.ts` | `color`, `semantic`, `font`, `size`, `space`, `radius`, `shadow`, `motion` (Federn als `{type:'spring', stiffness, damping, mass}`), `material` + `gem` (PBR für 3D), `sound`. Dazu `springCss` (CSS-`linear()`-Näherung). |
| `src/components/components.css` | `.sd-bezel`, `.sd-screen`, `.sd-key`, `.sd-gem`, `.sd-toggle`, `.sd-parchment`, `.sd-list`, `.sd-seal`, `.sd-bracket`, `.sd-label`, `.sd-num`. Nur Aussehen; Verhalten von Radix/nativen Elementen. |
| `src/feedback/events.ts` | Vertrag: `FeedbackEvent`, `FeedbackOptions`, Tabelle `EVENTS` (Klang, Android-Muster, iPhone-Tap ja/nein, Entprellung). |
| `src/feedback/recipes.ts`, `dsp.ts` | 31 Klänge, rein im Code synthetisiert (Messing, Leder, Pergament, Kristallglas, Chor). Keine Audiodateien, keine Lizenzfragen. 4 Varianten pro Klang, ±3 % Tonhöhe. |
| `src/feedback/sound.ts` | Web-Audio-Engine: erste Variante sofort, Rest im Leerlauf; `audioSession` ambient/playback. |
| `src/feedback/haptics.ts` | `hapticTarget` (ios-haptics 3.2.0), `vibrate` (Android). Experimentell: Tick per Code für das Testlabor. |
| `src/motion/spring.ts` | Unterbrechbarer Federlöser, `springToCss`. |
| `demo/` | Werkstatt-Demo (`npm run demo` baut `demo/codex-werkstatt.html`). |
| `scripts/sound-report.mjs` | Rendert alle Klänge in Node, zeigt Pegel/Länge; `--wav` schreibt WAVs nach `out/`. |

## Regeln

- Material nur an Gehäuse und Bedienelementen, ruhige Flächen zum Lesen. Kontrast Text auf Obsidian ≥ 6,6:1.
- Drückbares hat drei Zustände: erhaben, gedrückt (2 px, Innenschatten), gesperrt (matt).
- Nur Federn, keine linearen Kurven. `spring.lid` schwer, `spring.key` schnell, `spring.card` gleitend.
- Typo: Cinzel (Gravur, Titel), Crimson Pro (Regeltext, Flavor, Lore), Inter mit `tabular-nums` (UI, Zahlen).
- Keine Information nur über Farbe, Klang oder Haptik. Haptik ist Verstärkung, nie Voraussetzung.
- `--sd-identity` färbt Bildschirme in die Farbidentität der Karte (`style="--sd-identity: var(--sd-mana-r)"`).

## 3D-Anbindung

`material.brass|bronze|leather|obsidian|parchment` = `{color (sRGB), metalness, roughness, clearcoat?}`, `gem.emissiveIntensity.rest|active`.
Animationsereignisse des Deckels: `feedback('latch-release')` beim Siegel-Tap, `'lid-detent'` bei 40 %, `'lid-settle'` am Endanschlag.

## Bekannte offene Punkte

- ios-haptics 3.2.0: README beschreibt Label-Weiterleitung, das ausgelieferte `dist` trägt aber den Kopf "v3.1.1" und legt den Schalter direkt über das Element. Welche Variante auf aktuellem iOS greift, misst das Haptik-Labor der Demo.
- Ob `navigator.audioSession.type = "ambient"` auf dem iPhone den Lautlos-Schalter respektiert, wird mit der Demo geprüft.
- Klänge sind ein synthetischer erster Wurf; echte Foley-Aufnahmen können später als Rezept-Ersatz eingehängt werden, ohne die API zu ändern.
