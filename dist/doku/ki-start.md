# Einstieg für andere KI-Assistenten

Diese Dokumentation erklärt Depotklar 4 anhand des ausgelieferten Programms. Sie enthält keine echten Personen-, Konto- oder Tresordaten. Eine KI kann daraus erklären, aber keine lokalen Bestände lesen.

## So verwendest du diese Dokumentation

1. Lies diese Seite, die Versions- und Regelübersicht und die Rechenlogik.
2. Kläre Person, Depot, Wertpapierart, Erwerbsgruppe (vor 2009, 2009 bis 2017, ab 2018), Datum und Datenlage. Frage nur nach fehlenden Tatsachen; keine Passwörter oder vollständigen Belege verlangen.
3. Ordne den Fall einer der Vorgangsarten zu: Bestand übernehmen, Übergang 2017/2018, Kauf, Verkauf, Übertrag (Schenkung, Erbschaft, eigenes Depot), Schenkung an mehrere, Ausschüttung, Zinsen, Währungskonto, Vorabpauschale laut Bank, Split, Fondsverschmelzung, Thesaurierung (altes Recht, bis 2017).
4. Beschreibe die Eingaben mit den Feldnamen der Oberfläche und die erwartete Wirkung in beiden Betrachtungen.
5. Trenne belegte Tatsachen, errechnete Werte und Annahmen. Ein Haken ersetzt keinen Nachweis.
6. Erkläre jede Sperre. Empfiehl keinen erfundenen Nullwert, kein künstliches Erwerbsdatum und keine Ausgleichsbuchung.

## Häufige Fälle und wo sie stehen

- Fonds vor 2009 (bestandsgeschützte Alt-Anteile): Bestand zum 01.01.2018, Zuwachs bis Ende 2017 steuerfrei, ab 2018 Freibetrag 100.000 € je Person – Rechenlogik, Abschnitte „Regime“ und „Verkauf“.
- Fonds 2009 bis 2017: einzeln mit Kauf und Verkauf oder als Bestand zum 01.01.2018; fiktive Veräußerung zum 31.12.2017, fiktiver Gewinn laut Bank beim Verkauf ohne Teilfreistellung, Teil ab 2018 mit Teilfreistellung – Rechenlogik, „Regime“, „Verkauf“ mit Rechenbeispiel; Eingabe unter „Übergang 2017/2018“ in den Ersten Schritten. Thesaurierende Fonds: ausschüttungsgleiche Erträge bis 2017 als „Thesaurierung (altes Recht)“; sie erhöhen Buchwert und Basis und machen den fiktiven Gewinn der Bank nachprüfbar.
- Verlust ab 2018 bei Fonds 2009 bis 2017 (BFH vom 25.11.2025) – Rechenlogik, „Verkauf“ und „Werte für die Steuererklärung“.
- Akkumulierte ausschüttungsgleiche Erträge ausländischer thesaurierender Fonds: keine Einkünfte des Verkaufsjahres, die Bank holt nur den Steuerabzug nach – Rechenlogik, „Regime“ und „Werte für die Steuererklärung“.
- Vorabpauschale mit erstem und letztem Kurs des Jahres oder je Anteil aus der Steuerinformation des Fonds (Kursseite, Feld „VAP/Anteil“) – Rechenlogik, „Vorabpauschale“.
- Welche Lose noch da sind und welche ein Verkauf verbraucht (steuerlich FIFO) – Jahresübersicht, „Lose zum 31.12.“ im steuerlichen Blatt, ausblendbar mit „Lose zeigen“; Rechenlogik, „Lose“. Wirtschaftlich gilt der gleitende Durchschnitt je Depot – Rechenlogik, „Zwei Betrachtungen“.
- Schenkungen und Zehnjahresfrist – Rechenlogik, „Schenkung an mehrere“ und „Schenkungsteuer“.
- Verkäufe für die Buchung: Aufteilung des Gewinns und KapESt, Soli, KiSt – Rechenlogik, „Verkauf“.
- Lose der Währungskonten als Matrix, Schenkung und Erbschaft von Währungsbeträgen, Umtausch zwischen zwei Fremdwährungen, Kontostand laut Bank, PDF und Excel unter „Konten“ – Rechenlogik, „Währungskonten“.
- Eine Änderung zurücknehmen oder vom Protokoll zum Vorgang springen – Rechenlogik, „Protokoll und Rücknahme“; Erste Schritte, „Protokoll“.
- Betrieb auf einem eigenen Server oder ohne Internetzugang: HTTPS nötig, Daten bleiben verschlüsselt beim Nutzer – Kapitel „Tresor, Sicherung und Datenschutz“, Abschnitt „Betrieb auf einem eigenen Server“.
- Viele Bewegungen auf Währungskonten per Excel-Vorlage übernehmen – Erste Schritte, „Viele Bewegungen per Excel“; Rechenlogik, „Währungskonten“.

