# Spelldex

Ein Pokédex für Magic: The Gathering als installierbare Web-App (PWA): Karte scannen, Eintrag lesen, Sammlung füllen. Offline-first, ohne KI zur Laufzeit, ohne eigenen Server.

Plan: [Architektur- und Umsetzungsplan](https://claude.ai/artifact/NZDsGFCWHJz75TH1qb5DW2) · Schnittstellen und Zuständigkeiten: [CONTRACTS.md](CONTRACTS.md)

## Loslegen

```sh
pnpm install
pnpm data:fixture   # kleiner Test-Katalog nach apps/web/public/data
pnpm dev            # http://localhost:5173 (im WLAN auch vom Handy erreichbar)
pnpm check          # Typecheck + Tests
```

Echter Daten-Build (braucht Netz zu mtgjson.com):

```sh
pnpm data:build --mtgjson AllPrintings.json.gz --prices AllPrices.json.gz --out dist/data
```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `apps/web` | Die App: React, Routing, Geräterahmen, Daten-Worker |
| `packages/shared` | Verträge (Typen), Katalog-Schema und -Abfragen, Sammlung, Scryfall-Client, Regeln, Scan-Hashes |
| `packages/data-build` | Nächtlicher Build: MTGJSON → catalog.db.gz, Preise, Lore, Scan-Index, manifest.json |
| `packages/design` | Tokens, Feedback-Schicht (Sound, Haptik), skeuomorphe Komponenten |
| `packages/device-3d` | Das 3D-Gerät „Codex“ (three.js) |
| `packages/scanner` | Scan-Worker und Kamera |
| `packages/lore` | Kuratierte Lore-Inhalte |

## Mitarbeiten

Jedes Team arbeitet auf einem eigenen Branch (`team/<name>/<thema>`) und öffnet einen Pull Request gegen `main`. CI (Typecheck, Tests, Fixture-Build, App-Build) muss grün sein. Änderungen an `packages/shared/src/contracts` oder an fremden Paketen bitte im PR beschreiben und mit dem besitzenden Team abstimmen.

## Rechtliches

Spelldex ist inoffizieller Fan-Content gemäß der Wizards of the Coast Fan Content Policy, nicht von Wizards genehmigt oder unterstützt. Teile der verwendeten Materialien sind Eigentum von Wizards of the Coast. © Wizards of the Coast LLC. Kartendaten: MTGJSON (MIT). Bilder und Tagespreise: Scryfall, direkt vom Gerät abgerufen.
