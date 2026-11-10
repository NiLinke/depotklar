# Depotklar: Freigabe der Steuerberechnung

Prüfung vom 22.10.2026. Die Anwendung wird im Chat „Entwickle Wertpapier-Steuersoftware“ noch aufgebaut. Diese Datei dokumentiert die ergänzende Anforderung und eine vorläufige Prüfung; sie ist kein Nachweis einer bereits eingebauten Sperre.

## Verbindliche Anforderung

Unterstützte Fälle, Annahmen und Grenzen müssen vor der Berechnung und beim Ergebnis sichtbar sein. Nicht unterstützte oder unvollständige Fälle dürfen keinen scheinbar korrekten Steuerbetrag liefern.

## Vorläufiger Befund

Die am Prüfzeitpunkt vorhandene Funktion `taxReport` in `depotklar/dist/tax.mjs` gibt für das ungeprüfte Jahr 2099 den numerischen Steuerbetrag 0 aus. `assertState` und `taxReport` ignorieren zusätzlich eingefügte Angaben zu Fremdwährung (`currency: 'USD'`), ausländischem Wohnsitz (`residence: 'FR'`) und gemeinsamer Veranlagung (`assessment: 'joint'`). Das Ergebnis bleibt numerisch identisch zur Modellrechnung ohne diese Angaben. Solche Angaben sind im bisherigen Datenmodell nicht definiert: Gerade deshalb dürfen Importdaten dieser Art nicht stillschweigend als unterstützter Fall behandelt werden.

## Abnahmekriterien für die Umsetzung

1. **Expliziter Umfang:** Unterstützte Steuerjahre und Fallmerkmale sind als erlaubte Werte im Datenmodell hinterlegt. Wohnsitz/Steuerpflicht, Privatvermögen, Veranlagung, Währung, Instrumentklasse und vollständige Anschaffungshistorie werden geprüft. Fehlende Angaben bedeuten „ungeprüft“, nicht automatisch „unterstützt“.
2. **Drei Zustände:** `supported` für geprüfte Modelleingaben, `incomplete` für fehlende Angaben und `unsupported` für ausgeschlossene Sachverhalte. Die Bezeichnung des unterstützten Ergebnisses bleibt „Modellrechnung“.
3. **Berechnungssperre:** Für `incomplete` und `unsupported` sind alle steuerlichen Ergebnisfelder einschließlich Gesamtsumme `null`. Eine strukturierte Liste nennt Grund, betroffene Person, Jahr und gegebenenfalls Buchung sowie die erforderliche Korrektur. Auch technische Aufrufer erhalten keinen Steuerbetrag.
4. **Vollständige Weitergabe:** Übersicht, Personenvergleich, CSV und Druckansicht übernehmen den Status. Gesperrte Werte erscheinen als „Nicht berechnet“, niemals als 0 €. Gesamtsummen über Personen mit gesperrten Berichten sind ebenfalls gesperrt. Ein ggf. ausgewiesener Teilbetrag muss ausdrücklich den begrenzten Umfang nennen.
5. **Grenzfälle:** Nicht freigegebene Jahre, Fremdwährungen, unbekannte Instrumente/Buchungsarten, fehlende FIFO-Lose, Altbestände, Depotüberträge ohne vollständige Historie, Kapitalmaßnahmen, besondere Eigentumsverhältnisse und betriebliche Fälle sperren die jeweilige Auswertung. Quellensteuer, Fonds-Vorabpauschalen und fondsbezogene Anschaffungskorrekturen dürfen nur bei tatsächlich implementierter und geprüfter Behandlung in ein freigegebenes Ergebnis eingehen.
6. **Keine pauschale Bestätigung:** Ein Kontrollkästchen darf unbekannte oder unimplementierte Sachverhalte nicht in unterstützte Fälle umwandeln. Es kann nur ausdrücklich benannte, prüfbare Angaben bestätigen.
7. **Getrennte Größen:** Gebuchte Steuerabzüge bleiben tatsächliche Eingaben; Modellsteuern werden separat ausgewiesen. Keine automatische Darstellung einer Nachzahlung oder Erstattung aus einem unvollständigen Modell.
8. **Prüfnachweise:** Mindestens ein gültiger Referenzfall sowie fehlende Angaben, ausgeschlossener Fall, ungültiger Import, gesperrte Gesamtsumme und Export müssen getestet werden. Eine normale Nullsteuer bei vollständig unterstützten Eingaben bleibt von „nicht berechnet“ unterscheidbar.

## Quellen zur fachlichen Abgrenzung

- § 20 EStG: Gewinnermittlung, FIFO, Verlustverrechnung und Sparer-Pauschbetrag: https://www.gesetze-im-internet.de/estg/__20.html
- § 32d EStG, amtliche Fassung im BMF-Handbuch 2026: https://amtliche-handbuecher.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32d/paragraf-32d.html
- § 20 InvStG: Teilfreistellungen abhängig von der Fondsart und Anlegerkategorie: https://www.gesetze-im-internet.de/invstg_2018/__20.html
- § 4 SolzG: Zuschlagsatz und Abrundung von Centbruchteilen: https://www.gesetze-im-internet.de/solzg_1995/BJNR097500993.html

Die gesetzlichen Quellen begründen keine Freigabe aller dort geregelten Sachverhalte für die Anwendung. Maßgeblich sind der tatsächlich implementierte Umfang und seine Prüfung.