- Umsatzsteuer-Umrechnungskurse für die Buchhaltung, zentrale Pflege unter „Kurse“; steuerlich gilt der Tageskurs – Rechenlogik, „Währungskonten“.

- Währungskonten (§ 20 oder § 23 EStG, EZB-Kurse), mit oder ohne Depot – Rechenlogik, „Währungskonten“.
- Depots bei ausländischen Banken ohne deutschen Steuerabzug: Kennzeichen am Depot, Steuer vollständig in der Jahresrechnung, Werte für Anlage KAP und KAP-INV – Rechenlogik, „Depots ohne deutschen Steuerabzug“ und „Werte für die Steuererklärung“.
- Kontrolle der Bank: Steuerabzug je Steuerart (Kapitalertragsteuer, Solidaritätszuschlag, Kirchensteuer) an jeder Abrechnung oder aus der Jahressteuerbescheinigung; Abgleich je Bank und je Steuerart gegen die Modellsteuer auf der Steuerseite. Je Abrechnung: Veräußerungsgewinn laut Verkaufsabrechnung und Vorabpauschale laut Bank gegen die eigene Rechnung, mit Abweichung im steuerlichen Blatt und auf der Steuerseite („Kontrolle je Abrechnung“); der fiktive Gewinn 2017 gegen den rechnerischen Wert – Rechenlogik, „Abgleich“, „Vorabpauschale“ und „Regime“.
- Ausländische Quellensteuer: anrechenbarer Teil laut Abrechnung, nach den meisten Doppelbesteuerungsabkommen höchstens 15 % – Erste Schritte, „Vorgänge im Jahr“; Rechenlogik, „Jahresrechnung je Person“.
- PDF und Excel: Zeitraum, Person und Wertpapier wie in der Übersicht; Excel mit dem Rechenweg des Steuerjahrs in Formeln (FIFO je Verkauf, Vorabpauschale, Jahresrechnung) – Erste Schritte, „Jahresblatt prüfen und drucken“; Rechenlogik, „Jahresrechnung je Person“.
- Anleihen, Zertifikate, ETCs, Stückzinsen – Erste Schritte, „Vorgänge im Jahr“; Rechenlogik, „Anleihen, Zertifikate und ETCs“.
- Fondsverschmelzung, auch mit anderem Teilfreistellungssatz (§ 22 InvStG), und Aktientausch – Rechenlogik, „Verschmelzung und Aktientausch“.
- Zusammenveranlagung, je Jahr wählbar – Erste Schritte, „Steuer“; Rechenlogik, „Jahresrechnung je Person“.
- Jahre ab 2027: Es gilt das hinterlegte Dauerrecht weiter; nur den Basiszins unter „Kurse“ eintragen – Erste Schritte, „Steuer“; Rechenlogik, „Grundsätze“.
- Kirchenaustritt oder -eintritt im Jahr: Monat in den Jahresdaten, Kirchensteuer gezwölftelt – Rechenlogik, „Jahresrechnung je Person“.
- Mehrere Tresore, Tresordatei auf OneDrive oder Netzlaufwerk – Kapitel „Tresor, Sicherung und Datenschutz“.

## Was Depotklar 4 nicht tut

Keine Geldkonten in Euro (Währungskonten in Fremdwährung schon, seit 4.1), kein Bankimport mit Spaltenzuordnung (Bewegungen auf Währungskonten lassen sich seit 4.22 über eine feste Excel-Vorlage übernehmen), keine ELSTER-Übermittlung, keine Günstigerprüfung, keine Abspaltung und Einlagenrückgewähr bei Aktien, keine Derivate als eigene Positionen, keine Anleihen und ETCs mit Kauf vor 2009, keine Quellensteuer auf Zinsen, keine Steuerrechnung für Jahre vor 2018. Quellensteuer auf Dividenden wird nur mit dem anrechenbaren Teil erfasst (meist höchstens 15 % nach DBA); den Quellenstaat kennt Depotklar nicht. Steuerbeträge sind Modellrechnungen für die eigene Erklärung, kein Bescheid.

## Antwortvorlage

Nenne die Vorgangsart, die benötigten Angaben, die Eingabe Feld für Feld, die Wirkung im wirtschaftlichen und im steuerlichen Blatt und den Kontrollschritt. Schließe mit fehlenden Nachweisen oder fachlichen Grenzen. Kennzeichne Rechenbeispiele als fiktiv.

## Maschinenlesbare Zugänge

- /llms.txt: Einstieg mit Links auf alle Kapitel.
- /llms-full.txt: alle Kapitel am Stück.
- /doku/manifest.json: Versionen und Prüfsummen der Module.
- /doku/quellcode.txt: der ausgelieferte Quellcode.
