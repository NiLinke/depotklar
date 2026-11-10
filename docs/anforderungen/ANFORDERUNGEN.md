# Kontobewegungen, Fremdwährungen und Ergebnisse

Status: Anforderungsentwurf vom 22.10.2026. Der Projektordner enthielt bei der Aufnahme keine Anwendung oder Buchungsdaten. Dieses Dokument beschreibt die gewünschte Funktion; eine Implementierung oder Berechnung ist damit noch nicht erfolgt.

## Ziel

Die Software soll sämtliche importierten Konto- und Depotbewegungen chronologisch und nach Konto, Währung, Bewegungsart und Zeitraum filterbar darstellen. Originalbeträge, historische Wechselkurse und die daraus ermittelten EUR-Werte müssen dauerhaft nachvollziehbar bleiben. Wertpapierergebnisse und gegebenenfalls gesondert zu behandelnde Ergebnisse aus Fremdwährungsguthaben sind getrennt auszuweisen, ohne denselben Ergebnisbestandteil doppelt zu erfassen.

## Bewegungen und Herkunft

- Ein- und Auszahlungen, Überträge, Wertpapierkäufe und -verkäufe, Ausschüttungen, Zinsen, Währungsumtausch, Gebühren, Steuern sowie Stornos und Korrekturen erfassen.
- Unbekannte Buchungstypen sichtbar als ungeklärt übernehmen; keine importierte Zeile stillschweigend auslassen.
- Jede Bewegung mit Konto/Depot, stabiler ID, Buchungsdatum, gegebenenfalls Valuta und Handelszeitpunkt samt Zeitzone, Beschreibung und Originalbeleg bzw. Importdatei und Zeilennummer verknüpfen.
- Importwiederholungen und mögliche Dubletten erkennen. Korrekturen mit Bezug auf den ursprünglichen Datensatz und Änderungshistorie speichern.
- Zusammengehörige Bewegungen verknüpfen, insbesondere beide Seiten eines Währungsumtauschs oder Übertrags und die Geldbuchung eines Wertpapiergeschäfts. Sie dürfen in der Ergebnisrechnung nicht doppelt gezählt werden.

## Beträge und historische Wechselkurse

- Vorzeichenbehafteten Originalbetrag und ISO-Währung je Geldkomponente speichern. Gebühren und Steuern gegebenenfalls in ihrer eigenen Währung erfassen; Brutto, Abzüge und Netto müssen abstimmbar sein.
- Verwendeten historischen Kurs mit Kursdatum, Quelle, Abruf- bzw. Erfassungszeitpunkt, Kursart und eindeutiger Notierungsrichtung speichern. Für eine normalisierte Notierung `EUR je Einheit Fremdwährung` gilt: `EUR-Wert = Originalbetrag × Kurs`.
- Originalnotierung und Originalwert aus dem Beleg erhalten. Belegte EUR-Abrechnungswerte und zusätzlich berechnete EUR-Werte getrennt speichern; Abweichungen und die Auswahl des maßgeblichen Werts begründen.
- Den fachlich maßgeblichen Bewertungszeitpunkt getrennt vom Buchungsdatum speichern. Für Wertpapieranschaffung und -veräußerung jeweils den zugehörigen Zeitpunkt und Kurs verwenden.
- Fehlende Kurse ausdrücklich kennzeichnen. Weder den aktuellen Kurs noch Null automatisch einsetzen. Ersatzkurstage, Schätzungen und manuelle Eingriffe müssen erkennbar und begründet sein.
- Für EUR-Beträge den Umrechnungsfaktor 1 verwenden. Geld und Kurse mit Dezimalarithmetik verarbeiten und die Rundungsregel dokumentieren.
- Änderungen an Kursen oder Bewertungsregeln als neue Berechnungsversion speichern; frühere Ergebnisse reproduzierbar halten.

## Getrennte Ergebnisermittlung

