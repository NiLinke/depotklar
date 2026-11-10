# Pflegeregeln für Depotklar

Das Handbuch unter /doku/ und die KI-Fassungen sind Teil des Produkts. Finanzdaten, Tresore, reale Belege, Geheimnisse und lokale Zugangsdaten dürfen niemals veröffentlicht werden.

Bei jeder Änderung von Funktionslogik, Bedienung, Berechnungen, Datenformat oder Betrieb:

1. `public-docs/AENDERUNGEN.md` um einen konkreten Eintrag ergänzen: Datum, Anlass, Verhalten, Auswirkung auf Bestände/Geld/Steuerwerte, Grenzen und Tests. Keine bloße Versionsnummer.
2. Betroffene Kapitel in `public-docs/` anpassen. Unbekannte Werte nicht durch Null ersetzen. Umgesetztes und Geplantes deutlich trennen; das Zielbild steht in `ZIELBILD.md`.
3. `npm run docs` ausführen. Die erzeugten Dateien in `dist/doku` sowie `dist/llms.txt` und `dist/llms-full.txt` mit versionieren und nicht von Hand bearbeiten.
4. `npm run docs:check` und `npm test` ausführen. Bei Änderungen an der Oberfläche im Browser prüfen – auch per Maus, nicht nur per Tastatur.
5. Rechenregeln stehen in `dist/core/rules.mjs` mit amtlicher Quelle. Kein neues Steuerjahr und kein Sonderfall ohne Prüfung anhand amtlicher Quellen; das Regelpaket dann versionieren.
6. Der Rechenkern (`dist/core`) bleibt frei von Oberfläche und darf den gespeicherten Zustand nie verändern. Neue Rechenwege bekommen feste Prüffälle mit nachgerechneten Sollwerten.

Die CI verlangt bei Produktänderungen – auch in `dist/core` und `dist/ui` – einen Eintrag im Änderungsverlauf. Der Generator veröffentlicht nur die ausdrücklich gelisteten Kapitel und die ausgelieferten Module, niemals beliebige Dateien.
