# Depotklar 4 – Zielbild

Stand 10.11.2026 (Depotklar 4.20). Grundlage für den Neuaufbau. Ersetzt die Fachkonzepte der Version 3; die ursprünglichen Anforderungen vom 22.10.2026 liegen unverändert unter `docs/anforderungen/`.

## Ziel in einem Satz

Mit möglichst wenig Eingaben Wertpapierbestände einer Familie so führen, dass für jedes Depot und jedes Jahr die wirtschaftliche und die steuerliche Betrachtung als Fortschreibung vorliegen, jeder Verkauf richtig besteuert wird und die Werte für die eigene Steuererklärung und den Abgleich mit Bank und Buchhaltung bereitstehen.

## Wie gearbeitet wird

- Die Finanzbuchhaltung führt die Geldkonten. Depotklar führt Wertpapiere und Steuer. Je Depot gibt es ein Sachkonto „wirtschaftliche Betrachtung“, das die Anschaffungswerte trägt.
- Je Depot und Jahr gibt es zwei Blätter: wirtschaftlich und steuerlich, jeweils Stand 01.01. → jeder Vorgang → Stand 31.12. mit Wert je Stück. Das ist die Hauptansicht und das Druckbild.
- Fonds aus der Zeit vor 2009 liegen in der Regel in einem eigenen Depot. Es sind wenige Wertpapiere, wenige Vorgänge im Jahr: Schenkungen an Kinder, gelegentliche Verkäufe, Ausschüttungen, Vorabpauschalen.
- Die Steuererklärung wird von Hand übermittelt. Gebraucht werden die Werte, die die Bank nicht liefert – vor allem der Freibetrag für bestandsgeschützte Alt-Anteile, den nur das Finanzamt anwendet.

## Grundsätze (aus den Anforderungen vom 22.10.2026, unverändert verbindlich)

1. Unbekannt ist nicht null. Fehlt eine Angabe, ist das Ergebnis „nicht ermittelt“ mit Grund – nie 0 €.
2. Drei Zustände je Ergebnis: ermittelt, unvollständig (Angabe fehlt), nicht unterstützt (Fall außerhalb des Modells). Summen über unvollständige Teile sind selbst unvollständig.
3. Lose behalten ihr ursprüngliches Erwerbsdatum, auch bei Übertrag und Schenkung. Steuerlich FIFO je Depot und Wertpapier; Teilabgänge nehmen Basis und Vorabpauschalen anteilig mit. Wirtschaftlich gilt seit 4.14 der gleitende Durchschnitt je Depot wie im Sachkonto.
4. Wirtschaftlicher Anschaffungswert, steuerliche Basis und Marktwert sind getrennte Größen.
5. Vorträge (Aktienverlust, sonstiger Verlust, Rest-Freibetrag Alt-Anteile) werden vorgeschlagen, aber erst nach Bestätigung fortgeführt.
6. Steuerregeln nur für geprüfte Jahre und Fälle; jede Regel mit amtlicher Quelle.

## Umfang

Umgesetzt seit dem Neuaufbau (Einzelheiten in `public-docs/AENDERUNGEN.md`):