- Wertpapierergebnisse aus den jeweils in EUR bewerteten Veräußerungserlösen und zugeordneten Anschaffungskosten einschließlich der sachgerecht zugeordneten Kosten herleiten. Eine bloße Umrechnung des Gewinns in Originalwährung am Verkaufstag reicht nicht aus.
- Fremdwährungsguthaben mit eigenen Beständen und Anschaffungslosen führen. Mögliche Realisationsereignisse aus Umtausch, Zahlungen, Wertpapierkäufen und Überträgen separat prüfen; nicht nur explizite Währungsumtäusche betrachten.
- Je Ereignis zwischen analytischer Darstellung eines Wechselkurseffekts innerhalb des Wertpapierergebnisses und einem eigenständigen Ergebnis aus dem Fremdwährungsguthaben unterscheiden.
- Steuerliche Zuordnung abhängig von Veranlagungsjahr, Sachverhalt und Kontoeigenschaften führen, insbesondere Verzinsung, Kontonutzung und deren zeitlichen Änderungen. Keine pauschale Zuordnung aller Währungsergebnisse zu § 23 EStG.
- Zuordnung, Berechnungsregel, betroffene Lose und Belege pro Ergebnis dokumentieren. Nicht beurteilte Sachverhalte als prüfungsbedürftig ausweisen und aus endgültigen Steuersummen heraushalten; offene Beträge daneben anzeigen.
- Nicht realisierte Wertänderungen getrennt von realisierten Ergebnissen darstellen. Eine Jahresendbewertung ist allein noch keine steuerliche Realisation.

## Nachvollziehbarkeit und Abnahme

1. Kontosalden je Originalwährung lassen sich aus belegtem Anfangsbestand und sämtlichen Bewegungen bis zum Endbestand abstimmen. Fehlende Historie und fehlende Anschaffungsdaten sind sichtbar.
2. Jede angezeigte EUR-Zahl führt auf Originalbetrag, verwendeten historischen Kurs, Bewertungsdatum und Quelle zurück.
3. Für einen Kauf und Verkauf in Fremdwährung mit unterschiedlichen historischen Kursen lässt sich das Wertpapierergebnis anhand beider EUR-Werte nachrechnen.
4. Ein damit verbundener Abgang aus dem Fremdwährungsguthaben hat eine eigene, belegbare Loszuordnung. Ein bloß analytisch dargestellter Wechselkurseffekt wird nicht zusätzlich in Steuersummen addiert.
5. Teilverkäufe, Gebühren in abweichender Währung, Stornos, verbundene Überträge, wiederholte Importe und fehlende Kurse führen zu nachvollziehbaren Beständen oder einem klar ausgewiesenen Klärungsbedarf.
6. Ein Export enthält Bewegungen, Originalwerte, Kurse, EUR-Werte, Ergebniszuordnungen, Quellen und Berechnungsversion.

## Fachliche Quellen

Am 22.10.2026 für diesen Entwurf recherchiert. Vor einer produktiven steuerlichen Berechnung sind die für den jeweiligen Veranlagungszeitraum geltenden Regeln konkret festzulegen.

- [§ 20 Abs. 4 EStG](https://www.gesetze-im-internet.de/estg/__20.html): Für nicht in Euro getätigte Geschäfte sind Einnahmen und Anschaffungskosten zu ihren jeweiligen Zeitpunkten in EUR umzurechnen.
- [BMF, Einzelfragen zur Abgeltungsteuer, Rn. 131](https://amtliche-handbuecher.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-19/II/anhang-19-II.html): Die Behandlung von Fremdwährungsergebnissen hängt unter anderem von der Art des Guthabens ab; § 20 und § 23 sind zu unterscheiden.
- [§ 23 EStG](https://www.gesetze-im-internet.de/estg/__23.html): Regelungen zu privaten Veräußerungsgeschäften, gleichartigen Fremdwährungsbeträgen und dem Vorrang anderer Einkunftsarten.
