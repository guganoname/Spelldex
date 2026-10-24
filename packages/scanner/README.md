# @spelldex/scanner

Erkennt Magic-Karten über die Kamera, offline und ohne KI-Modell zur Laufzeit.

## Ablauf pro Kamerabild (im Worker)

1. **Umriss finden** (OpenCV.js): Graustufen, Canny-Kanten, Otsu-Schwelle und eine lokale Schwelle (der dunkle Kartenrand ist dunkler als alles direkt daneben, auch wenn die Karte andere Gegenstände berührt), Vierecke mit Kartenformat 63:88, bewertet nach Fläche und Kantenunterstützung auf allen vier Seiten. Danach Subpixel-Verfeinerung: Geraden durch die stärksten Helligkeitssprünge, Schnittpunkte als Ecken.
2. **Hypothesen**: Erkennt der Detektor statt des Kartenrands den inneren Rahmen oder die Bildbox, werden die daraus folgenden Außenränder mitgeprüft; ohne Umriss der Führungsrahmen in der Bildmitte. Es gewinnt der beste Treffer, bei einem sicheren Treffer bricht die Suche früh ab.
3. **Entzerren** auf 488×680 Pixel, das Format der Scryfall-Bilder.
4. **Fingerabdruck** (`@spelldex/shared/scan`): 256-Bit-pHash über die Illustration, 64-Bit-pHash über die ganze Karte, beide nach Grauwelt-Weißabgleich. Beide Drehrichtungen (Karte steht auf dem Kopf).
5. **Suche**: Hamming-Abstand gegen alle Einträge von `scan-index.bin` (Brute Force).
6. **Entscheiden**: Treffer, wenn der Abstand unter der Schwelle liegt und deutlich vor der nächsten *anderen* Illustration. Reprints (gleiche Illustration) gehen an den nächstliegenden Druck, die übrigen stehen in `otherPrints`; optional liest Tesseract.js die Sammlernummer.
7. **Stabilisieren**: 3 gleiche Ergebnisse in Folge ergeben genau einen `hit`.

## Benutzen

```ts
import { startCameraScan } from '@spelldex/scanner/camera';
import { initialScanFeedback, scanFeedback } from '@spelldex/scanner';

const scan = await startCameraScan({ video, indexUrl, onResult: (r) => { /* ScanFrameResult */ } });
scan.setTorch(true); scan.reset(); scan.stop();
```

In der App: `apps/web/src/screens/ScanLens.tsx`. Manuelle Testseite für echte Handys: `demo/` (mit Vite bauen, `?index=<URL>`).

## Index bauen

`packages/data-build/src/scan-index` lädt für jede Kartenseite des Katalogs das Scryfall-Bild (`cards.scryfall.io/normal`), hasht es und verwirft es. Hashes aus dem vorigen Index werden übernommen; Fortschritt landet alle 5000 Bilder in `scan-index.partial.bin`. Bei 429/503 pausieren alle Downloads (Retry-After oder bis 60 s Backoff). Offline wird der Schritt übersprungen.

## Messung (synthetisch, 2026-10-24)

Keine echten Karten: Der Lauf nutzt generierte Karten mit gemeinsamem Rahmenlayout und einen Kamera-Simulator (Hintergründe mit Störobjekten, Drehung bis 30°, Perspektive, Lichtverlauf, Farbstich, Gamma, Spiegelung, Hüllen, Unschärfe, Bewegungsunschärfe, Rauschen, JPEG). Index: 3.455 Drucke plus Zufalls-Hashes auf 100.455 Einträge (7 MB). 1.000 Einzelbilder, davon 10 % Karten außerhalb des Index. `node --experimental-strip-types bench/run.ts --cards 3000 --photos 1000 --distractors 97000`

| | richtige Karte | davon anderer Druck angeboten | falsche Karte | verpasst |
|---|---|---|---|---|
| alle | 89,0 % | 8,2 % | 0,0 % | 10,9 % |
| leicht | 93,0 % | 8,4 % | 0,0 % | 7,0 % |
| mittel | 90,6 % | 7,9 % | 0,0 % | 9,4 % |
| schwer | 77,8 % | 8,2 % | 0,0 % | 21,7 % |
| in Hülle | 77,2 % | 7,9 % | 0,0 % | 22,8 % |