- **Währungskonten** (seit 4.1): Fremdwährungsguthaben je Depot mit Losen in EUR, verzinst nach § 20 EStG, unverzinst nach § 23 EStG; EZB-Referenzkurse als Vorschlag, wenn die Abrechnung keinen EUR-Wert nennt (seit 4.2); Kontoblätter im eigenen Bereich „Konten“ (seit 4.6).
- **Jahresabschluss je Person** (seit 4.2) und **Änderungsprotokoll** (seit 4.1).
- **Depots ohne deutschen Steuerabzug** (seit 4.8): Steuer vollständig in der Jahresrechnung, Werte für die Anlagen KAP und KAP-INV; **Kirchensteuer bei Ein- und Austritt** gezwölftelt.
- **Mehrere Tresore und Tresordatei** (seit 4.8): wie in Version 3.4 wieder mehrere Tresore je Browser und Speichern in eine verschlüsselte Datei (Chrome, Edge).
- **Zinsen, ausländische Quellensteuer auf Aktiendividenden, Schenkung an mehrere** (seit 4.1); Quellensteuer auf Fondsausschüttungen (seit 4.8).
- **Vorabpauschale je Anteil laut Steuerinformation** (seit 4.13); **akkumulierte ausschüttungsgleiche Erträge** nur als Ausweis, nicht als Einkünfte des Verkaufsjahres (seit 4.13.2); **Werte für die Steuererklärung** nach Formular.
- **Wirtschaftliche Betrachtung im gleitenden Durchschnitt** je Depot wie im Sachkonto (seit 4.14); Lose im steuerlichen Blatt, ausblendbar.
- **Rechenweg des Steuerjahrs in Excel** mit Formeln je Person: Verkäufe Los für Los nach FIFO, Vorabpauschale, Jahresrechnung (seit 4.15).
- **Anleihen, Zertifikate, ETCs, sonstiger Ertrag, Aktientausch, Verschmelzung mit Satzwechsel (§ 22 InvStG), Zusammenveranlagung je Jahr** (seit 4.17).
- **Folgejahre** (seit 4.19): Dauerrecht läuft ohne Bestätigung weiter, nur der Basiszins wird je Jahr zentral eingetragen; geprüfte Werte eines Updates haben Vorrang. EZB- und BMF-Kurse aktualisieren sich über einen geplanten Lauf.

Bewusst nicht geführt:

- **Geldkonten in EUR und ihre Salden.** Jeder Vorgang trägt seinen EUR-Betrag laut Abrechnung. Die Finanzbuchhaltung führt die Geldkonten. Für Währungskonten gibt es seit 4.21 nur den Abgleich mit dem Kontostand laut Bank.
- **Bankimport mit Spaltenzuordnung, Belegdateien im Tresor, Buchungsvorlagen.** Bei wenigen Vorgängen im Jahr ist die Eingabe schneller als jede Zuordnung. Ein Belegverweis ist Freitext. Für viele Bewegungen auf Währungskonten gibt es seit 4.22 den Excel-Import mit fester Vorlage (keine Zuordnung, Vorschau, alles oder nichts, als Ganzes rücknehmbar).
- **Tresore der Version 3.** Datenformat 4 ist nicht kompatibel. Version 3 wird nicht mehr ausgeliefert.

Seit 4.22.1: Betrieb als Container im eigenen Netz, auch ohne Internetzugang (`BETRIEB.md`, `compose.yaml`, Betriebsart nur Anwendung), feste Lieferkette, Hinweis ohne sichere Verbindung.

Seit 4.21: Protokoll mit „Öffnen“ und „Rückgängig“; Währungskonten für viele Buchungen (Monatszeilen, zuklappbare Blätter, höchstens fünf Jahresspalten auf Seite und PDF), Umtausch zwischen Fremdwährungen, Kontostand laut Bank. Bankimport bleibt draußen, solange die Zahl der Bewegungen die Eingabe von Hand trägt.

Seit 4.18: Verkäufe mit Aufteilung für die Buchung und Steuern, Buchhaltung von Währungskonten zum Umsatzsteuer-Umrechnungskurs mit zentraler Pflege, Jahresauswahl ohne feste Grenze, Filter und PDF je Depot.

Beim Steuerberater, mit Vorarbeit aus Depotklar (geplant, noch nicht umgesetzt): Günstigerprüfung. Die Zusammenveranlagung rechnet Depotklar seit 4.17 selbst; die Aufteilung bei unterschiedlicher Kirchensteuer gehört zum Berater. Depotklar soll dafür je Person alle Werte der Anlagen KAP und KAP-INV liefern, auch wenn die Jahresrechnung selbst beim Berater endet.

Historie 2009–2017 (seit 4.4): Fonds ab 2009 einzeln mit Käufen und Verkäufen, Übergang zum 31.12.2017 mit den Werten der Bank; Fonds vor 2009 weiter als Bestand zum 01.01.2018. Thesaurierungen nach altem Recht (seit 4.10) erhöhen Anschaffungswert und steuerliche Basis bis Ende 2017 und machen den fiktiven Gewinn der Bank nachprüfbar.

