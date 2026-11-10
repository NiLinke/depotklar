# Depotklar

Wertpapierbestände einer Familie so führen, dass für jedes Depot und jedes Jahr zwei Blätter entstehen: die wirtschaftliche Betrachtung mit den Anschaffungswerten der Buchhaltung und die steuerliche Betrachtung mit der Basis, die ein Verkauf vom Erlös abzieht. Dazu die persönliche Jahresrechnung, die Werte für die eigene Steuererklärung (insbesondere den Freibetrag für bestandsgeschützte Alt-Anteile, den die Bank nicht anwendet) und die Schenkungsteuer mit Zehnjahreszusammenrechnung.

Version 4.22.3. Zielbild und Abgrenzung: [ZIELBILD.md](ZIELBILD.md). Handbuch: https://depotklar.niklaslinke.de/doku/ · für KI-Assistenten: https://depotklar.niklaslinke.de/llms.txt. Pflegeregeln: [AGENTS.md](AGENTS.md). Betrieb im eigenen Netz, auch ohne Internetzugang: [BETRIEB.md](BETRIEB.md). Öffentliche Instanz: [DOKPLOY.md](DOKPLOY.md). Komponenten Dritter: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

**Modellrechnung, keine Steuererklärung.** Unvollständige oder nicht unterstützte Fälle liefern keinen Steuerbetrag, sondern „offen“ mit Grund.

## Starten

Node.js 24 und ein aktueller Browser.

```powershell
npm ci --ignore-scripts
npm run build
npm start
```

Danach http://127.0.0.1:4173 (Startseite), http://127.0.0.1:4173/app/ (Anwendung) oder http://127.0.0.1:4173/app/?demo=1 (Demo mit erfundenen Daten).

Als Container (Grundimage mit fester Prüfsumme, Tests im Build, ohne Root-Rechte):

```sh
docker build -t depotklar .
docker run --rm -p 127.0.0.1:4173:3000 --read-only --cap-drop ALL --security-opt no-new-privileges depotklar
```

Für den Betrieb im eigenen Netz `compose.yaml` und [BETRIEB.md](BETRIEB.md). Tresore lassen sich nur über HTTPS oder unter localhost anlegen und öffnen.

## Aufbau

- `dist/core/` – Rechenkern ohne Oberfläche: Datenmodell und Prüfung (`model.mjs`), Fortschreibung der Lose (`ledger.mjs`), Vorabpauschale (`vap.mjs`), Verkauf je Regime (`sale.mjs`), Jahresrechnung (`year.mjs`), Bewegungsrechnung (`statement.mjs`), Schenkungsteuer (`gifttax.mjs`), Regeln mit Quellen (`rules.mjs`), Tresor (`vault.mjs`), Demodaten (`sample.mjs`).
- `dist/ui/` – Darstellung als reine Funktionen, in Node testbar.
- `dist/app.mjs`, `dist/app.html`, `dist/app.css` – Anwendung.
- `dist/index.html`, `dist/datenschutz.html`, `dist/impressum.html` – Startseite und Rechtliches.
- `public-docs/` – Handbuchkapitel; `scripts/docs.mjs` erzeugt daraus `dist/doku/` und `dist/llms*.txt`.
- `tests/` – `npm test`.

Kein Bundler, keine Laufzeitabhängigkeiten. Der Server liefert nur Dateien aus `dist/` mit strikter Sicherheitsrichtlinie (`connect-src 'none'`); Finanzdaten verlassen den Browser nicht.

## Version 3

Depotklar 4 ist ein Neuaufbau mit eigenem Datenformat. Tresore der Version 3 werden nicht gelesen und bleiben unverändert im Browser. Version 3 ist über den Git-Tag `v3.4.0` wiederherstellbar.