Unbekannte Karten: 99 % korrekt abgelehnt (1 Fehlalarm in 105 Einzelbildern; der 3-Bild-Filter senkt das weiter). Reprints, die sich nur in der Sammlernummer unterscheiden, landen beim falschen Druck in etwa der Hälfte der Fälle, der richtige steht dann in `otherPrints`; die OCR half bei den winzigen synthetischen Schriftzügen nicht.

Zeit pro Bild (Node, ein Kern eines Cloud-Servers): Median 120 ms, 95 % unter 404 ms; die Indexsuche über 100k Einträge 8 ms. Auf Handys ist mit dem 2- bis 4-fachen zu rechnen; die Bildpumpe wartet auf den Worker und drosselt sich selbst. Im echten Browser (Chromium, simulierte Kamera, kleiner Index) kam der Treffer nach 0,9 s bei 58 ms pro Bild.

Ein verpasstes Einzelbild ist im Betrieb meist harmlos, weil 8 Bilder pro Sekunde kommen. Die Schwellen in `DEFAULT_OPTIONS` sind inzwischen an echten Karten eingestellt (nächster Abschnitt).

## Messung mit echten Karten (2026-10-24)

Echte Scryfall-Bilder (Index M10, ISD, DSK: 950 Kartenseiten), fotografiert vom Kamera-Simulator oben, ohne OCR. Gemessen vom Mess-Thread mit `bench/real.ts`, 400 Fotos, Seed 11:

| | richtige Karte | anderer Druck angeboten | mehrdeutig, richtige dabei | falsche Karte | verpasst |
|---|---|---|---|---|---|
| vor der lokalen Schwelle | 80,3 % | 0,6 % | 0,9 % | 0,0 % | 18,2 % |

Von den Verpassern fand der Detektor bei gut der Hälfte keinen Umriss: Die Karte berührte Gegenstände ähnlicher Helligkeit, oder sie lag schwarzrandig auf dunklem Tisch und nicht in der Mitte. Die lokale Schwelle behebt das zum großen Teil (`bench/real-misses.ts` mit 100 echten Karten):

| | vorher | nachher |
|---|---|---|
| 64 frühere Verpasser: Umriss gefunden | 31 | 55 |
| 64 frühere Verpasser: jetzt erkannt | 2 | 33 |
| 300 neue Fotos: richtig / falsch | 75,3 % / 0,0 % | 81,3 % / 0,0 % |
| 300 neue Fotos: Zeit pro Bild (Median / 95 %) | 46 / 224 ms | 64 / 384 ms |

Die übrigen Verpasser haben meist einen passenden Umriss, aber Abstand 105–120 (Hülle, Spiegelung) und liegen damit knapp über `acceptDistance`. Das ist Sache der Schwellen (unten). `bench/detect-bench.ts` ist ein synthetischer Stresstest nur für die Umrisserkennung (berührende Gegenstände, dunkler Tisch, Karte außerhalb der Mitte).


`bench/real.ts` baut den Index genau wie der Daten-Build (MTGJSON-Setdateien → `catalog.db` → Scryfall-„normal“-Bilder → `hashSources`) und schickt echte Kartenbilder durch denselben Kamera-Simulator. Karten aus Sets außerhalb des Index, deren Illustration nicht im Index vorkommt, messen Fehlalarme. Downloads landen in `.data-cache/scan-bench`, Wiederholungen laufen offline. Mehrere Seeds parallel und danach `--from a/rows.json,b/rows.json` zum gemeinsamen Auswerten.