Noch offen und mit dem Anwender abzustimmen: Kapitalmaßnahmen bei Aktien (Abspaltung, Aktientausch, Bezugsrechte, Einlagenrückgewähr), Wechsel der Fondsart und Fondsliquidation, Schenkungsteuer für Jahre vor 2026, weitere Verwandtschaftsverhältnisse. Außerhalb: Anleihen, Zertifikate, Betriebsvermögen.

## Datenmodell (Format 4)

- **Person**: Name; je Jahr Kirchensteuersatz, anderweitig genutzter Sparer-Pauschbetrag, bestätigte Vorträge zum 01.01.
- **Beziehung**: Schenker → Empfänger mit Art (Kind, Enkel, Ehegatte) für die Schenkungsteuer.
- **Depot**: Person, Bank, Bezeichnung, Sachkonto der Buchhaltung, ausländische Bank ohne deutschen Steuerabzug ja oder nein.
- **Wertpapier**: ISIN, Name, Art (Aktie, Aktienfonds, Mischfonds, Immobilienfonds, Auslands-Immobilienfonds, sonstiger Fonds).
- **Kurs**: Wertpapier, Datum, EUR je Stück. Bei Fonds je Jahr der erste (Anfang Januar) und der letzte Kurs (Dezember) für die Vorabpauschale; der letzte liefert auch den Marktwert.
- **Währungskonto**: Depot oder – ohne Depot (seit 4.9) – Person, Bank und ausländische Bank ja oder nein; Bezeichnung, Währung, Kontoart (verzinst / unverzinst).
- **Jahresabschluss**: je Person das letzte abgeschlossene Jahr.
- **Vorgang** – elf Arten (dazu Zinsen, Schenkung an mehrere und Währungskonto seit 4.1):
  - *Bestand übernehmen*: Stichtag, Stück, Anschaffungswert (gesamt oder je Stück), Erwerbsgruppe (vor 2009 / 2009–2017 / ab 2018); bei Erwerb vor 2018: Kurs 31.12.2017 je Stück, bei Fonds 2009–2017 der fiktive Gewinn 2017; akkumulierte ausschüttungsgleiche Erträge (nur Ausweis, keine Einkünfte des Verkaufsjahres); bereits angesetzte Vorabpauschalen bis zum Stichtag.
  - *Kauf*: Stück, Betrag EUR inklusive Nebenkosten – oder Kurs je Stück und Gebühren.
  - *Verkauf*: Stück, Erlös EUR nach Nebenkosten – oder Kurs je Stück und Gebühren; optional der Steuerabzug laut Abrechnung je Steuerart (Kapitalertragsteuer, SolZ, KiSt; seit 4.11), eine Erstattung negativ, und zur Kontrolle der Veräußerungsgewinn laut Abrechnung (seit 4.12).
  - *Übertrag*: Stück, Zieldepot, Art (Schenkung, Erbschaft, eigenes Depot); bei Schenkung der Kurs am Stichtag.
  - *Ausschüttung/Dividende*: Betrag EUR brutto; optional Quellensteuer und Steuerabzug je Steuerart.
  - *Thesaurierung (altes Recht)* (seit 4.10): Datum bis 31.12.2017, ausschüttungsgleiche Erträge der Position, optional Steuerabzug je Steuerart.
  - *Vorabpauschale laut Bank*: Jahr und Betrag der Position – überschreibt die Berechnung aus Kursen; optional Steuerabzug je Steuerart.
  - *Split*: Verhältnis.
  - *Fondsverschmelzung*: Zielwertpapier, Verhältnis, steuerneutral fortgeführt.
