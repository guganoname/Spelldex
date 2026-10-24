# Spelldex – Schnittstellen zwischen den Teams

Stand: 2026-10-24 · gepflegt vom Architektur-Thread. Änderungen an einem Vertrag bitte per Nachricht an Architektur, nicht stillschweigend.

## Repo und Besitz

Monorepo mit pnpm workspaces (Node 22, pnpm 10, TypeScript 5.9 strict, ESM). Pakete werden als TypeScript-Quelle konsumiert, ohne eigenen Build-Schritt (`exports` zeigt auf `src/*.ts`). Bis ein GitHub-Repo existiert, liegt der gemeinsame Stand unter `/mnt/project-files/spelldex/` (ohne node_modules).

| Pfad | Paket | Besitzer |
|---|---|---|
| `/` (Root-Config), `apps/web` | `@spelldex/web` | Architektur |
| `packages/shared` (außer `src/scan`, `src/rules`) | `@spelldex/shared` | Architektur |
| `packages/shared/src/rules` | Tagger, Stärke-Score, Spellbook-Parser | Daten/Lore |
| `packages/shared/src/scan` | pHash, Hamming, Codec für scan-index.bin | Scanner |
| `packages/data-build` (außer `src/scan-index`) | `@spelldex/data-build` | Architektur |
| `packages/data-build/src/scan-index` | Index-Build | Scanner |
| `packages/scanner` | `@spelldex/scanner` | Scanner |
| `packages/design` | `@spelldex/design` | Design/Sound/Haptik |
| `packages/device-3d` | `@spelldex/device-3d` | 3D |
| `packages/lore` | `@spelldex/lore` (Inhalte) | Daten/Lore |

Regel für den gemeinsamen Ordner: Jeder schreibt nur in seine eigenen Pfade. Niemand synchronisiert mit `--delete` über fremde Pfade. Platzhalter in fremden Pfaden (mit "PLACEHOLDER" markiert) dürfen vom Besitzer komplett ersetzt werden; die Signaturen darin sind der Vertrag.

## Versionen

React 19.3, Vite 8, Vitest 5, three 0.186, @react-three/fiber 9.8, drei 10.7, @react-spring/three 10.1, Motion 14, TanStack Router 1.170 / Query 5.104, Zustand 5, Comlink 4.4, @sqlite.org/sqlite-wasm 3.54.1-build1.

## Datenfluss

```
MTGJSON AllPrintings + AllPrices, Spellbook variants, packages/lore/content
   └─ packages/data-build (nächtlich in CI)
        ├─ catalog.<hash>.db.gzip  SQLite + FTS5, Schema: packages/shared/src/catalog/schema.ts
        ├─ prices/<xx>.json        90-Tage-Verlauf in Wochenpunkten je Druck, xx = erste 2 Hex der scryfallId
        ├─ lore.<hash>.json        LoreBundle (contracts/lore.ts)
        ├─ scan-index.bin    vom Scanner-Team (Format siehe unten)
        └─ manifest.json     DataManifest (contracts/manifest.ts), mit sha256 je Artefakt
App: Daten-Worker lädt manifest.json, prüft sha256, installiert catalog.db im OPFS (opfs-sahpool).
Artefakte tragen den Inhalts-Hash im Namen (unbegrenzt cachebar). Gzip-Dateien enden auf ".gzip",
nicht ".gz", weil Server bei ".gz" oft Content-Encoding setzen und der Browser dann vor der
Prüfsummen-Kontrolle entpackt.
Scryfall nur direkt vom Gerät: Bilder (cards.scryfall.io) und Tagespreise, 24 h gecacht.
```

Schlüssel: Druck = Scryfall-ID, Karte = Scryfall-Oracle-ID. Tags, Stärke und Kombo-Zuordnung liegen im Katalog (Spalten `oracle.tags`, `oracle.strength`, Tabellen `oracle_tag`, `combo`, `oracle_combo`), damit die Offline-Suche danach filtern kann. Preise sind Druck-bezogen und deshalb nach scryfallId geshardet.

## Verträge (Dateien in packages/shared/src/contracts)