```
node --experimental-strip-types bench/real.ts --seed 1 --photos 450 --ocr 1 \
  --sets LEA,ICE,7ED,8ED,RAV,M10,ISD,ZEN,RTR,THS,KLD,DOM,ELD,KHM,MID,NEO,DMU,ONE,MOM,BLB,DSK,FDN,MH3,2XM,DMR,C21 \
  --unknown MIR,TMP,5DN,M19,IKO,LCI,OTJ,DFT,TDM,MKM,WOE
```

### Großer Lauf und Schwellen

Index: 26 Sets von Alpha bis Foundations (alte und neue Rahmen, Showcase, Borderless, Doppelseiten, Reprint-Sets), 10.921 Kartenseiten, 725 KB. 3 × 450 Einzelbilder (gleiche Seeds in beiden Spalten), davon 269 unbekannte Karten, OCR an, neue Schwellen. Vor und nach #18 (lokale Schwelle im Detektor).

| | erkannt vor #18 | erkannt mit #18 | davon anderer Druck | falsche Karte | verpasst |
|---|---|---|---|---|---|
| alle | 74,7 % | 84,6 % | 3,4 % | 0,0 % | 15,4 % |
| leicht | 79,9 % | 87,6 % | 2,8 % | 0,0 % | 12,4 % |
| mittel | 74,9 % | 85,1 % | 3,3 % | 0,0 % | 14,9 % |
| schwer | 63,2 % | 77,5 % | 4,9 % | 0,0 % | 22,5 % |
| in Hülle | 71,6 % | 81,2 % | 3,4 % | 0,0 % | 18,8 % |
| Illustration in mehreren Drucken | 74,5 % | 82,3 % | 9,1 % | 0,0 % | 17,7 % |

(„erkannt“ = richtiger Druck + anderer Druck angeboten + mehrdeutig mit richtiger Karte unter den Kandidaten; die drei rechten Spalten mit #18.) Unbekannte Karten: 269 von 269 abgelehnt, vor und nach #18. Zeit pro Bild mit #18: Median 288 ms, 95 % unter 781 ms (vor #18: 137 / 275 ms; Node, drei Läufe parallel auf vier Kernen, Index 10.9k, OCR an).

Abstände (von 320): richtige Karte Median 20, 95 % unter 86. Bester Treffer unbekannter Karten: mindestens 102 (mit #18: 104), Median 114; bei 950 Einträgen waren es 108 und 120. Mit jeder Verzehnfachung des Index rücken unbekannte Karten also um etwa 6 näher, beim vollen Index (~100k) liegen die ersten unter 100. Deshalb die neuen Schwellen:

- `acceptDistance` 100 → 96, `guideAcceptDistance` 80 → 76
- neu: oberhalb von `strictAbove` 90 muss der Abstand zur nächsten anderen Illustration mindestens `strictMargin` 24 statt 16 betragen, sonst wird es „mehrdeutig“ (die richtige Karte steht dann unter den Kandidaten)

Nachgerechnet mit um 6 bzw. 10 verschobenen Abständen der unbekannten Karten (Schätzung für 100k): alte Schwellen 0,7 % bzw. 1,1 % Fehlalarme pro Einzelbild, neue 0,0 %; mehrdeutig 0,4 % bzw. 5,6 % (alt 4,8 % bzw. 18,6 %). Kosten (vor #18 gemessen): 1,2 Punkte weniger Erkennung pro Einzelbild, falsche Karten 0,3 % → 0,1 %. Mit #18: Schätzung für 100k 0,0 % Fehlalarme bei Verschiebung 6 und 10, mehrdeutig 0,0 % bzw. 6,7 %. `report.json` enthält den ganzen Sweep über Schwelle und Abstand.

Vor #18 waren die Verpasser vor allem fehlende Umrisse (Karte berührt Gegenstände ähnlicher Helligkeit, schwarzer Rand auf dunklem Tisch); jetzt bleiben vor allem Abstände 100–120 durch Hülle und Spiegelung. Die Erkennung kostet mit #18 etwa doppelt so viel Zeit pro Bild. Simulierte Fotos sind keine echten Handyfotos: die absoluten Quoten sind eine Untergrenze für ruhig gehaltene Karten, die Abstände und Fehlalarme sind belastbarer.