- **Vorabpauschale je Anteil** (seit 4.13): Wertpapier, Jahr, Betrag je Anteil laut Steuerinformation des Fonds – vor der Rechnung aus Kursen, nach dem Bankwert.
- **Bankbescheinigung**: Person, Bank, Jahr; einbehaltene KapESt, SolZ, KiSt, bescheinigte Verlusttöpfe.
- **Buchhaltungsabgleich**: Depot, Stichtag, Saldo des Sachkontos.
- **Vorerwerb**: Schenkung außerhalb von Depotklar (Datum, Wert) für die Zehnjahresfrist.

## Rechnung

- **Lose** aus den Vorgängen: Stück, wirtschaftlicher Anschaffungswert, steuerliche Basis, angesetzte Vorabpauschalen, Erwerbsdatum, Regime.
- **Regime**: Aktie vor 2009 (Gewinn steuerfrei), Fonds vor 2009 (bis 2017 steuerfrei, ab 2018 steuerpflichtig, persönlicher Freibetrag 100.000 €), Fonds 2009–2017 (fiktiver Gewinn 2017 ohne Teilfreistellung bei Verkauf, Zuwachs ab 2018 mit Teilfreistellung; ein Verlust ab 2018 ist ohne Teilfreistellung, soweit er nur aus dem Kurs 31.12.2017 über den historischen Anschaffungskosten folgt – BFH vom 25.11.2025, VIII R 22/23), regulär.
- **Vorabpauschale** je Los und Jahr nach § 18 InvStG aus dem ersten und letzten Kurs des Jahres, Ausschüttungen und Basiszins; Bankwert hat Vorrang, danach der Wert je Anteil laut Steuerinformation. Erhöht die steuerliche Basis, mindert den späteren Veräußerungsgewinn (§ 19 Abs. 1 S. 4 InvStG). Kein Freibetrag auf Vorabpauschalen.
- **Verkauf**: wirtschaftlicher Gewinn = Erlös − Anschaffungswert im gleitenden Durchschnitt je Depot; steuerlich je Regime, Teilfreistellung nach Fondsart, Alt-Anteile-Gewinn auf den Freibetrag.
- **Jahresrechnung je Person**: Aktienverlust nur gegen Aktiengewinne, sonstige Verluste gegen alles, Sparer-Pauschbetrag, § 32d Abs. 1 EStG mit Kirchensteuer, SolZ. Vergleich mit dem Bankeinbehalt → erwartete Erstattung oder Nachzahlung, je Steuerart, wenn der Steuerabzug überall einzeln erfasst ist (seit 4.11). Kontrolle je Abrechnung: Veräußerungsgewinn und Vorabpauschale laut Bank gegen die eigene Rechnung (seit 4.12).
- **Bewegungsrechnung** je Depot und Jahr in beiden Betrachtungen, Probe Anfang + Vorgänge = Ende.
- **Schenkungsteuer** nach § 14 ErbStG aus den erfassten Schenkungen und Vorerwerben im Zehnjahreszeitraum; „noch steuerfrei übertragbar“ je Empfänger.

Schenkung von Alt-Anteilen: Der Empfänger tritt in die Stellung des Schenkers ein (Erwerbsdatum, Bestandsschutz) und nutzt einen eigenen Freibetrag von 100.000 €. Rechtsauffassung nach BMF-Schreiben vom 21.05.2019, Rz. 56.98, wie in der Fachliteratur zitiert – vor Gestaltungen mit dem Berater bestätigen.

## Abnahme

1. Ein Jahresblatt 2026 mit erfundenen Beträgen (Prüffall tests/fixtures/sheet.mjs) wird in beiden Betrachtungen auf den Cent reproduziert.
2. Die vier Regime liefern bei einem Verkauf 2026 dieselben Ergebnisse wie die geprüfte Version 3.
3. Die Vorabpauschale für 2018–2026 einschließlich negativer Basiszinsen und Erwerb im Jahr entspricht der geprüften Formel.
4. Schenkungsteuer mit Härteausgleich, Zehnjahreszusammenrechnung und 50-%-Grenze entspricht der geprüften Version 3.
5. Kein Ergebnis mit fehlender Angabe wird als Zahl ausgewiesen.
6. Jahresblatt und Steuerseite lassen sich als PDF ausgeben und drucken.