- `card.ts`: CardSummary, CardDetail, Printing, SetInfo, ComboSummary, SearchQuery.
- `data.ts`: CatalogApi und CollectionApi des Daten-Workers (Comlink), Sammlung mit Ereignisprotokoll und JSON-Export.
- `manifest.ts`: DataManifest, PriceSeries.
- `lore.ts`: LoreEntry {id, kind, name{de,en}, summary{de,en?}, status draft|reviewed, facts nur mit Quelle, sources mit referenceOnly}. mtg.wiki ist CC BY-NC-SA 4.0: nur Links, keine Texte.
- `device.ts`: DeviceButton, ENTRY_TABS (Edelstein 0..4 = Übersicht, Markt, Kombos & Decks, Lore, Drucke), ScreenAreas.
- `scan.ts`: ScanWorkerApi, ScanFrameResult, ScanMatch.

## Design/Sound/Haptik (`@spelldex/design`)

`./tokens` (TS, inkl. `motion.spring.lid|key|card` als `{type:'spring', stiffness, damping, mass}`), `./tokens.css` (`--sd-*`), `./feedback` mit `feedback(event, opts?)`, `unlockFeedback()`, `setFeedbackPrefs()`, `hapticTarget` (Ref-Callback). FeedbackEvent ist dort definiert (eine Quelle). Ohne window/AudioContext ein No-op.

## 3D (`@spelldex/device-3d`)

`createCodex({tokens})` → `{group, setOpen(t), getScreenRects(camera, renderer) → ScreenAreas, setGemGlow(i, intensity), pressButton(name), pickButton(ndc, camera) → DeviceButton|null, dispose()}`. Die App besitzt Federn, Gesten und DOM-Platzierung (`apps/web/src/device/`). Bildschirme im Ruhezustand achsenparallel.

## Scanner (`@spelldex/scanner`)

Worker `./worker` per Comlink mit `ScanWorkerApi`, `./camera` für getUserMedia/Taschenlampe im Haupt-Thread. scan-index.bin: Magic `SPLX`, u16 Version, u32 N, dann N × 32 Byte (16 Byte Scryfall-UUID, 8 Byte Art-Hash, 8 Byte Voll-Hash), little endian. OpenCV.js/Tesseract lazy beim ersten Scan, nicht im Precache. Im Build: `packages/data-build/src/scan-index/index.ts` exportiert `buildScanIndex({catalogPath, outDir, previousIndexPath?}) → ArtifactFile|null`.

## Daten/Lore

`packages/shared/src/rules/index.ts`: `tagRules(rules) → (card) → string[]`, `makeStrengthScorer(cfg, maxEdhrecRank) → (input) → StrengthScore`, `parseSpellbookVariants(doc) → Map<oracleId, ComboRef[]>`. Configs in `rules/config/archetype-rules.json` und `score-weights.json`. Lore-Inhalte: `packages/lore/content/{planes,creature-types,characters,events}/<id>.json`, `set-planes.json`, optional `character-cards.json`. Der Daten-Build validiert streng.

## App: Andockpunkte

- Geräte-Hülle: `apps/web/src/device/types.ts` (DeviceShell). Hülle rendert zwei DOM-Flächen per `useSlotRef('top'|'bottom')`, Bildschirme rendern mit `<TopScreen>`/`<BottomScreen>` hinein. Tasten gehen per `emitButton()` raus, Bildschirme reagieren mit `useDeviceButton()`. 2D-Hülle: `Device2D.tsx`, 3D-Host: `Device3D.tsx`.
- Gerätezustand (offen, Farbakzent, aktiver Edelstein, Einstellungen): `apps/web/src/state/device.ts` (Zustand), gemeinsam für DOM und 3D-Szene.
- Daten nur über Hooks in `apps/web/src/data/hooks.ts`; Netzdaten (Scryfall, Lore, Preisverlauf) werden in IndexedDB persistiert.
- Scan-Ablauf: `apps/web/src/screens/ScanScreen.tsx` (Treffer -> gesehen -> feedback -> Eintrag). Die Kamera-Ansicht vom Scanner-Team kommt in den oberen Bildschirm.

## App-Routen

`/` Gerät (geschlossen/offen, Startbildschirm) · `/karte/$id?tab=overview|market|combos|lore|printings` · `/suche?q=…` · `/scan` · `/sammlung` · `/sammlung/set/$code` · `/einstellungen` · `/info` (Quellen, Fan Content Policy).

## Befehle

`pnpm install` · `pnpm data:fixture` (Katalog aus Fixtures nach apps/web/public/data) · `pnpm dev` · `pnpm check` (Typecheck + Tests) · `pnpm data:build --mtgjson AllPrintings.json.gz --prices AllPrices.json.gz --out dist/data`.
