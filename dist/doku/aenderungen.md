# Änderungen und Dokumentationsstand

## 2026-11-10 - Depotklar 4.22.3: Dokumentationsprüfung für den ersten Eintrag eines Repositorys

Anlass: Der GitHub-Lauf brach im ersten Eintrag eines neuen Repositorys ab, weil die Dokumentationsprüfung den Stand mit seinem Vorgänger vergleicht und es keinen gab. Tests, Build und Container wurden dann gar nicht erst geprüft.

Verhalten:
- Die Prüfung vergleicht mit der Basis des Pull Requests oder dem Stand vor dem Push. Ist dieser Stand im Klon nicht vorhanden, etwa bei einem neuen oder überschriebenen Zweig, gilt der Vorgänger. Ohne Vorgänger gilt der leere Stand: Alle Dateien zählen als neu, ein Eintrag im Änderungsverlauf muss also dabei sein.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine. Anwendung, Rechnung, Datenformat und Tresore sind unverändert.

Grenzen: Ist der Stand vor dem Push unbekannt, prüft der Lauf nur den letzten Eintrag gegen seinen Vorgänger.

Tests: Feste Prüfungen für die Wahl des Vergleichsstands (Pull Request, Push, neuer Zweig, unbekannter Stand, erster Eintrag). Nachgestellt an echten Repositorys: Ein erster Eintrag mit Änderungsverlauf geht durch, einer ohne wird abgewiesen, ebenso ein Folgeeintrag ohne.

## 2026-11-10 - Depotklar 4.22.2: Freigegebene Stände ohne Vorgeschichte

Anlass: Freigegebene Versionen sollen sich als in sich geschlossener Stand weitergeben lassen, ohne Bezug auf reale Bestände und ohne automatische Änderungen nach der Freigabe.

Verhalten:
- Prüffall: Das Jahresblatt in den Tests (`tests/fixtures/sheet.mjs`) rechnet mit erfundenen Beträgen: 24.000 Anteile eines Alt-Fonds, Vorabpauschale 2025 laut Bank, drei Schenkungen.
- Kurse: Die automatische Kursaktualisierung läuft nur im Entwicklungs-Repository. Kopien und freigegebene Stände ändern sich dadurch nicht von selbst.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine. Anwendung, Rechnung, Datenformat und Tresore sind unverändert.

Grenzen: Wer ohne Internetzugang betreibt, bekommt neue EZB- und Umsatzsteuer-Umrechnungskurse weiter nur mit einem neuen Image.

Tests: Sollwerte des Prüffalls von Hand nachgerechnet. Wirtschaftlich geht jeder Abgang auf den Cent gerundet ab: 1.812.345,67 − 90.617,28 − 2 × 67.962,96 = 1.585.802,47; ungerundet wären es ,46. Steuerlich rechnet das Los genau weiter, gerundet wird nur die Anzeige: 3.120.222,21 × 21.000 / 24.000 = 2.730.194,43.

## 2026-11-10 - Depotklar 4.22.1: Betrieb im eigenen Netz, feste Lieferkette

Anlass: Depotklar soll sich als Container auch in einem eigenen Netz ohne Internetzugang betreiben lassen, mit nachvollziehbarer Lieferkette, sicheren Voreinstellungen und klaren Hinweisen für den Betrieb.

Verhalten:
- Sichere Verbindung: Ohne sicheren Kontext (HTTPS oder localhost) stellen Browser keine Verschlüsselung bereit. Der Startbildschirm zeigt dann „Sichere Verbindung nötig“ mit Erklärung statt der Formulare zum Anlegen und Öffnen; die Demo bleibt erreichbar. Bisher kam beim Anlegen nur eine technische Fehlermeldung.
- Betriebsart: Mit `DEPOTKLAR_SITE=app` liefert der Server nur Anwendung und Handbuch. `/` führt zur Anwendung, Startseite, Impressum und Datenschutz der öffentlichen Instanz entfallen, `robots.txt` sperrt Suchmaschinen. Ohne Angabe bleibt alles wie bisher (`full`); ein anderer Wert verhindert den Start.
- Server: zusätzlich `Cross-Origin-Opener-Policy` und `Cross-Origin-Resource-Policy: same-origin`; `Permissions-Policy` sperrt auch Zahlungen, USB, serielle Schnittstellen und Bluetooth.
- Lieferkette: Das Grundimage steht mit Version und Prüfsumme im Dockerfile (Node.js 24.22.2, Alpine 3.24), die GitHub-Aktionen sind auf Commits festgelegt. Der GitHub-Lauf startet den Container zusätzlich in der Betriebsart `app`.
- Excel-Import: Dateien über 5 MB werden vor dem Entpacken abgewiesen.
- Dokumentation: `BETRIEB.md` (Bau, Übertragung ohne Internet, Start mit Sicherheitseinstellungen, HTTPS, Datensicherung, Aktualisierung, Kurse ohne Internet), Vorlage `compose.yaml`, `THIRD_PARTY_NOTICES.md` mit Lizenzen und Datenquellen; im Kapitel „Tresor, Sicherung und Datenschutz“ der Abschnitt „Betrieb auf einem eigenen Server“. Versionsangaben in `package.json`, Lockfile und README angeglichen; Notiz am Buchhaltungssaldo der Demo vereinheitlicht.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine. Rechnung, Datenformat und Tresore sind unverändert.

Grenzen: HTTPS und das Zertifikat stellt ein vorgeschalteter Reverse Proxy; Depotklar selbst spricht im Container nur HTTP. Ohne Internetzugang sind EZB- und Umsatzsteuer-Umrechnungskurse auf dem Stand des Images. Speichern in eine Tresordatei geht weiter nur in Chrome und Edge.

Tests: Neue Datei mit festen Prüfungen: Versionen in Anwendung, `package.json`, Lockfile und README gleich, Grundimage mit Prüfsumme in beiden Stufen, alle GitHub-Aktionen auf Commits, Compose-Vorlage schreibgeschützt ohne Rechte, Hinweis ohne sicheren Kontext. Servertest für die zusätzlichen Kopfzeilen und die Betriebsart `app` (Weiterleitung, 404 für Startseite und Impressum, `robots.txt`).
## 2026-11-10 - Depotklar 4.22.0: Excel-Import für Währungskonten

Anlass: Bei vielen Ein- und Ausgängen ist das Erfassen einzeln der eigentliche Aufwand. Vor einem Bankimport sollen sich alle Bewegungen über eine Excel-Datei übernehmen lassen: Datum, Art, Betrag und so weiter eintragen, Depotklar nimmt sie in die Liste auf.

Verhalten:
- Vorlage: Unter „Konten“ liefert „Excel-Vorlage“ eine Datei mit dem Blatt „Bewegungen“ und den Spalten Datum, Konto, Art, Betrag, EUR-Betrag, Devisenkurs, Zielkonto, Betrag Zielkonto, Zinsen brutto EUR, KapESt, Soli, KiSt und Notiz. Konto, Art und Zielkonto werden in Excel aus einer Liste gewählt; das Blatt „Hinweise“ erklärt jede Spalte und jede Art.
- Einlesen: „Excel importieren“ liest die ausgefüllte Datei nur im Browser. Spalten werden an der Überschrift erkannt, auch in anderer Reihenfolge. Datum als Excel-Datum, TT.MM.JJJJ oder JJJJ-MM-TT; Beträge als Zahl oder deutsch geschrieben; Formeln zählen mit ihrem Ergebnis; leere Zeilen fallen weg. Ohne Art gilt ein negativer Betrag als Zahlung, ein positiver als Gutschrift; „Zahlung“, „Gebühr“, „Überweisung“ und „Gutschrift“ werden auch kurz verstanden. Bei Zinsen ergibt sich ohne Kurs, aber mit EUR-Betrag der Kurs aus beidem.
- Prüfung: Jede Zeile wird wie im Formular zum Vorgang, mit denselben Prüfungen und ohne EUR-Betrag und Kurs mit dem EZB-Referenzkurs des Tages. Die Vorschau zeigt jede Zeile mit Datum, Konto, Art, Betrag und EUR-Wert, Fehler mit Zeilennummer wie in Excel (etwa unbekanntes oder mehrdeutiges Konto, unbekannte Art, ungültiges Datum, abgeschlossenes Jahr) und den Bestand je Konto vorher und nachher. Ein Abgang über den Bestand fällt vor der Übernahme auf.
- Übernahme: erst nach Bestätigung und nur, wenn keine Zeile einen Fehler hat; dann alle Zeilen zusammen. Schon erfasste Bewegungen (gleicher Tag, gleiches Konto, gleiche Art, gleicher Betrag) werden übersprungen, dieselbe Datei lässt sich also erneut einlesen.
- Protokoll: Jeder übernommene Vorgang steht einzeln im Protokoll, die Seite zeigt den Import als eine Zeile mit aufklappbarer Liste. „Rückgängig“ nimmt den ganzen Import zurück und stellt ihn bei Bedarf wieder her; im abgeschlossenen Jahr gesperrt.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine auf erfasste Vorgänge. Importierte Vorgänge sind gewöhnliche Vorgänge; ihre Protokolleinträge tragen eine Import-Kennung (`importId`). Datenformat 4 bleibt.

Grenzen: Nur Bewegungen auf Währungskonten und Zinsen; Wertpapiervorgänge und „Bestand übernommen“ weiter über das Formular. Nur .xlsx, höchstens 1.000 Zeilen je Datei. Zwei gleiche Bewegungen am selben Tag (gleiches Konto, gleiche Art, gleicher Betrag) gelten beim zweiten Einlesen als schon erfasst. Kein Bankimport mit Spaltenzuordnung: Kontoauszüge werden in die Vorlage kopiert.

Tests: Neue Datei mit festen Fällen: Vorlage mit Auswahllisten, sechs Zeilen (1.000 USD für 900 €, Zahlung −120,50 USD ohne Art, Zinsen 4,40 USD ÷ 1,10 + 1,14 € Steuer = 5,14 €, Umtausch 400 USD in 360 CHF, „Gebühr“, Zinsen 11 USD für 10 €) mit Beständen 474,5 USD, 360 CHF und 15,4 USD, erneutes Einlesen ohne Doppelte, acht Fehlerarten mit Zeilennummern, Abgang über den Bestand, Spalten in anderer Reihenfolge, Formelzelle, EZB-Kurs, Rücknahme und Wiederherstellung des ganzen Imports, Sperre im abgeschlossenen Jahr. Dazu eine in echtem Excel 16 ausgefüllte und gespeicherte Vorlage: Auswahllisten erkannt, drei Zeilen eingelesen (Zinsen 2,50 USD ÷ 1,08 + 0,50 € = 2,81 €).

## 2026-11-10 - Depotklar 4.21.0: Protokoll mit Öffnen und Rückgängig, Währungskonten für viele Buchungen, Umtausch zwischen Fremdwährungen, Kontostand laut Bank

Anlass: Aus dem Protokoll soll man immer zum Vorgang springen und Änderungen zurücknehmen können. Die Lose der Währungskonten sollen auch bei sehr vielen Ein- und Ausgängen übersichtlich bleiben, und die üblichen Fälle sollen abgedeckt sein. Außerdem sollte geprüft werden, dass Depotklar ohne Jahresgrenze weiterläuft.

Verhalten:
- Protokoll: Jeder Eintrag hat „Öffnen“: Vorgänge öffnen sich im Formular, Stammdaten im Bearbeiten, Jahresdaten und Bankbescheinigungen auf der Steuerseite des Jahres, Kurse, Vorabpauschale je Anteil, USt-Umrechnungskurse und Jahreswerte unter „Kurse“ (die Stelle wird kurz markiert), Buchhaltungssaldo und Kontostand laut Bank im jeweiligen Dialog, Abschlüsse im Jahresabschluss. „Rückgängig“ stellt den Stand vor der Änderung wieder her: eine geänderte Buchung auf den alten Stand, eine gelöschte zurück, eine Erfassung wird gelöscht; ebenso Stammdaten, Bescheinigungen, Kurse, Jahreswerte und Jahresdaten. Eine Schenkung an mehrere geht als Ganzes zurück. Vor der Rücknahme nennt Depotklar, was sich ändert, und warnt, wenn derselbe Gegenstand danach noch geändert wurde. Die Rücknahme läuft über dieselben Prüfungen wie jede Änderung, ist in abgeschlossenen Jahren gesperrt und steht selbst im Protokoll; auch sie lässt sich zurücknehmen.
- Viele Lose: Der Hinweis über einem Los nennt bei mehr als sechs Abgängen Anzahl, ersten und letzten Tag und die letzten drei; vollständig stehen sie im Kontoblatt und in Excel. Hat ein Anschaffungsjahr mehr als 24 Lose, öffnet ein Klick zuerst Monatszeilen. Jahres- und Monatszeilen nennen bei unverzinsten Konten, ab wann alle offenen Lose steuerfrei sind. Kontoblatt und Zinsen lassen sich zuklappen, ab 30 Bewegungen bzw. 24 Zahlungen sind sie zunächst zu und nennen im Kopf Anzahl und Bestand. Geöffnetes bleibt nach dem Speichern offen.
- Lange Zeiträume: Die Matrix zeigt auf der Seite und im PDF höchstens fünf Jahre mit Abgängen einzeln, ältere stehen zusammen in „Abgang bis …“. Excel zeigt weiter jedes Jahr. So passt das PDF auch über 15 Jahre auf die Seite.
- Tempo: Bestand und Buchwert der Konten werden laufend mitgeführt statt bei jeder Bewegung neu summiert. Bei 5.060 Buchungen sinkt die Rechnung von 676 auf 93 ms, die Seite „Konten“ von 815 auf 185 ms.
- Umtausch in eine andere Währung: Neue Bewegung mit Zielkonto der anderen Währung (nur eigene Konten) und dem Betrag, der dort ankommt. Die abgehende Währung gilt zum EUR-Wert des Tauschs als veräußert, das Zielkonto beginnt mit einem neuen Los zu diesem Wert und Tag. Ohne EUR-Wert gilt der Devisenkurs oder der EZB-Kurs der abgehenden Währung.
- Kontostand laut Bank: Je Konto und Jahresende lässt sich der Kontostand laut Auszug eintragen („Kontostand laut Bank“ am Konto). Depotklar zeigt daneben „stimmt“ oder die Differenz zum gebuchten Bestand und nennt eine Differenz bei den offenen Angaben. Er steht in Excel und PDF, im Protokoll und ist im abgeschlossenen Jahr gesperrt.
- Folgejahre: Geprüft mit gestellter Uhr auf 2035 und 2045 und Buchungen bis dahin: Jahresrechnung, alle Seiten, Excel und PDF laufen ohne Fehler; der Sparer-Pauschbetrag gilt weiter, die Jahresauswahl reicht zwei Jahre voraus, Abschlüsse sind möglich, und offen bleibt nur die Vorabpauschale eines Jahres ohne eingetragenen Basiszins, mit genauer Meldung. Gefunden und behoben: die Breite der Matrix im PDF (siehe oben); die Kursseite bekam je Jahr ab 2017 eine Spalte und wäre jedes Jahr breiter geworden – sie zeigt jetzt die letzten zehn Jahre, „Jahre ab“ blendet frühere ein; unter „Jahreswerte“ stehen die letzten fünf Jahre offen, ältere zugeklappt; der Jahresabschluss prüfte noch auf höchstens 2100, diese Grenze ist entfernt. Auch die Wertpapierseite läuft mit gestellter Uhr: Jahresrechnung, Vorabpauschale mit eingetragenem Basiszins, Rechenweg in Excel mit Formeln, Wertpapier-PDF 2018–2045 und Schenkungen mit Zehnjahresfrist. Die Zeilennummern der Steuerformulare stammen aus 2025 und sind so gekennzeichnet; maßgeblich ist die Bezeichnung.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine auf erfasste Vorgänge; Rechenergebnisse unverändert. Neu im Tresor sind nur Umtausch-Buchungen mit Zielbetrag (`toAmount`), der Datenbereich `balanceChecks` und Protokolleinträge „Jahresdaten zurückgenommen“. Ältere Tresore erhalten den leeren Datenbereich beim Öffnen; Datenformat 4 bleibt.

Grenzen: Für den Tausch zweier Fremdwährungen gilt ein EUR-Wert für Abgang und Zugang. Eine gelöschte Person lässt sich nicht wiederherstellen, weil ihre Jahresdaten mit gelöscht wurden; Abschlüsse werden nur über den Jahresabschluss mit Grund geändert. Wurde ein Gegenstand nach dem gewählten Eintrag noch geändert, gehen diese Änderungen mit zurück. Kein Bankimport: Bei sehr vielen Bewegungen bleibt die Erfassung von Hand der Aufwand.

Tests: Neue Datei mit festen Fällen: Spalten 2021–2026 mit höchstens drei Jahren (Abgang bis 2023 300 USD, Rest 400 USD), PDF über 15 Jahre ohne Breitenüberlauf, Umtausch 400 USD in 360 CHF zu 380 € (Anschaffung 360 €, Gewinn 20 € innerhalb der Frist; Rücktausch 390 €, Gewinn 10 €), vom verzinsten Konto § 20, Prüfungen von Zielkonto und Zielbetrag, Kontostand 980 USD gegen 990 USD (Differenz −10), Sperre im abgeschlossenen Jahr, Rücknahme von Änderung, Erfassung, Löschung, Kurs, Jahreswerten, Jahresdaten, Stammdaten und Schenkung an mehrere, Ziele von „Öffnen“, Hinweis bei 20 Abgängen, Monatszeilen und gemerkter Zustand, Jahr 2040 nach geltendem Recht (500 USD, Gewinn 20 € unter der Freigrenze), Kursseite mit Buchung 2090 (Spalten 2081–2090, 64 frühere ausgeblendet, „Jahre ab“), Abschluss 2150 zulässig.

## 2026-11-10 - Depotklar 4.20.0: Lose der Währungskonten als Matrix, Schenkung von Währungsbeträgen, eigene Ausgabe für Konten

Anlass: Bei Währungskonten entsteht mit jeder Zinsgutschrift ein neues Los. Die Lose sollen auch bei sehr vielen nachvollziehbar sein. Zinsen sollen mit Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer gebucht werden können, Lose wie bei Wertpapieren an andere Personen übergehen, und Excel und PDF sollen das abbilden.

Verhalten:
- Lose: Unter jedem Konto steht die Matrix der Lose: Anschaffung, Herkunft, Zugang, Kurs, EUR-Wert, Abgang je Jahr, Rest in Währung und EUR, bei unverzinsten Konten der erste steuerfreie Tag. Die Summe trifft Bestand und Buchwert des Kontoblatts. Ab 13 Losen fasst je Anschaffungsjahr eine Zeile zusammen und öffnet sich auf Klick. Lose, die vor dem gewählten Zeitraum aufgebraucht waren, werden nur gezählt. Konten mit Umsatzsteuer-Umrechnungskurs zeigen beide EUR-Werte.
- Zinsen: Die Felder für Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer sind optional. Bei Zinsen auf ein Währungskonto darf der Bruttobetrag leer bleiben: Er ist dann Gutschrift ÷ Kurs plus Steuer. Unter dem Konto steht ein Block „Zinsen“ mit dem erfassten Steuerabzug.
- Schenkung und Erbschaft: Neue Bewegungen „Schenkung an andere Person“ und „Erbschaft an andere Person“ auf ein Konto derselben Währung. Die ältesten Beträge gehen mit Anschaffungstag und EUR-Wert über, ohne Veräußerung (§ 23 Abs. 1 S. 3 EStG, § 20 Abs. 4 S. 6 EStG). Eine Schenkung zählt mit ihrem Wert am Tag der Schenkung auf der Seite „Schenkungen“ und in Excel für die Zusammenrechnung nach § 14 ErbStG. Die Auswahl des Zielkontos zeigt beim Übertrag nur eigene Konten, bei Schenkung und Erbschaft nur Konten anderer Personen.
- Ausgabe: Auf der Seite „Konten“ neue Knöpfe PDF und Excel. Die Excel-Mappe hat je Konto ein Kontoblatt und ein Blatt „Lose“ mit Rest und Summen als Formeln, Filter und fester Kopfzeile, darunter jeder Verbrauch je Abgang. Das PDF zeigt je Konto Kontoblatt, Zinsen, Matrix und Verbrauch. Auch die Depotblätter in Excel und PDF enthalten Zinsen und Matrix.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine auf erfasste Vorgänge. Die neuen Bewegungsarten kommen nur durch neue Buchungen in den Tresor; Datenformat 4 bleibt.

Grenzen: Eine Umbuchung auf oder zwischen verzinsten Konten bleibt nach BMF vom 14.05.2025, Rn. 131, eine Veräußerung mit neuem Los; die Lose gehen dabei nicht über. Schenkungen verbrauchen die ältesten Beträge zuerst, einzelne Lose lassen sich nicht wählen. Empfängt ein verzinstes Konto Lose aus einer Schenkung, gilt für den späteren Abgang die Einordnung dieses Kontos. Der Steuerabzug auf Zinsen wird nicht berechnet, weil Freistellungsauftrag und Verlusttöpfe ihn oft auf null setzen.

Tests: Neue Datei mit festen Fällen: 1.000 USD für 900 €, 300 USD verbraucht (270 €, Rest 700 USD und 630 €), Zinsgutschrift als eigenes Los, Summe gleich Kontoblatt, aufgebrauchte Lose nur gezählt, Gruppen ab 13 Losen, Schenkung mit Übergang (450 €, Verkauf beim Kind 480 €, Gewinn 30 € außerhalb der Frist), Erbschaft, Prüfungen der Person, Umbuchung auf verzinstes Konto (Gewinn 20 €), Bruttobetrag aus 75,90 USD ÷ 1,10 + 9,44 € = 78,44 €, Formeln in Excel.

## 2026-11-09 - Depotklar 4.19.1: Vorläufige Umsatzsteuer-Umrechnungskurse

Anlass: Der geplante Lauf aus 4.19.0 kann die BMF-Tabelle nicht laden, weil das BMF automatische Abrufe aus Rechenzentren mit einer Sicherheitsprüfung sperrt. Die Prüfung wird nicht umgangen.

Verhalten: Der Lauf aktualisiert die EZB-Tageskurse und bildet für jeden abgeschlossenen Monat nach dem letzten amtlichen Wert einen vorläufigen Wert: das Monatsmittel der EZB-Referenzkurse, gerundet auf die Stellen des BMF, für die Währungen mit EZB-Kursen. Unter „Kurse“ steht er grau im Feld des Monats, im Kontoblatt der Buchhaltung mit dem Zusatz „vorläufig“. Ein eingetragener Wert ersetzt ihn, ein amtlicher Wert geht immer vor. Amtliche Werte kommen mit `npm run rates:vat` von einem normalen Rechner dazu.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine auf die Steuer, die weiter zum Tageskurs rechnet. Konten mit Umsatzsteuer-Umrechnungskurs haben für Monate nach 10/2026 einen Buchwert statt eines offenen Werts.

Grenzen: Der vorläufige Wert ist nicht amtlich. Beim Abgleich 2010 bis 2026 wich das EZB-Monatsmittel in 3.433 Monatswerten nur einmal um mehr als 0,05 % ab. Für Währungen ohne EZB-Kurs bleibt der Monat offen, bis er eingetragen ist.

Tests: Nur abgeschlossene Monate (1,10 und 1,20 ergeben 1,1500, der laufende Monat fehlt), amtlicher und eigener Wert gehen vor, 125 USD ÷ 1,25 = 100 € mit Kennzeichnung im Kontoblatt.

## 2026-11-09 - Depotklar 4.19.0: Künftige Jahre ohne Einstellungen, Kurse aktualisieren sich selbst

Anlass: Depotklar soll in den kommenden Jahren ohne Umstellen weiterlaufen. Bisher musste jedes neue Jahr auf der Steuerseite bestätigt werden, sonst blieben Steuer und Schenkungsteuer offen; neue Kurse kamen nur mit einer Pflege von Hand. Für Währungskonten soll wählbar sein, welcher Kurs für die Buchhaltung gilt.

Verhalten:
- Künftige Jahre: Sparer-Pauschbetrag, Abgeltungsteuer, Solidaritätszuschlag, Teilfreistellungen, Freigrenze und Schenkungsteuer gelten ohne Bestätigung weiter, denn sie sind Dauerrecht ohne Befristung. Die Steuerseite nennt den fortgeltenden Sparer-Pauschbetrag als Hinweis. Wirtschaftsjahre anzulegen ist nicht nötig: Gebucht wird mit dem richtigen Datum, das Jahr erscheint von selbst.
- Jahreswerte: Neuer Abschnitt unter „Kurse“ für alle Personen. Nur der Basiszins kommt jedes Jahr neu und wird dort eingetragen, sobald das BMF ihn Anfang Januar veröffentlicht; ohne ihn bleibt die Vorabpauschale dieses Jahres offen, nicht null. Einen geänderten Sparer-Pauschbetrag trägt man dort ab dem Jahr ein, ab dem er gilt; er gilt dann auch für die Jahre danach. Das Formular „Jahresregeln“ auf der Steuerseite entfällt. Früher bestätigte Werte bleiben gültig.
- Kurse: Ein geplanter Lauf holt montags und donnerstags neue EZB-Tageskurse und Umsatzsteuer-Umrechnungskurse des BMF und veröffentlicht sie nach bestandenen Tests. Einmal hinterlegte Werte ändert er nie, er ergänzt nur. Fällt eine Quelle aus, bleibt die andere aktuell und der Lauf meldet den Fehler. Die Prüfung des Änderungsverlaufs läuft nur noch als eigener Schritt, nicht mehr beim Einbinden in die Tests. Bei einer leeren Antwort nennt der Lauf, was die Quelle geliefert hat.
- Währungskonten: In den Stammdaten steht statt des Hakens die Auswahl „Kurs für die Buchhaltung“ mit Tageskurs oder Umsatzsteuer-Umrechnungskurs. Das gespeicherte Merkmal bleibt gleich.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine für 2018 bis 2026. Für Jahre ab 2027 ohne bestätigte Jahresregeln rechnet Depotklar jetzt mit dem fortgeltenden Sparer-Pauschbetrag von 1.000 €, statt die Steuer offen zu lassen. Datenformat 4 bleibt. Regelpaket DE-privat-2018-2026.15.

Grenzen: Die persönlichen Jahresdaten (Kirchensteuer, Verlustvorträge) sind weiter je Person und Jahr zu bestätigen. Eine Gesetzesänderung außer beim Sparer-Pauschbetrag braucht ein Update von Depotklar; bei Prüfung am 09.11.2026 war keine für 2027 bekannt. Der Basiszins 2027 ist noch nicht veröffentlicht. Zwischen zwei Läufen kann ein EZB-Tageskurs noch fehlen; dann gilt der Kurs laut Abrechnung oder die Ergänzung unter „Konten“.

Tests: Neue Datei mit festen Fällen: Verkauf 2031 (3.000 € − 1.000 € = 2.000 €; 500 € und 27,50 €), geänderter Sparer-Pauschbetrag ab 2029 (1.500 €; 375 € und 20,62 €), Basiszins wird nicht geerbt, Schenkung 2028, Jahreswerte mit Sperre nach Abschluss, Auswahl am Konto, Kurstabellen wachsen nur.

## 2026-11-09 - Depotklar 4.18.0: Verkäufe für die Buchung, Umsatzsteuer-Umrechnungskurse, künftige Jahre, Filter je Depot

Anlass: Für die Buchung eines Verkaufs fehlten Kapitalertragsteuer, Solidaritätszuschlag, Kirchensteuer und die Aufteilung des Gewinns. Währungskonten sollen auch mit dem Umsatzsteuer-Umrechnungskurs geführt werden können, mit den Kursen der Vergangenheit und einer zentralen Pflege für die Zukunft. Die Jahresauswahl endete beim laufenden Jahr, künftige Jahre ließen sich nicht ansehen. PDF und Seite sollen sich je Depot filtern lassen.

Verhalten:
- Verkäufe: Die Vorschau beim Erfassen und ein neuer Block „Verkäufe“ je Depot (Seite, PDF Übersicht, PDF je Wertpapier, Excel) zeigen Erlös, Abgang zum Buchwert, wirtschaftlichen Gewinn und woraus er besteht: steuerfreie Wertsteigerung bis 2017, schon versteuerte Vorabpauschalen, Teilfreistellung, steuerpflichtig nach Teilfreistellung. Eine Differenz (Durchschnitt gegen FIFO, versteuerte Thesaurierungen) steht nur da, wenn es sie gibt; ein einzelner Rundungscent geht in die Teilfreistellung, damit die Teile auf den Cent aufgehen. Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer laut Abrechnung, sonst rechnerisch und kursiv.
- Umsatzsteuer-Umrechnungskurse: Neue Tabelle aus dem Datenportal des BMF für 2010 bis 10/2026 mit 35 Währungen. In den Stammdaten je Währungskonto der Haken „Buchhaltung zum Umsatzsteuer-Umrechnungskurs“. Das Konto zeigt dann ein zusätzliches Blatt, in dem jede Bewegung zum Monatskurs umgerechnet ist; ein übernommener Bestand behält einen erfassten EUR-Wert. Unter „Kurse“ steht je Jahr die Tabelle der verwendeten Währungen; Monate ohne amtlichen Wert lassen sich dort eintragen, für alle Konten der Währung, mit Protokoll. Ein fehlender Monat bleibt offen und wird nicht geschätzt.
- Künftige Jahre: Die Jahresauswahl auf Übersicht, Konten, Steuer und in „Vorabpauschale laut Bank“ reicht immer bis zwei Jahre über das laufende hinaus und bis zu jedem Jahr mit Buchungen, ohne feste Grenze. Die Kursseite zeigt auch künftige Jahre mit Buchungen oder Kursen, künftige Schenkungen stehen auf der Schenkungsseite.
- Filter: Auf der Jahresübersicht lässt sich ein Depot wählen. Seite, Kennzahlen, offene Angaben, beide PDFs, Excel und die Vorgänge folgen; Dateiname und Überschrift nennen das Depot.

Auswirkung auf Bestände, Geld und Steuerwerte: Keine auf bestehende Bestände und Steuerwerte. Der Tresor bekommt optional den Haken am Konto und selbst gepflegte Kurse (vatRates); Datenformat 4 bleibt, ältere Versionen übergehen beides. Regelpaket DE-privat-2018-2026.14.

Grenzen: Steuerlich rechnet Depotklar bewusst weiter zum Tageskurs: § 20 Abs. 4 S. 1 EStG verlangt die Umrechnung im Zeitpunkt des Geschäfts, BMF vom 14.05.2025, Rn. 247, den Kurs am Tag des Zuflusses; die Monatskurse gelten nach § 16 Abs. 6 UStG für die Umsatzsteuer und nach R 34c Abs. 1 S. 2 EStR vereinfachend für ausländische Steuern. Im BMF-Datensatz fehlen für 2010 bis 2014 die USA und Ungarn; dort steht das Monatsmittel der EZB-Referenzkurse, in der Tabelle als abgeleitet gekennzeichnet. HUF 07/2015 fehlt auch beim BMF. Die rechnerische Steuer je Verkauf kennt weder Verlusttopf noch Freistellungsauftrag und weicht deshalb von der Abrechnung ab, wenn beides greift. Für die Steuerrechnung eines neuen Jahres bleiben Sparer-Pauschbetrag und Basiszins zu bestätigen; den Basiszins gibt das BMF erst im Januar bekannt. Buchen geht ohne das.

Tests: Neue Datei mit festen Fällen: Alt-Anteil (7.000 € = 3.000 + 300 + 1.110 + 2.590; KapESt 633,25 €, Soli 34,82 €, KiSt 56,99 €), Fonds 2009 bis 2017 (5.000 € = 100 + 870 + 4.030), Altaktie (2.000 € steuerfrei), Durchschnitt gegen FIFO (−500 €), Vorrang der Abrechnung, Verkauf nach altem Recht, Buchhaltung zum Monatskurs (921,41 € und −78,87 € neben −50 € steuerlich), offener Monat, Pflege mit Protokoll, Sperren, Stichproben aus der BMF-Tabelle, Einlesen der BMF-Dateien, Jahre über das laufende hinaus, Filter in Seite, PDF, Excel und Vorgängen. Die Tabelle wurde mit den EZB-Tageskursen gegengeprüft: 3.433 Monatswerte, eine Abweichung über 0,05 % (ZAR 07/2019).

## 2026-11-07 - Depotklar 4.17.1: Korrekturen aus der Nachprüfung von 4.14 bis 4.17

Anlass: Unabhängige Nachprüfung von 4.14 bis 4.17 in drei Teilen (Verschmelzung und Aktientausch; Anleihen, ETCs, Zusammenveranlagung und Folgejahre; Durchschnitt, Excel-Rechenweg und Eingabe). Jeder Befund wurde am Code mit fiktiven Daten nachgestellt und die Rechtslage am Wortlaut geprüft (BMF vom 14.05.2025, Rn. 118, 273 bis 277; BMF vom 21.05.2019, Rz. 23.24; § 20 Abs. 6, 9 und § 26b EStG; § 22 InvStG).

Verhalten:
- Verlustverrechnung in der Reihenfolge nach Rn. 118: laufende übrige Verluste vor dem Aktienverlustvortrag, der nur gegen die danach verbleibenden Aktiengewinne geht. Die Steuer des Jahres bleibt gleich, der Vortrag steht jetzt im richtigen Topf. Steuerseite, Excel und PDF zeigen die Schritte.
- Zusammenveranlagung nach Rn. 274 und 275: Jeder zieht zuerst seine Hälfte des Sparer-Pauschbetrags ab (ein ungenutzter Teil geht über), erst danach gleichen die verbleibenden Verluste des einen die Erträge des anderen aus. Der Vortrag ist dadurch nicht mehr zu niedrig (Rn. 275 Beispiel 1: 7.000 statt 5.000 €). Quellensteuer, die einer nicht anrechnen kann, rechnet der andere an (§ 26b EStG; Rn. 276).
- Ein Ehegatte ohne Erträge braucht bestätigte Jahresdaten; bis dahin bleibt die Rechnung offen, statt seine Vorträge und den anderweitig genutzten Pauschbetrag als 0 anzusetzen. Seine Vorträge werden fortgeschrieben und nicht erneut voll vorgeschlagen.
- Dieselbe Bank: Der Ehegatte mit Gewinn ist nicht mehr gesperrt. Die Verlustbescheinigung wird gegen die mögliche Spanne geprüft, weil der Rest vom Freistellungsauftrag bei dieser Bank abhängt.
- Eine Person, die für eine Zusammenveranlagung gewählt ist, lässt sich nicht mehr löschen.
- Verschmelzung: Die BFH-Begrenzung gilt nur bis zur ersten Verschmelzung mit Satzwechsel. Excel rechnet nach einer Verschmelzung dieselbe Teilfreistellung wie Depotklar. Die Anlage KAP-INV führt Verlust ohne Teilfreistellung, Alt-Anteile und fiktiven Gewinn 2017 bei der Fondsart des alten Fonds. Ein Verlust über eine Verschmelzung hinweg nennt die offene Rechtsfrage mit Betrag. Das Datum heißt „Übertragungsstichtag“; gezwölftelt wird ab dem Folgetag. Grenzüberschreitende Verschmelzungen und offene Verschmelzungen in anderen Depots stehen auch auf der Steuerseite, auch ohne andere Erträge. Das steuerliche Blatt nennt beim Verkauf auch den fiktiven Gewinn 2017.
- Gleitender Durchschnitt: Jeder Teilabgang geht wie im Sachkonto auf den Cent gerundet ab; bei einer Schenkung an mehrere jeder Empfänger.
- Vorabpauschale im Kaufjahr: Zwölftel ohne Zwischenrundung, ein halber Cent rundet auf wie in Excel.
- Gezahlte Stückzinsen über ein Währungskonto sind ein Abgang statt ein Zugang. Ein Tausch nach Verhältnis ergibt ganze Stücke (auf sechs Stellen). Quellensteuer auf einen negativen Ertrag und ein negativer Barausgleich werden abgelehnt statt still angenommen oder verworfen.
- Texte: Rechenweg nennt die Zusammenveranlagung; Anleitung, KI-Einstieg, Zielbild und Startseite auf Stand 4.17; FIFO bei ETCs als Annahme gekennzeichnet.

Auswirkung auf Bestände, Geld und Steuerwerte: Gespeicherte Daten ändern sich nicht. Neu gerechnet werden: die Art der Verlustvorträge bei Aktienvortrag und gleichzeitigen sonstigen Verlusten; bei Zusammenveranlagung Vorträge, Quellensteueranrechnung und Sperren; Vorabpauschalen nach Verschmelzung zum Monatsende (ein Zwölftel weniger) und mit halbem Cent; Formularwerte nach Verschmelzung mit Satzwechsel; wirtschaftliche Abgänge und Stände um Centbruchteile. Der Nachbau des Jahresblatts endet 2026 dadurch bei 5.905.356,63 € (die Summe der drei Abgänge in Cent) statt 5.905.356,64 € (ungerundet). Regelpaket DE-privat-2018-2026.13.

Grenzen: Ob das BFH-Urteil vom 25.11.2025 auch einen Verlust nach einer Verschmelzung mit Satzwechsel erfasst, ist nicht entschieden. Die Aufteilung des Pauschbetrags zuerst auf die übrigen Erträge und die Aufteilung bei unterschiedlicher Kirchensteuer sind abgeleitet, eine amtliche Rechenvorgabe liegt nicht vor. Bei gemeinsamem Freistellungsauftrag und Einzelveranlagung verrechnet die Bank weiter über beide; das bildet Depotklar nicht ab. Die Reihenfolge der ETC-Stücke ist angenommen.

Tests: Neue Datei mit festen Fällen: Rn. 118 (Vortrag Aktien 1.000 €, Folgejahr 263,75 €), Rn. 275 Beispiel 1 (7.000 €), Ehegatte ohne Erträge (offen, dann 52,75 €), dieselbe Bank mit Spanne 5.000 bis 7.000 €, Quellensteuer über beide (896,75 € statt 1.055 €), Löschsperre, zwei Verschmelzungen (2.825 €), Verlust nach Verschmelzung (−550 € mit Hinweis), KAP-INV nach altem Fonds, Stichtag 30.06. (178,50 €), Abgänge 3,33/3,34/3,33 €, Vorabpauschale 2,49 €, Tausch 1 : 3, Stückzinsen über Währungskonto, Eingabesperren. Der Formelrechner prüft die neuen Rechenwege auf den Cent. Die Prüffälle zur Zusammenveranlagung und drei Fälle zum nachgebauten Jahresblatt sind auf die neuen Sollwerte umgestellt.

## 2026-11-07 - Depotklar 4.17.0: Anleihen, ETCs, Aktientausch, Fondsverschmelzung mit Satzwechsel, Zusammenveranlagung

Anlass: Fälle, die bisher nicht buchbar waren oder die Rechnung sperrten, sollen ohne Umbau des Alltags möglich sein. Ein Fonds wurde in der Familie schon einmal in einen anderen übernommen; dieser Fall bekommt besondere Sorgfalt. Zusammenveranlagung bleibt die Ausnahme und wird jedes Jahr neu geprüft.

Verhalten: Neue Wertpapierart „Anleihe / Zertifikat“ für Anleihen, Zertifikate und ETCs ohne hinterlegten Rohstoff: Kauf, Verkauf (auch Rückzahlung, wertlos mit Erlös 0) und Zinsen über „Ausschüttung / Dividende“, ohne Teilfreistellung und Vorabpauschale, im allgemeinen Verlusttopf; gezahlte Stückzinsen negativ (BMF vom 14.05.2025, Rn. 50, 51). Neue Art „ETC mit Rohstoffanspruch“ für ETCs mit Anspruch nur auf den hinterlegten Rohstoff oder seinen Verkaufserlös: kein Kapitalertrag, steuerbar nur bis ein Jahr nach der Anschaffung, zusammen mit den Währungskonten bei den privaten Veräußerungsgeschäften (Anlage SO, Freigrenze; Rn. 57). Neue Vorgänge „Sonstiger Ertrag“ (Betrag laut Abrechnung, auch Verlust, allgemeiner Topf, nicht nachgerechnet) und „Aktientausch“ (§ 20 Abs. 4a EStG: Lose gehen mit Anschaffungskosten und Erwerbsdatum über, auch Altaktien von vor 2009; Barausgleich als Dividende, auf Altaktien nicht steuerbar; über 10 % des Börsenkurses abgelehnt, weil der ganze Vorgang dann ein Tausch ist). Fondsverschmelzung: neue Stückzahl laut Abrechnung oder Verhältnis, Zielfonds lässt sich im Formular anlegen, Barausgleich mit der Teilfreistellung des alten Fonds. Bei anderem Teilfreistellungssatz, bisher nicht buchbar, gelten die Anteile zum Rücknahmepreis des Zielfonds als verkauft und neu angeschafft; der Gewinn wird erst beim echten Verkauf versteuert, mit dem Satz des alten Fonds, und geht bei Teilverkauf und Schenkung anteilig mit (§ 22 InvStG; BMF vom 21.05.2019, Rz. 22.11, 23.23, 23.24). Die Vorschau zeigt Lose, Werte, den aufgeschobenen Gewinn und die Vorabpauschale des Jahres, weist auf Bestände desselben Fonds in anderen Depots hin und warnt, wenn die ISINs verschiedene Staaten nennen: Grenzüberschreitend gilt § 23 InvStG nicht. Liegt der Fonds nach der Verschmelzung noch in einem anderen Depot, steht das auf der Steuerseite und beim Jahresabschluss. Zusammenveranlagung: in den Jahresdaten je Jahr wählbar, Vorgabe ist immer die Einzelveranlagung; eine der beiden Personen wählt. Gemeinsamer Verlustausgleich mit getrenntem Aktientopf, Sparer-Pauschbetrag je zur Hälfte mit Übergang des ungenutzten Teils (§ 20 Abs. 6, 9 EStG). Jede Person behält ihren Anteil und rechnet darauf mit eigener Kirchensteuer und Quellensteuer; auch ein Ehegatte ohne Erträge zählt. Verluste bei derselben Bank verrechnet Depotklar über beide mit Hinweis auf den nötigen gemeinsamen Freistellungsauftrag (BMF vom 14.05.2025, Rn. 266). Abschluss und Wiederöffnen gelten für beide. Das Excel-Blatt „Rechenweg“ zeigt alle neuen Fälle in Formeln. Im Vorgangsmenü stehen die neuen Vorgänge als eigene Einträge.

Auswirkung auf Bestände, Geld und Steuerwerte: Bestehende Daten ändern sich nicht. Ein alter Haken „Zusammenveranlagung“ ohne Ehegatten steht jetzt auf „Angaben fehlen“ statt „außerhalb des Modells“. Eine gespeicherte Verschmelzung mit anderem Satz steht ebenfalls auf „Angaben fehlen“, bis der Rücknahmepreis erfasst ist.

Grenzen: Anleihen, Zertifikate und ETCs mit Kauf vor 2009 bleiben gesperrt (§ 52 Abs. 28 S. 15 bis 17 EStG). Einlagenrückgewähr und Abspaltung sind noch nicht erfassbar. Ob ein ETC einen Rohstoffanspruch verbrieft, steht in den Emissionsbedingungen; Depotklar prüft das nicht. Grenzüberschreitende Verschmelzungen werden als Verkauf und Kauf gebucht. Wechselt ein Fonds seinen Teilfreistellungssatz ohne Verschmelzung, ist das weiter nicht abgebildet. Bei unterschiedlicher Kirchensteuer der Ehegatten rechnet jeder auf seinen Anteil; die Aufteilung nach gemeinsamem Verlustausgleich ist aus dem Gesetz abgeleitet, eine amtliche Vorgabe dazu liegt Depotklar nicht vor. Die Jahresrechnung zeigt keine Günstigerprüfung. Regelpaket DE-privat-2018-2026.12.

Tests: Neue Datei mit festen Fällen: Anleihe mit Stückzinsen und Quellensteuer (163,26 € Steuer), wertlose Ausbuchung, sonstiger Ertrag, Aktientausch mit Altaktien und Barausgleich, Verschmelzung ohne und mit Satzwechsel nach den amtlichen Beispielen (Rz. 23.24: 20.000 € zu 30 %; Rz. 22.11: −3 €), Fonds 2009 bis 2017 und Alt-Anteile mit aufgeschobenem Gewinn, Anlage KAP-INV nach Fondsart, ETC innerhalb und außerhalb der Jahresfrist, Zusammenveranlagung mit Verlust, ohne Erträge, mit Aktienverlust und Vortrag, Bank- und Abschlussregeln. Der Formelrechner prüft jeden Rechenweg auf den Cent. Zwei frühere Prüffälle erwarteten die alten Sperren und sind angepasst.

## 2026-11-07 - Depotklar 4.16.0: Folgejahre mit bestätigten Jahresregeln

Anlass: Die hinterlegten Regeln reichten bis 2026. Ab 2027 hätte Depotklar Steuerjahr, Vorabpauschale und Schenkungsteuer gesperrt, bis ein Update die Werte des Jahres liefert. Künftige Jahre sollen sich buchen und rechnen lassen; bei größeren Steueränderungen folgt weiter ein Update.

Verhalten: Für ein Jahr ohne hinterlegte Werte steht auf der Steuerseite oben „Jahresregeln“. Einmal für alle Personen wird der Sparer-Pauschbetrag bestätigt (Vorschlag aus dem Vorjahr) und der Basiszins in Prozent eingetragen, sobald das BMF ihn Anfang Januar veröffentlicht; er darf bis dahin leer bleiben. Danach rechnet Depotklar das Jahr mit den übrigen Regeln von 2026 weiter: Abgeltungsteuer, Solidaritätszuschlag, Teilfreistellungen, Freigrenze für private Veräußerungsgeschäfte, Schenkungsteuer. Die Vorabpauschale fließt am ersten Werktag (Montag bis Freitag) des Folgejahres zu, wie in allen BMF-Tabellen 2018 bis 2026. Ohne Bestätigung ist ein Folgejahr mit Erträgen „Angaben fehlen“ statt „außerhalb des Modells“; ohne Basiszins ist die Vorabpauschale offen, nicht null – ein Bankwert gilt auch ohne ihn, und Bankwerte lassen sich für Folgejahre erfassen. Selbst bestätigte Regeln nennt die Jahresrechnung als Hinweis, das Excel-Blatt „Rechenweg“ an der Zeile des Sparer-Pauschbetrags. Hinterlegte Werte eines späteren Updates haben Vorrang. Die Bestätigung steht im Protokoll unter „Jahresdaten und Bescheinigungen“ und ist gesperrt, sobald eine Person das Jahr abgeschlossen hat. Startseite: Umfang und Fußzeile nennen die Folgejahre.

Auswirkung auf Bestände, Geld und Steuerwerte: Für 2018 bis 2026 keine. Neue Angabe im Tresor (Jahresregeln); Datenformat 4 bleibt, ältere Versionen übergehen sie.

Grenzen: Depotklar prüft bestätigte Werte nicht gegen das Gesetz. Andere Gesetzesänderungen – etwa ein neuer Steuersatz, andere Teilfreistellungen oder Freibeträge – brauchen ein Update. Die Formularzeilen beziehen sich weiter auf die Formulare 2025. EZB-Devisenkurse liegen bis zum letzten Update vor; danach ohne Vorschlag, den Kurs laut Abrechnung eintragen.

Tests: Neuer Prüffall mit fiktiver Familie über 2026 hinaus (Fondskauf 2026, Ausschüttung und Schenkung 2027, Verkauf 2028): Zufluss gleich den BMF-Tabellen 2018 bis 2026; 2027 offen bis zur Bestätigung, Vorabpauschale 2027 ohne Basiszins offen und der Verkauf 2028 deshalb ebenfalls; nach der Bestätigung Vorabpauschale 2027 mit 1,85 € je Anteil, Verkauf 2028 mit 3.296,66 € vor und 2.307,66 € nach Teilfreistellung, Schenkungsteuer 0 €. Hinterlegte Jahre bleiben unberührt, ein Abschluss sperrt, das Protokoll nennt Grund und Basiszins, Steuerseite und Excel zeigen die Herkunft. Der bisherige Prüffall erwartet für 2027 ohne Erträge „keine Erträge“ statt „außerhalb des Modells“.

## 2026-11-05 - Depotklar 4.15.0: Rechenweg des Steuerjahrs in Excel mit Formeln

Anlass: Für eine Rückfrage des Finanzamts soll die Excel-Mappe zeigen, wie sich ein Verkauf steuerlich nach FIFO zusammensetzt und wie die Steuer daraus entsteht – als nachrechenbarer Weg, nicht nur als Ergebnis.

Verhalten: Die Excel-Mappe enthält je Person mit Erträgen nach dem Steuerblatt das Blatt „Rechenweg Jahr Name“. Es zeigt die Jahresdaten; jeden Verkauf des Jahres Los für Los in FIFO-Reihenfolge mit dem Bestand des Loses vor dem Verkauf, Erlösanteil, Anschaffungskosten oder Basis 31.12.2017, angesetzten Vorabpauschalen je Jahr, Gewinn, fiktivem Gewinn 2017, Verlust ohne Teilfreistellung nach BFH, Teilfreistellung und steuerpflichtigem Teil, dazu den Abgleich mit dem Gewinn laut Abrechnung, die nicht berührten jüngeren Lose und den auf den Freibetrag anrechenbaren Teil bei Alt-Anteilen; jede Vorabpauschale mit Zufluss im Jahr aus Basiszins, erstem und letztem Kurs, Ausschüttungen und Monaten je Los, bei einem Bankwert dessen Verteilung auf die Lose; die Erträge mit Topf, Teilfreistellung, Freibetrag und anrechenbarer Quellensteuer; die Jahresrechnung von der Verlustverrechnung über den Sparer-Pauschbetrag bis zu Kapitalertragsteuer (e − 4q)/(4 + k), Solidaritätszuschlag, Kirchensteuer, erwarteter Erstattung und den Vorträgen. Blau sind Eingaben aus Abrechnungen, Kursen und Jahresdaten; alle übrigen Zahlen sind Formeln, die das Ergebnis von Depotklar als gespeicherten Wert tragen. Excel rechnet beim Öffnen neu. Steuerblatt, Übersicht und PDF bleiben unverändert. Startseite: Excel nennt den Rechenweg, Fußzeile 4.15.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Rechnung gibt zusätzlich die FIFO-Reihenfolge vor jedem Verkauf und je Vorabpauschale Wert je Anteil, Kurse und Monate je Los aus.

Grenzen: Fest stehen die Vorabpauschalen früherer Jahre je Los, der fiktive Gewinn 2017 laut Bank, Währungsgewinne und private Veräußerungsgeschäfte; sie stehen auf dem Steuer- und dem Kontenblatt. Der Export geht in eine Richtung: Änderungen in Excel fließen nicht in Depotklar zurück. Excel rechnet mit 15 Stellen und kann in seltenen Fällen um einen Cent vom Wert in Depotklar abweichen. Ist ein Verkauf nicht vollständig ermittelt, zeigt das Blatt seine Werte ohne Formeln mit dem offenen Grund, und die Jahresrechnung bleibt offen.

Tests: Neuer Prüffall mit fiktiver Person – Altaktie vor 2009, zwei Käufe nach FIFO, Fonds 2009 bis 2017 mit Verlust nach BFH, Kauf im Jahr mit gezwölftelter Vorabpauschale, Alt-Anteil mit Freibetrag, Bankwert der Vorabpauschale, Dividende mit Quellensteuer, Kirchensteuer bis Juni. Ein eigener Formelrechner rechnet jede Formel nach und vergleicht sie auf den Cent mit Depotklar, auch nach dem Speichern als Datei; ebenso alle Personen und Jahre der Beispieldaten 2018 bis 2026.

## 2026-11-05 - Dokumentation und Startseite auf Stand 4.14

Anlass: Durchsicht von Handbuch, Startseite und Zielbild gegen den Stand 4.14. Einige Aussagen waren älter als die Funktionen.

Verhalten: keine Änderung der Anwendung. Startseite: Umfang nennt wirtschaftlich den gleitenden Durchschnitt, die Vorabpauschale aus erstem und letztem Kurs oder je Anteil, Quellensteuer auch auf Fondsausschüttungen (stand fälschlich unter „gesondert zu prüfen“), Depots bei ausländischen Banken mit den Werten für KAP und KAP-INV und die Kirchensteuer bei Ein- oder Austritt; „gesondert zu prüfen“ nennt jetzt Quellensteuer auf Zinsen, Anleihen, Zertifikate und Derivate. Die Frage nach anderen Geräten nennt die Tresordatei (Chrome, Edge), die Fußzeile 4.14. Tresor-Kapitel: Speichern nach gelöster oder neu verbundener Datei und der aufbewahrte Stand nach einer Sperre ohne Rückfrage (seit 4.13.2). KI-Einstieg: akkumulierte ausschüttungsgleiche Erträge, Quellensteuer, PDF und Excel. Rechenlogik: welche Zeilen nur im steuerlichen Blatt stehen; Schenkung an mehrere wirtschaftlich zum Durchschnitt. Zielbild: Stand 4.14, FIFO nur steuerlich, Umfang ergänzt.

Auswirkung auf Bestände, Geld und Steuerwerte: keine.

Grenzen: Die Formularzeilen beziehen sich weiter auf die Formulare 2025.

Tests: Dokumentationsprüfung und alle Prüffälle unverändert.

## 2026-11-05 - Depotklar 4.14.0: Wirtschaftlich im gleitenden Durchschnitt, Lose ausblendbar

Anlass: Das Sachkonto der Buchhaltung bewertet jedes Depot im gleitenden Durchschnitt: Bestandswert ÷ Stück ist der Wert je Stück, ein Verkauf oder eine Schenkung geht mit Stück × diesem Wert ab. Depotklar verbrauchte auch wirtschaftlich die Lose nach FIFO. Wo zu verschiedenen Kursen gekauft oder ein Bestand zum 01.01.2018 nach Erwerbsgruppen zusammengefasst übernommen wurde, wichen Teilabgänge, wirtschaftliche Gewinne und der Stand 31.12. deshalb vom Sachkonto ab. Außerdem stand im Zeitraum über viele Jahre unter jedem Wertpapier und Jahr eine Zeile „Lose zum 31.12.“, und das in beiden Blättern.

Verhalten:
- Wirtschaftliche Betrachtung im gleitenden Durchschnitt je Depot und Wertpapier: Vor jedem Abgang (Verkauf, Schenkung, Erbschaft, Übertrag) gilt Bestandswert ÷ Stück; der Abgang geht mit Stück × Durchschnitt ab, der Empfänger übernimmt denselben Wert. Käufe, Zugänge und Thesaurierungen nach altem Recht ändern den Durchschnitt; Splits und Verschmelzungen führen den Wert fort. Die Zeile eines Abgangs nennt „Abgang zum Durchschnitt … € je Stück“ mit vier Nachkommastellen.
- Steuerlich bleibt es bei FIFO (§ 20 Abs. 4 S. 7 EStG): Basis, Vorabpauschalen, fiktiver Gewinn, Alt-Anteile und alle Steuerwerte ändern sich nicht.
- Lose stehen nur noch im steuerlichen Blatt, weil sie wirtschaftlich keinen eigenen Wert mehr haben. Ebenso nennt nur das steuerliche Blatt, aus welchen Losen ein Abgang stammt; Excel listet die Lose zum Ende des Zeitraums nur im steuerlichen Teil.
- „Lose zeigen“ neben der Betrachtung blendet die Losezeilen der Jahresübersicht aus; der Browser merkt sich die Einstellung. PDF und Excel bleiben davon unberührt.

Auswirkung auf Bestände, Geld und Steuerwerte: Stückzahlen, Geld und alle steuerlichen Werte bleiben gleich. Neu gerechnet werden wirtschaftliche Abgangswerte, wirtschaftliche Gewinne und Buchwerte zum 31.12. überall, wo ein Depot vor einem Teilabgang Lose mit verschiedenen Werten je Stück hielt – auch in vergangenen Jahren; der Abgleich mit dem erfassten Saldo der Buchhaltung kann sich dadurch ändern. Nach dem letzten Abgang steht der Wert wie bisher auf null; bei reinen Verkäufen verteilt sich derselbe Gesamtgewinn anders auf die Teilverkäufe. Gespeicherte Daten ändern sich nicht.

Grenzen: Ein unbekannter Anschaffungswert eines Loses macht den Durchschnitt und alle späteren wirtschaftlichen Abgänge des Depots offen, bis er erfasst ist (bisher nur, wenn FIFO dieses Los traf). Der Durchschnitt gilt je Depot wie das Sachkonto, nicht über alle Depots einer Person. Währungskonten bleiben bei FIFO (§ 23 EStG). Eine Wahl zwischen FIFO und Durchschnitt gibt es wirtschaftlich nicht.

Tests: fiktiver Prüffall mit Käufen zu 10 und 20 € je Stück – Verkauf von 120 Stück wirtschaftlich 1.500 € mit 900 € Gewinn (steuerlich 1.200 €), Schenkung von 80 Stück mit 1.000 € beim Schenker und beim Kind (steuerlich 800 €), Stand 31.12. 2.500 € gleich dem erfassten Saldo, nach Nachkauf Verkauf des Rests mit 4.100 € auf null; Übernahme zum 01.01.2018 in zwei Erwerbsgruppen zu 40 und 60 € je Stück geht mit 55 € je Stück ab; unbekannter Anschaffungswert bleibt offen; das Blatt nennt den Durchschnitt, Lose nur steuerlich, ausgeschaltet ohne Losezeilen, Excel ebenso. Drei bisherige Prüffälle auf die neuen wirtschaftlichen Sollwerte umgestellt (Abgang 3.000 statt 2.500 €, Gewinn 3.000 statt 4.200 €, Lose im steuerlichen Blatt), die steuerlichen Sollwerte unverändert.

## 2026-11-04 - Depotklar 4.13.2: Korrekturen aus der Nachprüfung

Anlass: Externe Nachprüfung von 4.13.0 mit zwölf steuerlichen und zwei technischen Befunden. Jeder Befund wurde am Code nachgestellt und gegen amtliche Quellen geprüft (BMF vom 16.05.2025 zur Steuerbescheinigung, Rn. 28 und 30; BMF-Anwendungsschreiben zum InvStG vom 21.05.2019 zu § 23; ELSTER-Anleitung zur Anlage KAP 2025; § 56 InvStG; § 14 ErbStG); alle trafen zu.

Verhalten:
- Akkumulierte ausschüttungsgleiche Erträge (bisher „noch steuerpflichtige Alt-Erträge“) sind keine Einkünfte des Verkaufsjahres mehr: Die Bank holt auf sie nur den Steuerabzug nach (§ 56 Abs. 3 S. 6 InvStG), in der Erklärung werden sie abgezogen (Rn. 28). Depotklar weist sie aus, nennt den Abzug in der Anlage KAP und die Voraussetzungen der Anrechnung (BMF vom 17.12.2012); bei Depots ohne deutschen Steuerabzug gehören sie in die Jahre bis 2017. Das Feld heißt jetzt „Akkumulierte ausschüttungsgleiche Erträge“.
- Vorabpauschale im Jahr einer Fondsverschmelzung: nur auf die Anteile am übernehmenden Fonds, gezwölftelt ab dem Verschmelzungsmonat; zum 31.12. mit den Werten des untergegangenen Fonds und dem ursprünglichen Erwerb.
- Ausschüttungen: Zwei Ausschüttungen im selben Depot innerhalb von sieben Tagen werden nicht mehr zu einem Durchschnitt zusammengelegt; dieselbe Ausschüttung in mehreren Depots zählt weiter einmal.
- Währungskonten: Zugänge werden nach dem ursprünglichen Anschaffungstag verbraucht, auch zwei am selben Stichtag übernommene Bestände. Gutschriften aus Verkauf, Ausschüttung und Zinsen gelten als am Tag der Gutschrift angeschafft (keine Meldung „Anschaffungstag fehlt“ mehr). Ein Verkauf mit Steuerabzug über ein Währungskonto braucht den Devisenkurs; ohne ihn bleibt der EUR-Wert offen statt den Erlös vor Steuer anzusetzen.
- Gewinne aus bestandsgeschützten Alt-Anteilen werden für die Erklärung je Verkauf ohne Saldierung mit Verlusten ausgewiesen (Rn. 30), in der Anlage KAP wie in der Anlage KAP-INV.
- Sparer-Pauschbetrag: Die Formularhilfe nennt jetzt den über Freistellungsaufträge bereits in Anspruch genommenen Betrag (gegebenenfalls 0), nicht den offenen Rest, und erscheint auch bei reiner Anlage KAP-INV.
- Bankumbenennung eines eigenständigen Währungskontos nimmt die Bescheinigungen offener Jahre mit wie bei Depots; trägt noch ein anderes Depot oder Konto der Person den alten Namen, bleiben sie.
- Ein eingetragener fiktiver Gewinn der verkauften Stücke hebt keine andere Sperre mehr auf (etwa eine Verschmelzung mit Wechsel der Teilfreistellung).
- Schenkungsteuer: Ist bei einem Vorerwerb die tatsächlich festgesetzte Steuer erfasst, zählt sie für die Zusammenrechnung vor der eigenen Rechnung, auch in einem Jahr, das Depotklar selbst rechnet.
- Erklärung: eigener Abschnitt „Verlust ohne Teilfreistellung (BFH vom 25.11.2025)“ mit Betrag je Fondsart und wie viel die Einkünfte ohne Erläuterung zu hoch wären – auf der Steuerseite, in Excel und im PDF. Abschnitt und Hinweis erscheinen nur bei Fonds mit Teilfreistellung; bei sonstigen Fonds ändert das Urteil nichts.
- Speichern: „Verbindung lösen“ und „Datei verbinden“ speichern einen nicht gespeicherten Stand sofort nach, statt die Meldung nur zu löschen. Sperrt Depotklar ohne Rückfrage (automatisch oder nach dem Sicherungsdialog), bewahrt es einen nicht gespeicherten Stand verschlüsselt auf, solange der Browser offen ist, und bietet ihn beim nächsten Öffnen an.
- Excel mit gewähltem Wertpapier: Schaltfläche und Hinweis sagen, dass Steuer, Schenkungen und Protokoll die ganze Person enthalten.

Auswirkung auf Bestände, Geld und Steuerwerte: Gespeicherte Daten ändern sich nicht. Neu gerechnet werden: Verkäufe von Fonds mit akkumulierten ausschüttungsgleichen Erträgen (Steuer laut Modell sinkt, die erwartete Erstattung steigt), Vorabpauschalen im Jahr einer Verschmelzung und bei zwei Ausschüttungen kurz nacheinander, Währungsgewinne bei mehreren übernommenen Beständen und Gutschriften aus Verkäufen, Formularwerte für Alt-Anteile und Schenkungsteuer mit erfasstem Bescheidwert. Verkäufe mit Steuerabzug über ein Währungskonto ohne Kurs werden offen, bis der Kurs erfasst ist. Regelpaket DE-privat-2018-2026.11.

Grenzen: Ob die Bank den nachgeholten Steuerabzug erstattet, hängt vom Nachweis der früheren Versteuerung ab; Depotklar kennt ihn nicht. Bei einer Verschmelzung im Jahr zählen Ausschüttungen des übernehmenden Fonds aus der Zeit vor der Verschmelzung nur, wenn sie in Depotklar erfasst sind. Der aufbewahrte Stand nach einer Sperre geht mit dem Schließen des Browsers verloren; davor fragt der Browser nach. Eine stabile Bankkennung statt des Namens gibt es weiter nicht.

Tests: je Befund eine Gegenprobe mit nachgerechneten Sollwerten – unter anderem 2.400 € Einkünfte und 633,00 € Steuer statt 3.400 € und 896,75 € (263,75 € erwartete Erstattung), Vorabpauschale 89,25 € bei Verschmelzung zum 01.07. und 50,00 € zum 31.12., 0 € bei zwei Ausschüttungen im selben Depot und 78,50 € je Depot bei derselben in zwei Depots, Währungsgewinn 100 € nach FIFO der übernommenen Bestände, 0 € nach Gutschrift 180 USD mit Kurs, 50 € steuerbar nach Gutschrift aus Verkauf, 50 €/35 € Ausweis bei +50/−50 €, Sparer-Pauschbetrag-Text, Bescheinigung mit dem Konto umbenannt, Sperre bleibt nach Bankwert, Schenkungsteuer 55.000 € mit 60.000 € angerechnet, BFH-Abschnitt 50 €/15 €, Speicherpfade und Exporthinweis.

## 2026-11-04 - Depotklar 4.13.1: Quellensteuer und Eingabefehler

Anlass: Durchsicht auf steuerliche Fehler mit Blick auf Auslandsdepots – Quellensteuer gilt bei Kanzleien als häufige Fehlerquelle. Ohne neue Auswahlfelder.

Verhalten:
- Quellensteuer auf Dividenden und Ausschüttungen: Das Formular sagt, dass nur der anrechenbare Teil gehört – nach den meisten Doppelbesteuerungsabkommen höchstens 15 % (Schweiz: 35 % einbehalten, 15 % anrechenbar) – und dass der Bruttobetrag vor Quellensteuer und Steuern gilt. Bei Fonds zählt nur Quellensteuer auf die Ausschüttung selbst. Die Vorschau zeigt den Anteil am Bruttobetrag; über 15,5 % weisen Vorschau und Steuerseite auf die Erstattung im Quellenstaat hin. Angerechnet wird weiter höchstens 25 % des steuerpflichtigen Ertrags.
- Steuerseite: Mindern Verluste oder der Sparer-Pauschbetrag die Erträge, nennt ein Hinweis, wie viel Quellensteuer anrechenbar wäre, wenn das Finanzamt sie anteilig auch auf die ausländischen Erträge verteilt, und um wie viel die Steuer dann höher ist (§ 32d Abs. 5 S. 3 EStG; BFH vom 23.11.2021, VIII R 22/18: Verluste ohne Wahlrecht vor der Anrechnung verrechnet). Die Rechnung selbst bleibt: Verluste und Sparer-Pauschbetrag gehen zuerst auf die übrigen Erträge.
- Kontrolle je Abrechnung: Beträgt der Gewinn laut Verkaufsabrechnung 30 % des Erlöses (nach oder vor Gebühren) und weicht von der eigenen Rechnung ab, erklären Vorschau, steuerliches Blatt und Steuerseite die Ersatzbemessungsgrundlage (§ 43a Abs. 2 S. 7 EStG) – der Bank fehlten die Anschaffungskosten, etwa nach einem Übertrag; korrigiert wird über die Steuererklärung.
- Wertpapierart: Klingt ein Name nach Fonds (ETF, UCITS, Fonds, Fund, bekannte Anbieter), die Art ist aber Aktie, oder nach Anleihe, Zertifikat, ETC oder Derivat, die Depotklar nicht rechnet, steht ein Hinweis in den Stammdaten, in der Vorschau und – bei Bestand oder Erträgen im Jahr – auf der Steuerseite. Der Stammdaten-Hinweis nennt, dass ETFs Fonds sind, welche Wertpapiere nicht gerechnet werden und dass ein tatsächlicher Wechsel der Fondsart (§ 22 InvStG) nicht abgebildet ist.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Alle Änderungen sind Hinweise; Steuer, Anrechnung und Bestände rechnen wie bisher. Regelpaket DE-privat-2018-2026.10 mit den neuen Quellen (BZSt-Übersicht 2024, § 43a EStG, BFH VIII R 22/18).

Grenzen: Depotklar kennt den Quellenstaat nicht und prüft nur gegen den üblichen Satz von 15 %; Staaten mit höherem anrechenbarem Satz oder ohne Abkommen lösen den Hinweis ebenfalls aus. Wie das Finanzamt Verluste und Sparer-Pauschbetrag auf in- und ausländische Erträge verteilt, ist nicht amtlich festgelegt; der Hinweis nennt die anteilige Verteilung als Gegenrechnung. Die Art erkennt Depotklar nur am Namen. Quellensteuer auf Zinsen lässt sich weiter nicht erfassen.

Tests: Schweizer Dividende 1.000 € mit 350 € eingetragen – angerechnet 250 €, Hinweis auf 35 % und 15 %; 153 € (15,3 %) ohne Hinweis. Dividende 3.000 € mit 450 € Quellensteuer, Zinsen 3.000 €, Verlustvortrag 3.000 €: 450 € angerechnet, Steuer 52,75 €; anteilig 250 € und 211,00 € mehr. Verkauf 10.000 € mit 8.000 € Anschaffung, Bank 3.000 € – Ersatzbemessungsgrundlage; mit Kurs 100,10 € und 10 € Gebühren 3.003 € ebenso; 2.500 € ohne Hinweis. Namensprüfung für ETF als Aktie, Anleihen-ETF, ETC, Xetra-Gold, Bundesanleihe, Zertifikat, Turbo und unauffällige Aktiennamen; Hinweis in Stammdaten, Vorschau und Steuerseite.

## 2026-11-04 - Depotklar 4.13: Lose sichtbar, Vorabpauschale je Anteil

Anlass: Wie FIFO angewendet wird – welche Tranchen noch da sind, was schon abgegangen ist und aus welchen ein Verkauf stammt – war nur beim Verkauf auf der Steuerseite unter „Rechenweg je Los“ zu sehen. Für die Vorabpauschale liegen oft Steuerinformationen des Fonds mit dem Betrag je Anteil vor; Depotklar konnte sie nur aus Kursen rechnen oder den Bankwert übernehmen.

Verhalten:
- Jahresübersicht: Unter jedem Stand 31.12. aufklappbar „Lose zum 31.12. in FIFO-Reihenfolge“ mit Nummer, Erwerb, Herkunft (Kauf, Bestand übernommen, Schenkung oder Erbschaft von …, Übertrag, Verschmelzung), Stück – mit „von …“, wenn schon ein Teil abgegangen ist –, Wert und Wert je Stück der jeweiligen Betrachtung. Verkauf und Schenkung nennen an der Zeile, aus welchen Losen sie stammen. Excel listet die Lose zum Ende des Zeitraums und die Herkunft eines Abgangs im Hinweis; das PDF übernimmt das.
- Kursseite: Unter den beiden Kursen eines Fondsjahres das optionale Feld „VAP/Anteil“ für die Vorabpauschale je Anteil laut Steuerinformation (vor Teilfreistellung). Sie gilt für alle Depots mit dem Fonds, wird für Käufe im Jahr gezwölftelt und enthält die Ausschüttungen. Rangfolge: Bankwert, Wert je Anteil, Rechnung aus Kursen. Die Kontrolle je Abrechnung vergleicht den Bankwert mit dem Wert je Anteil. Erfassen, Ändern und Löschen stehen im Protokoll unter „Kurse“ und sind gesperrt wie ein Kurs, sobald das Zuflussjahr abgeschlossen ist.

Auswirkung auf Bestände, Geld und Steuerwerte: Die Lose-Anzeige ändert nichts. Ein erfasster Wert je Anteil ersetzt die Vorabpauschale aus Kursen und damit die steuerliche Basis und die Steuer des Zuflussjahres; ohne Eintrag bleibt alles wie bisher.

Grenzen: Die Ausgangsstückzahl („von …“) gilt je Depot – nach einer Schenkung zählt beim Empfänger die geschenkte Menge, nach Split und Verschmelzung die umgerechnete. Der Wert je Anteil ist nur für Jahre mit positivem Basiszins und nicht für das laufende Jahr erfassbar; ein Split im Jahr wird dabei nicht umgerechnet. Datenformat 4 bleibt; ältere Versionen lesen den neuen Datenbereich nicht und rechnen dann aus Kursen.

Tests: Zwei Käufe (150 und 200 Stück), Verkauf von 200 – aus 2019 alle 150, aus 2020 50; verbleibend „150 von 200“; Schenkung von 60 Stück als eigenes Los beim Kind; Split verdoppelt Rest und Ausgang; Lose je Jahresende über drei Jahre; Anzeige und Excel. Auslands-Immobilienfonds mit 0,1565 € je Anteil wie im Fund-Reporting-Blatt: 1.000 Stück ganzjährig und 600 Stück ab März ergeben 156,50 € + 78,25 € = 234,75 €, steuerpflichtig 46,95 €; Kontrolle gegen den Bankwert; Prüfungen für Jahr, Fondsart, Doppelung und Sperre; Feld auf der Kursseite.

## 2026-11-02 - Depotklar 4.12.1: Fehlerquellen bei Eingabe und Kontrolle

Anlass: Durchsicht nach Stellen, an denen Eingaben oder Anzeigen zu falschen Schlüssen führen können – ohne neue Funktionen.

Verhalten:
- Kontrolle je Abrechnung: Unterschiede bis 0,05 € oder bis 1 € bei höchstens 0,1 % des Betrags heißen „Rundung“ (Banken rechnen etwa die Vorabpauschale je Anteil). Passt ein eingetragener Veräußerungsgewinn zum Gewinn nach statt vor Teilfreistellung, weisen Vorschau, Blatt, Steuerseite und Excel auf die Verwechslung hin.
- „Noch steuerpflichtige Alt-Erträge“: Das Formular erklärt den Begriff und setzt bei deutschen Fonds (ISIN DE) „keine“ vor – es gibt sie nur bei ausländischen thesaurierenden Fonds. Verwechslungen mit den bereits versteuerten Thesaurierungen würden den Gewinn beim Verkauf zu hoch machen.
- Dividende einer Aktie: Hinweis, eine Einlagenrückgewähr nicht als Dividende zu buchen; die Rechenlogik und der KI-Einstieg nennen Kapitalmaßnahmen bei Aktien ausdrücklich als nicht abgebildet.
- Steuerabzug: Hinweis, dass er an den Abrechnungen nicht nötig ist, wenn die Jahressteuerbescheinigung erfasst wird – sie hat Vorrang.
- Steuerseite: Bei einer erwarteten Nachzahlung und in der Jahresrechnung der Hinweis, dass ohne Günstigerprüfung gerechnet wird; bei Kindern mit NV-Bescheinigung kann die Steuer niedriger sein.
- Demodaten: Die Jahressteuerbescheinigung 2025 der Hausbank passt jetzt zu den Demo-Vorgängen (Freistellungsauftrag bei der Direktbank, dort nur teilweise genutzt) – statt einer unerklärten Nachzahlung von 447,85 € eine Erstattung von 114,60 €.

Auswirkung auf Bestände, Geld und Steuerwerte: keine für erfasste Daten. Die Vorbelegung „keine“ gilt nur für neue Eingaben deutscher Fonds.

Grenzen: Die Rundungsgrenze ist eine Annahme über die Rechengenauigkeit der Banken; größere Unterschiede bleiben Abweichungen.

Tests: Vorabpauschale 160,32 € gegen 160,30 € als Rundung, 161 € als Abweichung; Fondsverkauf mit Gewinn nach Teilfreistellung (1.287,78 € statt 1.839,68 €) erkannt; Vorbelegung und Erklärung der Alt-Erträge für deutschen und irischen Fonds; Hinweise bei Dividende und Steuerabzug; Nachzahlungshinweis; Demo-Erstattung 114,60 €.

## 2026-11-02 - Depotklar 4.12: Kontrolle je Abrechnung

Anlass: Ob die Bank einen einzelnen Verkauf oder eine Vorabpauschale richtig berechnet hat, ließ sich nur von Hand prüfen. Den Gewinn laut Verkaufsabrechnung konnte man nicht erfassen; den Wert der Vorabpauschale aus den Jahreskursen zeigte nur die Vorschau beim Erfassen.

Verhalten: Beim Verkauf ab 2018 gibt es das optionale Feld „Veräußerungsgewinn laut Abrechnung“ – vor Teilfreistellung, Verlustverrechnung und Freistellungsauftrag, bei Fonds aus 2009 bis 2017 einschließlich fiktivem Gewinn 2017. Depotklar vergleicht ihn mit dem eigenen Gewinn vor Teilfreistellung: in der Vorschau, an der Zeile im steuerlichen Blatt („Abrechnung … €, Depotklar … € (Abweichung … €)“) und auf der Steuerseite in der neuen Tabelle „Kontrolle je Abrechnung“. Die Vorabpauschale laut Bank nennt im Blatt und in derselben Tabelle den Wert aus den Jahreskursen und die Abweichung, wenn Kurse erfasst sind. Excel und das Steuer-PDF enthalten die Tabelle. Ohne Bankwert erinnert die Steuerseite an das Feld.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Bankwerte dienen nur der Kontrolle; gerechnet wird weiter mit dem eigenen Gewinn und – wie bisher – mit der Vorabpauschale laut Bank.

Grenzen: Verglichen werden Bemessungsgrundlagen, nicht der Steuerabzug einer einzelnen Abrechnung – den verrechnet die Bank über das Jahr mit Freistellungsauftrag, Verlusttöpfen und Quellensteuer; er wird je Bank und Steuerart im Jahr geprüft. Weist die Bank nur den Gewinn nach Teilfreistellung aus, ist er vor dem Eintragen hochzurechnen. Verkäufe vor 2018 haben weiter den steuerlichen Gewinn laut Bank (altes Recht).

Tests: Aktie 1.000 € gekauft, 1.500 € verkauft – Abrechnung 500 € „ebenso“, 520 € mit Abweichung 20 €; Aktienfonds 100 Stück, Kurs 100 → 120 €, Basiszins 2024 2,29 % – Vorabpauschale 160,30 € „ebenso“, Bank 161 € mit Abweichung 0,70 €. Steuerseite, Excel, Formular mit Vorschau, Hinweis ohne Bankwert, Feld nur ab 2018.

## 2026-11-02 - Depotklar 4.11.1: Doku und Hinweistexte nachgezogen

Anlass: Durchsicht der Dokumentation nach 4.9 bis 4.11. Einige Stellen nannten noch „Zinsen“, wo seit 4.9.1 alle Erträge stehen; der KI-Einstieg verwies nicht auf die Kontrolle der Bank, das Zielbild nicht auf Thesaurierung und Steuerabzug je Steuerart.

Verhalten: Anleitung und Hinweis der Schaltfläche „PDF Übersicht“ nennen Erträge statt Zinsen. Der KI-Einstieg führt „Kontrolle der Bank“ als häufigen Fall mit Verweis auf die Kapitel. Das Zielbild nennt Thesaurierung nach altem Recht und den Steuerabzug je Steuerart.

Auswirkung auf Bestände, Geld und Steuerwerte: keine.

Grenzen: keine neuen.

Tests: Dokumentationsprüfung und vollständige Testsuite.

## 2026-11-02 - Depotklar 4.11: Steuerabzug je Steuerart

Anlass: Der Steuerabzug der Bank ließ sich bei Verkauf, Ausschüttung, Zinsen, Vorabpauschale und Thesaurierung nur als Summe erfassen. Abrechnungen und Jahressteuerbescheinigung weisen Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer getrennt aus, und in der Familie gab es Kirchenaustritte – die Summe zeigt nicht, welche Steuer abweicht. Außerdem standen Thesaurierungen nach altem Recht sowohl in beiden Blättern als auch unter den Erträgen, die Vorabpauschale aber nur im Blatt.

Verhalten: Alle fünf Formulare fragen Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer einzeln ab; leere Felder zählen als 0, sobald eines ausgefüllt ist, beim Verkauf sind Erstattungen negativ. Gespeichert werden die drei Werte; ältere Einträge mit nur der Summe bleiben gültig und werden im Formular angezeigt, bis die drei Felder ausgefüllt sind. Die Steuerseite zeigt je Bank die drei Steuerarten und – wenn sie bei jeder Bank einzeln bekannt sind, aus Bescheinigung oder jeder Abrechnung – je Steuerart einbehalten, laut Modell und Differenz. Excel nennt die drei Werte bei jedem Vorgang und im Steuerjahr. Die Erträge-Liste zeigt weiter die Summe, die Aufteilung als Tooltip. Thesaurierungen stehen nicht mehr unter den Erträgen, sondern wie die Vorabpauschale nur in den Blättern; ihr Steuerabzug steht als Hinweis an der Zeile. Die Demodaten tragen die Aufteilung.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Modellsteuer und die Summe des Abgleichs bleiben gleich; neu ist nur der Vergleich je Steuerart.

Grenzen: Der Vergleich je Steuerart entfällt, solange bei einer Bank ein Vorgang nur die Summe trägt; dann hilft die Jahressteuerbescheinigung, die die Steuerarten ohnehin nennt. Die Jahresübersicht und das PDF zeigen je Ertrag nur die Summe.

Tests: Dividende 1.000 € bei Kirchenaustritt Ende März (9 %, drei Monate) und verbrauchtem Pauschbetrag – Modell 248,60 € KapESt, 13,67 € Soli, 5,59 € KiSt; Bank 244,50 €, 13,44 €, 22,00 €; Differenz je Steuerart −4,10 €, −0,23 €, +16,41 €, gesamt +12,08 €. Dieselbe Dividende nur mit Summe: Abgleich gesamt, ohne Steuerarten, mit Bescheinigung wieder je Steuerart. Pflichtprüfungen (alle drei oder keine, nicht zusammen mit der Summe, Erstattung nur beim Verkauf, nur bei Vorgängen mit Steuerabzug); Formular mit leerer Kirchensteuer und mit älterer Summe; Excel-Vorgänge; Thesaurierung nicht mehr unter den Erträgen, Steuerabzug an der Zeile. Im Browser: Formular, Steuerseite und Erträge-Liste.

## 2026-11-02 - Depotklar 4.10: Thesaurierung nach altem Recht

Anlass: Der Vergleich mit einer bisherigen Excel-Übersicht für einen thesaurierenden Fonds aus 2013 zeigte, dass sich die ausschüttungsgleichen Erträge 2013 bis 2017 nicht erfassen ließen. Steuerlich ab 2018 war das ohne Folgen, weil sie im fiktiven Gewinn der Bank stecken. Die Jahre bis 2017 und die wirtschaftliche Betrachtung wichen aber von der Buchhaltung ab, und der „rechnerische“ fiktive Gewinn lag um die Thesaurierungen zu hoch – der Bankwert ließ sich so nicht kontrollieren.

Verhalten: Neuer Vorgang „Thesaurierung (altes Recht)“ für einzeln erfasste Fonds bis 31.12.2017: Datum, ausschüttungsgleiche Erträge der Position, optional der Steuerabzug; eine spätere Korrektur der Fondsgesellschaft als eigener Vorgang, auch negativ. Der Betrag wird nach Stück auf die Lose im Depot verteilt und erhöht den Anschaffungswert (wie in der Buchhaltung) und die steuerliche Basis bis zum 31.12.2017 (§ 8 Abs. 5 InvStG 2004); er steht außerdem unter den Erträgen des Jahres. Schenkungen und Teilverkäufe nehmen ihren Anteil mit. Der rechnerische fiktive Gewinn 2017 ist jetzt Kurs × Stück − Anschaffungskosten − erfasste Thesaurierungen; die Zeile „Fiktive Veräußerung 31.12.2017“ und die Vorschau nennen ihn neben dem Bankwert, mit Abweichung. Vereinfacht gerechnete Fondsverkäufe vor 2018 ziehen die Thesaurierungen ab. Die Hinweise bei „Bestand übernehmen“ und „Übergang 2017/2018“ nennen die Thesaurierungen.

Auswirkung auf Bestände, Geld und Steuerwerte: ohne neue Vorgänge keine. Mit Thesaurierungen steigen der wirtschaftliche Buchwert und bis Ende 2017 die steuerliche Basis; der wirtschaftliche Gewinn späterer Verkäufe sinkt entsprechend. Die steuerlichen Werte ab 2018 bleiben gleich, weil der fiktive Gewinn weiter von der Bank kommt; die Basis springt zum 31.12.2017 dann nur noch um den fiktiven Gewinn.

Grenzen: Keine Steuerrechnung für Jahre vor 2018; der Steuerabzug auf Thesaurierungen ist nur eine Information. Zwischengewinne und andere Feinheiten des alten Rechts bildet Depotklar nicht ab – maßgeblich bleibt der fiktive Gewinn laut Bank, eine Abweichung ist ein Prüfhinweis. Die Verlustregel nach BFH vom 25.11.2025 rechnet bei einzeln erfassten Fonds weiter mit dem Kaufpreis ohne Thesaurierungen. Für Bestände, die erst zum 01.01.2018 übernommen werden, gibt es keine Thesaurierungen; ihr Anschaffungswert ist der Wert laut Buchhaltung.

Tests: Beispiel aus der Excel-Übersicht – Kauf 2013 von 7.900 Stück für 797.426 €, Thesaurierungen 2013 bis 2017 von 88.577,97 €: Buchwert und Basis 01.01.2017 855.141,50 €, Buchwert 31.12.2017 886.003,97 €, Basis ab 2018 1.149.213 €, fiktiver Gewinn 263.209,03 € laut Bank „rechnerisch ebenso“; ohne Thesaurierungen Abweichung −88.577,97 €. Verkauf 2024: wirtschaftlicher Gewinn 377.996,03 €, steuerpflichtig unverändert 343.559,93 €. Schenkung, negative Korrektur und Teilverkauf vor 2018; Pflichtprüfungen (nur Fonds, nur bis 2017, nicht null, nur mit Bestand); Formular und Hinweis beim Übergang. Im Browser: Erfassung, Jahresübersicht 2017 und Vorschau des Übergangs.

## 2026-11-02 - Depotklar 4.9.1: Erträge je Depot in der Jahresübersicht

Anlass: Eine gebuchte Dividende war in der Jahresübersicht nicht zu finden. Ausschüttungen und Dividenden standen nur auf der Steuerseite und in der Excel-Liste der Vorgänge; die Jahresübersicht zeigte je Depot nur die Zinsen.

Verhalten: Der Block unter den beiden Blättern heißt jetzt „Erträge“ und zeigt je Depot Zinsen, Ausschüttungen und Dividenden mit Bruttobetrag, Teilfreistellung, steuerpflichtigem Teil, Quellensteuer und Steuerabzug, mit Summe; ein Klick öffnet den Vorgang. Mit gewähltem Wertpapier stehen dort nur dessen Ausschüttungen. PDF-Übersicht und Excel zeigen denselben Block.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Erträge ändern weiter keinen Bestand – weder den Anschaffungswert noch die steuerliche Basis; die Vorabpauschale bleibt im steuerlichen Blatt.

Grenzen: keine neuen.

Tests: Ausschüttung 4.000 € des Mischfonds 2025 mit 600 € Teilfreistellung und 3.400 € steuerpflichtig im Block, Bestandsprobe unverändert, Dividende mit Quellensteuer 12,66 €, Wertpapierfilter über zwei Jahre, Excel-Zeilen mit Summe. Im Browser: Block in der Übersicht 2025, Klick öffnet den Vorgang.

## 2026-11-02 - Depotklar 4.9: Währungskonten ohne Depot

Anlass: Währungskonten sollen ein eigenes Feature sein, etwa ein USD-Festgeld bei einer Bank, bei der die Familie kein Depot hat. Bisher gehörte jedes Konto zu einem Depot, aus dem Inhaber und Bank kamen.

Verhalten: In den Stammdaten wählt „Gehört zu“ entweder ein Depot oder eine Person mit eigenem Konto ohne Depot; ein eigenständiges Konto trägt Bank und Auslandskennzeichen selbst. Bewegungen buchen ohne Depot, Zinsen auf ein Währungskonto ebenfalls („+ Zinsen“ beim Konto oder „Ohne Depot“ im Formular). Währungsgewinne und Zinsen zählen für den Inhaber des Kontos, im Bankabgleich für dessen Bank; ein Konto bei einer ausländischen Bank zählt ohne deutschen Steuerabzug und liefert seine Werte für die Anlage KAP. Jahresabschluss und Sperren folgen dem Inhaber; Inhaber, Währung und Kontoart bleiben fest, sobald Buchungen bestehen, Bank und Auslandskennzeichen, sobald abgeschlossene Jahre betroffen sind. Excel und PDF-Übersicht zeigen eigenständige Konten je Person auf einem eigenen Blatt. Im Feld zur Quellensteuer stand noch, Fondsquellensteuer werde „in der Regel nicht“ angerechnet; der Hinweis folgt jetzt der Regel seit 4.8.

Auswirkung auf Bestände, Geld und Steuerwerte: keine für bestehende Konten; sie bleiben beim Depot.

Grenzen: Konten in Euro führt Depotklar weiter nicht. Eine umbenannte Bank eines eigenständigen Kontos nimmt Bankbescheinigungen nicht automatisch mit.

Tests: Konto ohne Depot mit Inhaber und Bank, Prüfregeln für Bewegungen und Zinsen ohne Depot; Währungsgewinn 30 € und Zinsen 20 € für den Inhaber und die Bank des Kontos, Abgleich mit Bescheinigung ohne Differenz, ausländische Bank ohne Steuerabzug; Jahresabschluss, fester Inhaber, Person mit Konto nicht löschbar; Stammdaten, Kontenseite mit „+ Zinsen“, Formular „Ohne Depot“, Excel-Blatt und PDF-Seite. Im Browser per Maus: Konto ohne Depot angelegt, Einzahlung und Zinsen gebucht, Zinsen auf der Steuerseite bei der Bank des Kontos.

## 2026-11-01 - Depotklar 4.8: Korrekturen aus dem Prüfbericht vom 01.11.2026

Anlass: Ein externer Prüfbericht zu 4.7.1 nannte 25 Befunde. Jeder wurde im Code und an amtlichen Quellen nachgeprüft; bestätigt waren Rechenfehler, fehlende Schutzprüfungen und falsche Hinweise zur Steuererklärung. Übernommen wurde nichts ungeprüft; wo die vorgeschlagene Korrektur nicht trug, gilt eine eigene (Ausschüttungen je Fonds statt je Los, fiktiver Gewinn nur bei uneindeutigen Teilverkäufen).

Verhalten:
- Bankabgleich je Bank: Bescheinigung einer Bank verdrängt nicht mehr die Einzelwerte anderer Banken; eine unvollständige Bescheinigung, eine Abrechnung ohne Steuerabzug oder eine nur berechnete Vorabpauschale lassen den Abgleich offen. „Vorabpauschale laut Bank“ kennt den Steuerabzug, ein Verkauf auch eine Erstattung (negativ).
- Quellensteuer auf Fondsausschüttungen wird angerechnet, höchstens 25 % des Ertrags nach Teilfreistellung (BMF vom 14.05.2025, Rz. 148); bisher wurde sie mit null angesetzt.
- Vorschläge der Jahresdaten: Verlustvorträge bleiben nach einem Jahr ohne Erträge erhalten, unbekannte bleiben leer; der Rest-Freibetrag wird bei unvollständiger Historie nicht mehr mit 100.000 € vorbelegt. Leere Pflichtfelder werden beim Speichern nicht mehr zu 0.
- Währungskonten: Nach einem steuerneutralen Übertrag zählt der ursprüngliche Anschaffungstag für die Reihenfolge (BMF Rz. 131). Kauf und Verkauf über ein Konto nehmen einen Devisenkurs an, wenn die Bank Steuer in der Fremdwährung abzieht.
- Vorabpauschale: Ein Split im Jahr rechnet Kurse und Ausschüttungen auf die neuen Stücke um; Ausschüttungen zählen je Anteil des Fonds, gleich in welchem Depot (§ 18 Abs. 1 InvStG), auch nach Übertrag oder Schenkung. Doppelte Bankwerte werden beim Erfassen abgelehnt, Bankwerte ohne Bestand als offen gemeldet.
- Fonds 2009 bis 2017: Bei mehreren Käufen und Teilverkauf verlangt Depotklar den fiktiven Gewinn 2017 laut Verkaufsabrechnung; der Rest der Bank geht auf die übrigen Stücke.
- Schutzprüfungen für neue Eingaben: Erwerbsdatum und Erwerbsgruppe müssen zusammenpassen; Verschmelzung nur bei gleicher Teilfreistellung (§ 22 InvStG). Bestehende Daten mit solchen Mängeln bleiben lesbar und werden als offen oder nicht unterstützt gemeldet.
- Bank und Auslandskennzeichen eines Depots sind gesperrt, sobald sie abgeschlossene Jahre tragen; eine umbenannte Bank nimmt die Bescheinigungen offener Jahre mit.
- Nach vollständigem Verkauf steht der Bestand mit null, auch bei unbekanntem Anschaffungswert.
- Hinweise zur Erklärung nach ELSTER-Anleitung 2025: Gewinne bestandsgeschützter Alt-Anteile deutscher Depots in die Anlage KAP (nicht KAP-INV), Rest-Freibetrag in der Anlage Sonstiges, angerechnete Quellensteuer Zeile 40, nicht angerechnete Zeile 41. Werte gemeinsam für Steuerseite, Excel und PDF.
- Excel: Mit gewählter Person enthalten Schenkungen und Protokoll nur, was sie betrifft; Währungsgewinne heißen nicht mehr „undefined“. Im steuerlichen Blatt nennt ein Verkauf von Fonds 2009 bis 2017 den fiktiven Gewinn 2017, der zur Spalte Gewinn hinzukommt.
- Schenkungsteuer: Enkel, deren Elternteil verstorben ist, erhalten 400.000 € Freibetrag (§ 16 Abs. 1 Nr. 2 ErbStG).
- Startseite nennt die aktuelle Version; der Sperrbildschirm zeigt die Marke wieder dunkel.

Auswirkung auf Bestände, Geld und Steuerwerte: Gespeicherte Daten ändern sich nicht. Neu gerechnet werden betroffene Fälle: Steuer bei Fondsausschüttungen mit Quellensteuer sinkt; Vorabpauschalen in Jahren mit Split oder vor einem Übertrag ausgeschütteter Fonds ändern sich; der Bankabgleich kann offen werden, bis Bescheinigungen erfasst sind; Teilverkäufe mehrerer Fondskäufe 2009 bis 2017 brauchen den Wert der Abrechnung.

Grenzen: Dieselbe Ausschüttung in mehreren Depots wird nur innerhalb von sieben Tagen als eine erkannt. Alt-Erträge des alten Rechts werden weiter nach Stück verteilt. Der Bankabgleich ersetzt keine Prüfung der Bescheinigungen.

Tests: neue Gegenproben je Befund mit nachgerechneten Sollwerten, unter anderem 300 € Einbehalt aus Bescheinigung und Einzelwerten zweier Banken, Vorträge 12.000/500 € nach ertraglosem Jahr, USD-Kosten 50 statt 100 €, Vorabpauschale 178,50 € nach Split und 78,50 € nach Übertrag, 270 € und 110 € bei Teilverkäufen mit Abrechnungswert, 1.275,05 € bei bestätigter Vorabpauschale; angepasste Tests für Fonds-Quellensteuer (25 € statt 175 € Kapitalertragsteuer) und den Bankabgleich der Demo.

## 2026-11-01 - Depotklar 4.8: Depots ohne deutschen Steuerabzug

Anlass: Depotklar soll Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer gerade für Depots bei ausländischen Banken berechnen, für die keine deutsche Bank Steuer einbehält. Bisher verlangte Depotklar auch dort eine Verlustbescheinigung und kannte die Anlage KAP-INV nur für Alt-Anteile.

Verhalten: Ein Depot lässt sich als „Ausländische Bank – kein deutscher Steuerabzug“ kennzeichnen. Seine Erträge gehen vollständig in die Jahresrechnung, der Bankabgleich zählt dort null Euro Einbehalt, Verluste brauchen keine Verlustbescheinigung. Die Steuerseite liefert für diese Depots die Werte für die Anlage KAP (ausländische Kapitalerträge, darin Aktiengewinne und -verluste, Verluste ohne Aktien, noch nicht angerechnete ausländische Steuer) und für die Anlage KAP-INV je Fondsart (Ausschüttungen einschließlich ausländischer Steuer, Vorabpauschalen, Veräußerungsgewinne, darin bestandsgeschützte Alt-Anteile, fiktive Gewinne 2017). Vorabpauschalen dieser Depots mindern einen späteren Verkaufsgewinn nur, wenn sie in der Erklärung des Zuflussjahres angegeben wurden oder die Kapitalerträge dieses Jahres im Sparer-Pauschbetrag blieben; dafür gibt es in den Jahresdaten die Bestätigung „Erträge … in der Steuererklärung angegeben“.

Auswirkung auf Bestände, Geld und Steuerwerte: keine für bestehende Depots, solange sie nicht gekennzeichnet werden.

Grenzen: Zeilennummern stammen aus den Formularen 2025. Den Sparer-Pauschbetrag für Zeile 17 ermittelt Depotklar nicht gesondert. Wird ein Depot mit Vorabpauschalen später ins Inland übertragen, bleibt der Nachweis der erklärten Vorabpauschalen beim Anwender.

Tests: Verlust bei ausländischer Bank ohne Bescheinigung ermittelt, bei deutscher Bank weiter offen; Werte für Anlage KAP und KAP-INV; Vorabpauschale 2023 aus einem Auslandsdepot erst nach Bestätigung oder im Sparer-Pauschbetrag abziehbar, beim deutschen Depot sofort.

## 2026-11-01 - Depotklar 4.8: Kirchensteuer bei Ein- und Austritt

Anlass: Kirchenaustritte kommen in der Familie vor; bisher war ein Wechsel im Jahr nur als Grenze beschrieben, aber weder erfassbar noch gesperrt.

Verhalten: In den Jahresdaten lässt sich „Austritt: pflichtig bis einschließlich Monat …“ oder „Eintritt: pflichtig ab Monat …“ wählen. Die Kirchensteuer wird gezwölftelt, auch für k in der Formel der Kapitalertragsteuer (BMF vom 14.05.2025, Rz. 133). Nach einem Austritt schlägt Depotklar für das Folgejahr keine Kirchensteuer vor.

Auswirkung auf Bestände, Geld und Steuerwerte: nur für Jahre mit erfasstem Ein- oder Austritt.

Grenzen: Ein- und Austritt im selben Jahr sind nicht abgebildet. Der Monat richtet sich nach Landesrecht und der Austrittsbescheinigung; die Bank behält bis zur nächsten Abfrage weiter Kirchensteuer ein – der Unterschied erscheint als Erstattung.

Tests: 10.000 € bei 9 % und Pflicht bis Januar: Kapitalertragsteuer 2.495,32 €, Soli 137,24 €, Kirchensteuer 18,71 €; Vorschlag nach Austritt ohne Kirchensteuer; ungültige Kombinationen abgelehnt.

## 2026-11-01 - Depotklar 4.8: Mehrere Tresore, Tresordatei und sicheres Speichern

Anlass: Der Prüfbericht zeigte, dass Sperren während einer laufenden Speicherung die letzte Änderung verlieren und eine Sicherung einen veralteten Stand enthalten konnte. Version 3.4 kannte mehrere Tresore und das Speichern in eine Datei; Version 4 hatte beides nicht übernommen, und eine eingelesene Sicherung ersetzte den Tresor im Browser.

Verhalten: Jede Änderung wird als eigener Auftrag mit dem Stand zum Zeitpunkt der Änderung gespeichert; Sperren, Sicherung und Passwortwechsel warten darauf. Ein Fehler bleibt als „Nicht gespeichert“ sichtbar, und der Browser fragt vor dem Schließen nach. Mehrere Tresore je Browser mit Name und eigenem Passwort; Auswahl beim Öffnen, „Neuen Tresor anlegen“, „Aus diesem Browser entfernen“. In Chrome und Edge lässt sich ein Tresor mit einer Datei verbinden: Jede Änderung wird auch dort verschlüsselt gespeichert, vorher prüft Depotklar, ob die Datei anderswo neuer geworden ist, und beim Öffnen gilt der neuere Stand. Eine Tresordatei oder Sicherung wird als eigener Tresor geöffnet; ist es derselbe Tresor, wird der neuere Stand übernommen. Ohne verbundene Datei erinnert Depotklar vor dem Sperren an die Sicherung, wenn sich seither etwas geändert hat. Der Tresor aus 4.0 bis 4.7 bleibt unverändert lesbar.

Auswirkung auf Bestände, Geld und Steuerwerte: keine.

Grenzen: Die Tresordatei ist für ein Gerät zur selben Zeit gedacht; bei gleichzeitiger Arbeit an zwei Geräten speichert das zweite nicht, bis es neu geöffnet wird. Firefox und Safari bieten keinen Dateizugriff; dort bleibt die Sicherungsdatei. Der Name eines Tresors liegt unverschlüsselt im Browser.

Tests: Umstellung der Browser-Datenbank von Version 1 auf 2 mit einem Tresor aus 4.7 (erscheint als „Tresor“, lässt sich öffnen und weiterspeichern), in Node und in Chromium geprüft; vor 4.8 heruntergeladene Sicherungen sind nicht vermerkt, die Anzeige sagt das. Speicherauftrag mit verzögerter Verschlüsselung: Sperren während des Speicherns verliert nichts und speichert den Stand zum Zeitpunkt der Änderung; Reihenfolge und Revisionen; Fehler, Dateikonflikt und gescheiterte Datei; zwei Tresore im Browser mit eigenem Passwort, Verwaltungsangaben und Entfernen; Tresordatei erkennen; Sperrbildschirm und Tresorseite. Im Browser per Maus: Tresor anlegen, ändern, Erinnerung beim Sperren, zweiter Tresor, Auswahl und Wiederöffnen mit erhaltenen Daten.

## 2026-11-01 - Dokumentation: Fonds 2009 bis 2017 mit Rechenbeispiel, KI-Einstieg aktualisiert

Anlass: Die Frage, ob bei einem 2012 gekauften und 2022 verkauften Fonds der Zuwachs bis 2018 voll steuerpflichtig ist, ließ sich aus der Rechenlogik nur knapp beantworten. Der Einstieg für KI-Assistenten nannte noch „keine Fremdwährungsguthaben“, obwohl es Währungskonten seit 4.1 gibt, und kannte die Vorgangsart „Übergang 2017/2018“ nicht.

Verhalten: Die Rechenlogik enthält unter „Verkauf“ ein fiktives Beispiel: Kauf 2012 für 10.000 €, Wert 31.12.2017 14.000 €, fiktiver Gewinn laut Bank 4.000 €, Vorabpauschalen 150 €, Verkauf 2022 für 18.000 € – steuerpflichtig 4.000 € ohne und 2.695 € mit Teilfreistellung, zusammen 6.695 €; dazu, warum der Bankwert gilt und wie derselbe Fonds vor 2009 behandelt würde. Der KI-Einstieg verweist auf die häufigen Fälle (Alt-Anteile vor 2009, Fonds 2009 bis 2017, BFH-Verlustregel, Vorabpauschale, Schenkungen, Währungskonten), nennt „Übergang 2017/2018“ und grenzt korrekt ab: keine Geldkonten in Euro, aber Währungskonten; keine Günstigerprüfung, keine Steuerrechnung vor 2018.

Auswirkung auf Bestände, Geld und Steuerwerte: keine; nur Dokumentation.

Grenzen: Das Beispiel ist fiktiv und rundet bewusst; echte Vorabpauschalen hängen von Kursen und Basiszins ab.

Tests: Depotklar rechnet das Beispiel mit 6.695 € steuerpflichtig und 1.155 € teilfreigestellt (fiktiver Gewinn 4.000 €, Teil ab 2018 3.850 €). Die Dokumentationsprüfung verlangt den Beispielwert in der Rechenlogik, „Übergang 2017/2018“ im KI-Einstieg und schließt die überholte Aussage zu Fremdwährungsguthaben aus.

## 2026-11-01 - Depotklar 4.7.1: Steuerseite nur für Jahre ab 2018

Anlass: Sind Vorgänge vor 2018 erfasst, reicht der Zeitraum der Übersicht bis zu ihrem Jahr zurück. Die Steuerseite folgt dem Endjahr und bot dann auch Jahre vor 2018 an: Sie meldete „außerhalb des Modells“, fragte aber trotzdem Jahresdaten ab. Die Steuerkachel der Übersicht zeigte für diese Jahre denselben Hinweis.

Verhalten: Die Jahresauswahl der Steuerseite beginnt bei 2018. Endet der Zeitraum der Übersicht vor 2018, zeigt die Steuerseite 2018; die PDF der Steuerseite folgt ihr. Die Übersicht lässt die Steuerkachel für Endjahre vor 2018 weg. Der Zeitraum der Übersicht selbst reicht unverändert bis zum ersten erfassten Vorgang zurück. Das erste Steuerjahr steht als `FIRST_TAX_YEAR` im Regelwerk.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Verkäufe vor 2018 tragen weiter den steuerlichen Gewinn laut Bank; Jahre vor 2018 wurden nie berechnet.

Grenzen: keine neuen.

Tests: Mit einem Fondskauf vom 02.05.2012 bietet die Übersicht 2012 als Anfangsjahr, zeigt für 2012–2016 keine Steuerkachel, für 2018 wieder; die Jahresliste der Steuerseite endet bei 2018; App zeigt `max(Jahr, 2018)` auf der Steuerseite und in deren PDF.

## 2026-11-01 - Depotklar 4.7: PDF-Vorschau, Ausgabe nur für das gewählte Wertpapier sichtbar

Anlass: Jedes PDF wurde sofort gespeichert, auch wenn es nur angesehen werden sollte. Bei einem gewählten Wertpapier enthielten PDF und Excel schon nur dieses, das war aber weder an den Schaltflächen noch am Dateinamen zu erkennen.

Verhalten: Alle PDF-Schaltflächen (Übersicht, je Wertpapier, Steuerjahr, Protokoll) öffnen die Datei zuerst in einer großen Vorschau mit dem PDF-Betrachter des Browsers; dort blättern und drucken, „Speichern“ legt sie mit dem gewohnten Dateinamen ab, Schließen verwirft sie. Browser ohne eingebauten Betrachter speichern wie bisher sofort. Ist unter „Wertpapier“ eines gewählt, ist das Feld blau hervorgehoben, die Hinweise der Schaltflächen sagen „Nur …“, die Dateinamen von PDF und Excel enden auf das Wertpapier, und die PDF-Übersicht nennt es im Kopf jeder Seite. PDF-Schaltflächen tragen ein Dokument-Symbol, Excel weiter das Download-Symbol. Die Sicherheitsrichtlinie des Servers erlaubt dafür Rahmen aus `blob:` (nur im Browser erzeugte Dateien); eingebettete Objekte bleiben gesperrt.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Inhalt der PDFs und Excel-Mappen unverändert.

Grenzen: Die Vorschau zeigt der Betrachter des Browsers; Aussehen und Bedienung unterscheiden sich je Browser. Der Download-Knopf im Betrachter selbst vergibt einen eigenen Dateinamen; „Speichern“ in der Kopfzeile verwendet den Depotklar-Namen. Die Excel-Mappe hat keine Vorschau.

Tests: Vorschau mit Rückfall auf direktes Speichern, Freigabe beim Schließen, CSP mit `frame-src blob:` und `object-src 'none'`; Wertpapierblätter für Alexander Weber 2026 mit Filter eine Seite statt mehrerer; Übersicht mit Filter nennt „nur Fiktiver Aktienfonds Alt“ und keine anderen Fonds; hervorgehobener Filter und Hinweis „Nur …“. Im Browser per Maus: Filter, „PDF je Wertpapier“ und „PDF Übersicht“ öffnen die Vorschau mit nur diesem Fonds, „Speichern“ mit Dateiname `depotklar-wertpapierblaetter-2026-Alexander-Weber-Fiktiver-Aktienfonds-Alt.pdf`, Schließen per × und Escape.

## 2026-11-01 - Depotklar 4.6: Seitenleiste mit Personenmenü, Kennzahlen, Bereich „Konten“

Anlass: Betrachtet wird fast immer eine Person einzeln; die Übersicht über alle Personen wird selten gebraucht. Währungskonten standen zwischen den Wertpapierblättern, obwohl sie eigene Bewegungen, Kurse und Steuerregeln haben. Die Oberfläche sollte professioneller und moderner wirken, vor allem am Desktop, die farbliche Trennung der Betrachtungen bleiben. Die Kopfzeile bot für viele Personen zu wenig Platz. Außerdem verloren seit 4.4 Eingabefelder nach jedem Klick den Fokus.

Verhalten: Links steht eine Seitenleiste mit Personenmenü, den Bereichen mit Symbolen, dem Speicherstand und der Dokumentation; die Kopfzeile entfällt. Das Personenmenü zeigt die gewählte Person mit vollem Namen und klappt die Liste aller Personen auf – auch bei vielen Personen übersichtlich; gewählt ist die zuletzt gewählte Person dieses Browsers, sonst die erste. „Alle Personen“ bleibt wählbar, auf der Steuerseite nicht. Das Jahr wird auf der Steuerseite selbst gewählt; es bleibt dasselbe wie das Endjahr der Übersicht. Die Ausfuhren stehen als Gruppe mit Symbol beisammen. Unter 980 Pixel Breite wird die Seitenleiste zur Leiste oben. Die Jahresübersicht trägt den Namen der Person im Titel und zeigt darüber Kennzahlen: Buchwert, steuerliche Basis und Marktwert zum 31.12. sowie bei einer Person das Steuerjahr laut Modell mit erwarteter Erstattung oder Nachzahlung (Klick öffnet die Steuerseite). Neuer Bereich „Konten“ mit den Kontoblättern der Währungskonten der Person, Zeitraum wie in der Übersicht, „+ Bewegung“ je Konto und offenen Angaben; die Übersicht nennt je Depot nur noch den Stand der Konten mit Verweis. Farbleisten am linken Rand: wirtschaftlich blau, steuerlich braun, Zinsen grün, Konten gold.

Fehlerbehebung: Seit 4.4 trug der Seitenrahmen das Merkmal der Navigation (`data-route`, für das Querformat beim Druck). Dadurch baute jeder Klick irgendwo auf der Seite die Ansicht neu auf; ein angeklicktes Eingabefeld, etwa auf der Kursseite, verlor sofort den Fokus. Der Rahmen trägt jetzt `data-page`.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. PDF und Excel bleiben unverändert und führen Währungskonten weiter beim Depot.

Grenzen: Die gemerkte Person liegt nur im Browser, nicht im Tresor. Die Oberfläche ist für den Desktop gebaut; schmale Fenster bleiben bedienbar, sind aber nicht das Ziel.

Tests: Seitenleiste mit Personenmenü statt Kopfzeile; Jahresauswahl auf der Steuerseite mit dem gewählten Jahr; der Seitenrahmen trägt kein Navigationsmerkmal (Schutz gegen den Fokusfehler). Übersicht für Alexander Weber mit Titel, Buchwert 378.924,95 € und Steuer 2.993,78 €; ohne Person keine Steuerkachel; Bereich „Konten“ mit Kontoblatt USD 2026, „+ Bewegung“ und leerem Zustand für Laura Weber; Übersicht ohne Kontoblatt, mit Verweis „575,9 USD · Buchwert 486,74 €“; EZB-Ergänzung unter „Konten“. Breite Prüfung von 656 Seiten, Formularen, Vorschauen, PDFs und Excel-Mappen in vier Datenlagen ohne Fehler, einschließlich „Konten“; Probe Anfangsbestand + Vorgänge = Losbestand und lückenlose Jahresübergänge in 210 Zeilen. Im Browser: alle Bereiche, Personenmenü und schmales Fenster ohne seitliches Scrollen; ein Klick ins Kursfeld behält den Fokus.

## 2026-11-01 - Depotklar 4.5: Jeder Ausdruck als PDF, Excel je Wertpapier

Anlass: Drucken sollte einheitlich über PDF-Dateien laufen, nicht teils über den Druckdialog des Browsers. Die Excel-Mappe hatte je Depot nur ein unformatiertes Blatt mit allen Wertpapieren und Daten als Text („2026-01-13“) – anders als das frühere Excel-Blatt je Wertpapier.

Verhalten: Alle Druckschaltflächen erzeugen jetzt PDF-Dateien: „PDF Übersicht“ (je Depot beide Betrachtungen aller Wertpapiere, Zinsen und Währungskonten, Querformat), „PDF je Wertpapier“ wie bisher, „PDF“ auf der Steuerseite (Steuerjahr der Person im Hochformat mit Erträgen, Jahresrechnung, Bankabgleich, Anlage SO und KAP-INV) und im Protokoll (Auswahl wie am Bildschirm). Die Excel-Mappe hat je Depot ein Übersichtsblatt und je Wertpapier ein eigenes Blatt – Kopf mit Wertpapier, ISIN, Art, Depot, Person, Bank, Buchhaltungskonto und Zeitraum, darunter wirtschaftliche und steuerliche Betrachtung. Überschriften und Tabellenköpfe sind hervorgehoben (blau wirtschaftlich, braun steuerlich), Bestände und Summen fett, Daten echte Datumswerte (TT.MM.JJJJ), Beträge mit zwei Stellen, Stückzahlen mit bis zu vier, Devisenkurse mit vier; Druck quer auf eine Seitenbreite. PDF und Excel lesen dieselben Zeilen.

Auswirkung auf Bestände, Geld und Steuerwerte: keine.

Grenzen: Der Browserdruck (Strg+P) bleibt möglich, ist aber nicht mehr vorgesehen. Liegt ein Wertpapier in mehreren Depots, trägt der Blattname gekürzt den Depotnamen (Excel erlaubt 31 Zeichen).

Tests: PDF der Übersicht mit „Summe Stand 31.12.2026“, 311.875,00 € und 559.749,39 €, Steuer-PDF im Hochformat mit Bemessungsgrundlage 10.744,62 € und Steuer laut Modell 2.993,78 €, Protokoll-PDF mit Grund und neuem Betrag; Excel mit echter Bibliothek: Blätter je Depot und Wertpapier, Querformat, Datum als Datumswert mit TT.MM.JJJJ, Zahlenformate, fette Bestandszeilen; keine Druckschaltfläche mehr.

## 2026-11-01 - Depotklar 4.4: Wertpapierblätter als PDF, Druck ohne Drehung, Historie 2009–2017

Anlass: Fonds, die 2009 bis 2017 gekauft und teils vor 2018 verkauft wurden, ließen sich nur als Bestand zum 01.01.2018 erfassen; die Jahre davor fehlten im Blatt, die übrigen Lose musste man selbst ermitteln. Ausdrucke kamen gedreht heraus, und in daraus erstellten PDF-Dateien ließen sich Zahlen nicht kopieren. Gebraucht wird je Wertpapier eine Querseite wie im früheren Excel-Blatt – oben wirtschaftlich, unten steuerlich – für jede Person.

Verhalten: Fondskäufe ab 2009 lassen sich einzeln erfassen, Fondsverkäufe vor 2018 ebenfalls – mit dem steuerlichen Gewinn laut Bank, ohne eigene Steuerrechnung nach altem Recht. Zum Ablauf des 31.12.2017 führt Depotklar die übrigen Lose in die fiktive Veräußerung über: Basis aus dem Kurs 31.12.2017, fiktiver Gewinn und Alt-Erträge aus dem neuen Vorgang „Übergang 2017/2018“ je Depot und Fonds, nach Stück auf die Lose verteilt. Das steuerliche Blatt zeigt die Zeile „Fiktive Veräußerung 31.12.2017“. Fonds vor 2009 kommen weiter als Bestand zum 01.01.2018. Aktienverkäufe 2009–2017 werden wie heute gerechnet. Neue Schaltfläche „PDF je Wertpapier“ in der Jahresübersicht. Sie erzeugt eine PDF-Datei mit einer Seite im Querformat je Person, Depot und Wertpapier: Kopf mit Wertpapier, ISIN, Art, Regime, Person, Depot, Bank, Buchhaltungskonto und Zeitraum; darunter die wirtschaftliche und die steuerliche Betrachtung mit Stand 01.01., jedem Vorgang und Stand 31.12. je Jahr samt Wert je Stück und Marktwert; Fußzeile mit Stand und Seitenzahl. Die Datei folgt Person, Zeitraum und Wertpapierauswahl. Erzeugt wird sie im Browser mit jsPDF 4.2.1 und jsPDF-AutoTable 5.0.8 (MIT), die wie ExcelJS erst beim Klick aus dist/vendor geladen werden; die Zahlen sind Text. Der Browserdruck nutzt nur noch für die Jahresübersicht Querformat, sonst Hochformat, und druckt in Arial statt der variablen Systemschrift, die manche PDF-Druckertreiber als Umrisse ausgeben.

Auswirkung auf Bestände, Geld und Steuerwerte: Für bestehende Daten keine. Einzeln erfasste Fondslose 2009–2017 tragen nach dem Übergang dieselben Werte wie ein Bestand zum 01.01.2018; ohne fiktiven Gewinn laut Bank bleibt ein späterer Verkauf offen. Das PDF liest dieselbe Fortschreibung wie die Jahresübersicht. Regelpaket unverändert.

Grenzen: Für Fondsverkäufe vor 2018 rechnet Depotklar keine Steuer; Jahre vor 2018 haben keine Jahresrechnung. Die PDF-Schrift Helvetica kennt nur westeuropäische Zeichen; Pfeile und Sonderzeichen werden ersetzt. Ein Wertpapier mit sehr vielen Vorgängen läuft auf Folgeseiten weiter. Währungskonten und Zinsen stehen nicht im Wertpapier-PDF.

Tests: Historie mit Käufen 2010 (100 Stück, 5.000 €) und 2014 (100 Stück, 8.000 €), Verkauf 2016 von 120 Stück für 10.800 € (wirtschaftlich 4.200 €, laut Bank 4.100 €), Kurs 31.12.2017 100 €, fiktiver Gewinn laut Bank 1.500 € statt rechnerisch 1.600 €, Verkauf 2019 der 80 Stück für 8.800 € mit 2.060 € steuerpflichtig; ohne Bankwert offen; Übergang je Depot und Fonds nur einmal; Fondskauf vor 2009 abgelehnt. tests/v4-pdf.test.mjs – Demo 2025–2026 mit acht Seiten in der Reihenfolge Person, Depot, Wertpapier, Querformat, Texte „289.000,00“ und „545.238,70“ im PDF, Auswahl einer Person und eines Wertpapiers, Hinweis ohne Wertpapiere; Druck-CSS mit Hoch- und Querformat und fester Schrift. Geprüft per Chrome: Jahresübersicht quer, Steuerseite hoch, Schriften Arial, Zahlen als Text auslesbar.

## 2026-11-01 - Depotklar 4.3: Fondsverluste nach BFH, Vorabpauschale mit erstem Kurs des Jahres

Anlass: Bei der Prüfung des Rechenkerns gegen die aktuelle Rechtsprechung fiel auf, dass Depotklar Verluste ab 2018 bei Fondsanteilen aus 2009 bis 2017 vollständig teilfreistellte. Der BFH hat am 25.11.2025 (VIII R 22/23, VIII R 31/23) entschieden, dass die Teilfreistellung dort nicht gilt, soweit der Verlust nur aus dem Kurs 31.12.2017 über den historischen Anschaffungskosten folgt. Die Vorabpauschale nahm ohne Januarkurs den Dezemberkurs des Vorjahres als Beginn; § 18 InvStG verlangt den ersten im Jahr festgesetzten Rücknahmepreis. Das Feld „Aktuell“ auf der Kursseite speicherte nicht.

Verhalten: Verkäufe von Fondsanteilen 2009–2017 mit Verlust ab 2018 setzen den Verlustteil aus der Differenz zwischen Kurs 31.12.2017 und historischen Anschaffungskosten ohne Teilfreistellung an, den Rest mit Teilfreistellung; die Steuerseite weist den Betrag als Hinweis aus. Fehlt der ursprüngliche Anschaffungswert, bleibt ein solcher Verkauf offen. Die Kursseite zeigt bei Fonds je Jahr den ersten und den letzten Kurs; die Vorabpauschale braucht beide, der Dezemberkurs des Vorjahres ersetzt den ersten nicht mehr. Das aktuelle Jahr hat eine eigene Spalte. „Aktuell“ speichert wieder. Zielbild auf den Stand 4.3 gebracht, ungenutzte Hilfsfunktionen entfernt.

Auswirkung auf Bestände, Geld und Steuerwerte: Bei Verlusten ab 2018 aus Fonds 2009–2017 sinkt der steuerpflichtige Betrag, im Urteilsfall von 30.928,66 € auf 24.141,62 €. Vorabpauschalen, für die bisher nur Dezemberkurse vorlagen, sind offen, bis der erste Kurs des Jahres erfasst ist; danach können sie leicht von den bisherigen Werten abweichen, weil der Jahresanfangskurs vom Dezemberkurs abweicht. Erfasste Bankwerte der Vorabpauschale bleiben unverändert und haben Vorrang. Regelpaket DE-privat-2018-2026.8.

Grenzen: Banken setzen den BFH-Fall teils noch nicht um; die Differenz kommt über die Veranlagung, bei bestandskräftigen Bescheiden nicht mehr. Der erste Kurs wird nur bis 15. Januar gesucht; ein Fonds, der erst später im Jahr aufgelegt wurde, braucht den Bankwert der Vorabpauschale. Ob Verluste aus Alt-Anteilen vor 2009 den Freibetrag von 100.000 € wieder auffüllen, bleibt offen; Depotklar füllt ihn nicht auf.

Tests: Urteilsfall VIII R 31/23 mit 24.141,62 € steuerpflichtig und 22.623,48 € Verlust ohne Teilfreistellung, offener Verkauf ohne Anschaffungswert, Alt-Anteile vor 2009 unverändert (−15.836,44 €). Vorabpauschale 2023 aus erstem Kurs 101 statt Dezemberkurs 100: 1.802,85 €; ohne Januarkurs offen; Begrenzung auf den Mehrbetrag 1.000 €. Demo mit Januarkursen gleich dem Vorjahresende, daher unveränderte Sollwerte.

## 2026-11-01 - Depotklar 4.2: Jahresabschluss je Person, EZB-Devisenkurse, Zeitraum nebeneinander, Übertrag auf verzinste Währungskonten

Anlass: Die Personen einer Familie schließen ihre Steuerjahre zu unterschiedlichen Zeiten ab, etwa wenn die Bescheide nicht gleichzeitig kommen; der Jahresabschluss galt aber für alle gemeinsam. Für Währungskonten fehlten historische Devisenkurse: Ohne EUR-Betrag laut Abrechnung blieb der Währungsgewinn offen. Anfangs- und Endjahr der Übersicht standen an zwei Stellen – „Von“ in der Werkzeugleiste, das Jahr oben in der Kopfleiste. Beim Abgleich mit dem BMF-Schreiben zur Abgeltungsteuer vom 14.05.2025, Rz. 131, fiel auf, dass ein Übertrag von einem unverzinsten auf ein verzinstes Währungskonto nicht als Veräußerung zählte.

Verhalten: Der Jahresabschluss gilt je Person. Der Dialog zeigt den Stand aller Personen, schließt eine oder alle Personen bis zu einem vergangenen Jahr ab und öffnet eine Person mit Begründung wieder. Gesperrt ist ein Vorgang, sobald eine beteiligte Person sein Jahr abgeschlossen hat – bei einer Schenkung Schenker oder Empfänger –, ein Kurs, sobald eine Person mit diesem Wertpapier das Jahr abgeschlossen hat, Jahresdaten und Bankbescheinigungen nach dem Abschluss ihrer Person. Die Übersicht zeigt den Abschluss je Depot, die Steuerseite je Person. Depotklar enthält die Euro-Referenzkurse der Europäischen Zentralbank für 17 Währungen seit 1999 (CNY seit 2000). Fehlen bei einer Bewegung auf dem Währungskonto EUR-Betrag und Kurs laut Abrechnung, gilt der EZB-Kurs des Tages, an Wochenenden und Feiertagen der letzte davor; beim übernommenen Bestand der Kurs des Anschaffungstags. Der Kurs wird mit Herkunft und Kurstag am Vorgang gespeichert und im Kontoblatt angezeigt; beim Ändern des Vorgangs gilt der Kurs des neuen Datums. Im Kontoblatt ergänzt „Fehlende EUR-Werte mit EZB-Referenzkursen ergänzen“ alle offenen EUR-Werte eines Kontos in offenen Jahren, jede Ergänzung steht im Protokoll. Die Kurse liegen als Dateien in der App; die App baut dafür keine Verbindung auf. Neue Kurse kommen mit `npm run rates` und einer neuen Version. Kauf und Verkauf lassen sich wahlweise mit dem Betrag laut Abrechnung oder mit Kurs je Stück und optionalen Gebühren erfassen; Depotklar rechnet den Betrag aus, speichert Kurs und Gebühren am Vorgang und zeigt sie im Jahresblatt („aus Kurs … je Stück · ohne Gebühren“). Auf der Kursseite ist die Spalte „Aktuell“ als optional gekennzeichnet, mit Hinweis, wann ein aktueller Kurs überhaupt zählt; Kurse abgeschlossener Jahre sind dort gesperrt. Die Übersicht zeigt „Zeitraum“ mit Anfangs- und Endjahr nebeneinander in der Werkzeugleiste; die Jahresauswahl der Kopfleiste entfällt auf dieser Seite und bleibt auf der Steuerseite. Ein Übertrag vom unverzinsten auf ein eigenes verzinstes Konto ist jetzt eine Veräußerung nach § 23 EStG und braucht den EUR-Wert; das verzinste Konto beginnt mit diesem Wert. Überträge zwischen zwei unverzinsten Konten bleiben ohne Veräußerung.

Auswirkung auf Bestände, Geld und Steuerwerte: Nur bei Überträgen vom unverzinsten auf ein verzinstes Konto ändern sich Währungsgewinne: Der Gewinn bis zum Übertrag fällt unter § 23 EStG (steuerbar innerhalb eines Jahres), der spätere Gewinn unter § 20 EStG. Fehlt der EUR-Wert eines solchen Übertrags, steht der Gewinn als offen. Wo bisher ein EUR-Wert fehlte, entsteht mit dem EZB-Kurs ein Währungsgewinn; erfasste EUR-Beträge und Kurse laut Abrechnung bleiben unverändert und haben Vorrang. Ein gemeinsamer Abschluss aus 4.1 wird beim Öffnen für jede Person übernommen. Regelpaket DE-privat-2018-2026.7.

Grenzen: Der EZB-Referenzkurs ist ein Mittelkurs; Banken rechnen Erträge mit ihrem eigenen Devisenbriefkurs um (BMF vom 14.05.2025, Rz. 247). Liegt der EUR-Betrag der Abrechnung vor, ist er vorzuziehen. Nach dem Ende der hinterlegten Reihe und für andere Währungen gibt es keinen Vorschlag. Umsatzsteuer-Umrechnungskurse und die Brücke zur Buchhaltung der Währungskonten folgen getrennt. Die Verbrauchsfolge gilt je Konto; ob sie über alle Konten derselben Währung laufen müsste, lässt das Gesetz offen. Version 4.1 öffnet Daten aus 4.2 ohne den Abschluss.

Tests: tests/v4-fxrates.test.mjs mit Kursen laut EZB-Datenportal (USD 20.10.2023: 1,0591; Sonntag 22.10.2023: Kurs vom Freitag; 25.12.2025: Kurs vom 24.12.2025 1,1787; 02.02.2026: 1,184), Vorrang von Abrechnungsbetrag und -kurs, Neubestimmung beim Ändern, Ergänzen nur in offenen Jahren (1.059,10 USD → 1.000,00 €). Kauf und Verkauf aus Kurs je Stück: 500 × 131,40 € − 12,50 € = 65.687,50 € Erlös mit gleichem Gewinn wie bei Eingabe des Erlöses, 3 × 33,333 € = 100,00 €, 10 × 100,123 € + 1,99 € = 1.003,22 €, abgelehnt bei Gebühren über dem Kurswert und bei Betrag, der nicht zu Kurs und Gebühren passt. tests/v4-additions.test.mjs: Abschluss je Person mit gesperrter Schenkung an eine abgeschlossene Empfängerin, gesperrtem Kurs eines von ihr gehaltenen Fonds, offenem Kurs eines anderen Fonds, Übernahme des gemeinsamen Abschlusses; Übertrag Girokonto → Tagesgeld (900 € → 980 €: 80 € nach § 23, danach −30 € nach § 20).

## 2026-11-01 - Depotklar 4.1: Funktionen aus Version 3 zurück, Währungskonten und neue Optik

Anlass: Nach dem Neuaufbau fehlten Funktionen aus Version 3, die im Alltag gebraucht werden: der Schutz abgeschlossener Jahre, ein sichtbares Änderungsprotokoll, eine Excel-Mappe für den Steuerberater, Zinsen, ausländische Quellensteuer und Schenkungen an mehrere Kinder in einem Vorgang. Dazu sollten USD-Konten geführt und ihre Währungsgewinne nachgerechnet werden – das konnte auch Version 3 nicht. Die Oberfläche sollte professioneller wirken und dabei nah an der Excel-Darstellung der Buchhaltung bleiben.

Verhalten: Neue Vorgangsarten „Zinsen“, „Schenkung an mehrere“ und „Währungskonto“. Die Schenkung an mehrere teilt nach Stückzahl oder Verhältnis auf und teilt die Lose nacheinander oder anteilig mit gleichem Erwerbsmix zu; alle Empfänger werden gemeinsam gespeichert, geändert und gelöscht. Ausländische Quellensteuer auf Aktiendividenden wird angerechnet statt das Jahr zu sperren. Währungskonten werden in den Stammdaten je Depot angelegt; Umtausch, Gutschriften, Zahlungen, Überträge und übernommene Bestände werden mit EUR-Wert oder Devisenkurs erfasst, Käufe, Verkäufe, Dividenden und Zinsen können über ein Währungskonto laufen. Die Übersicht zeigt je Depot Zinsen und Kontoblätter der Währungskonten, die Steuerseite die privaten Veräußerungsgeschäfte für die Anlage SO. „Jahresabschluss“ schließt vergangene Jahre ab und öffnet sie nur mit Begründung wieder; gesperrte Vorgänge erscheinen mit Schloss und lassen sich nur ansehen. Neue Seite „Protokoll“ mit Filter. Die Excel-Mappe enthält zusätzlich das Steuerjahr je Person, die Schenkungen, alle Vorgänge und das Protokoll. Kursänderungen werden jetzt protokolliert. Neue Optik: dunkle Kopfleiste, Werkzeugleiste der Übersicht, Tabellen mit Gitterlinien und farbigem Kopf je Betrachtung, negative Beträge rot.

Auswirkung auf Bestände, Geld und Steuerwerte: Bestehende Bestände und Werte bleiben unverändert. Neu in die Jahresrechnung gehen Zinsen, Währungsgewinne verzinster Konten und die angerechnete Quellensteuer nach (e − 4q)/(4 + k). Bisher als „außerhalb des Modells“ gesperrte Jahre mit Quellensteuer auf Aktiendividenden werden jetzt gerechnet. Private Veräußerungsgeschäfte stehen gesondert und verändern die Abgeltungsteuer nicht. Regelpaket DE-privat-2018-2026.6. Tresore aus 4.0 werden beim Öffnen ergänzt; 4.0 kann Daten mit den neuen Vorgangsarten nicht lesen.

Grenzen: Die Steuer auf private Veräußerungsgeschäfte nach dem persönlichen Steuersatz rechnet Depotklar nicht; weitere private Veräußerungsgeschäfte außerhalb der Währungskonten zählen zur Freigrenze mit und sind nicht erfasst. Ob eine Zins- oder Dividendengutschrift auf einem unverzinsten Konto eine Anschaffung nach § 23 EStG ist, ist nicht abschließend geklärt; Depotklar behandelt sie so und weist darauf hin. Quellensteuer auf Fondsausschüttungen wird nicht angerechnet. Bewertung von Währungsbeständen zum Jahresende und Kursabfragen gibt es nicht; der Bestand steht zum EUR-Buchwert. Geldkonten in EUR, Bankimport und Belegdateien bleiben weg.

Tests: Neue Datei tests/v4-additions.test.mjs mit nachgerechneten Sollwerten – Quellensteuer (100,00 € statt 250,00 € KapESt bei 150 € Quellensteuer auf 1.000 €, Deckel 25 %, Kirchensteuer 9 %: 97,80 / 5,37 / 8,80 €, Verfall über der deutschen Steuer, Fonds ohne Anrechnung), Zinsen, Schenkung an mehrere nacheinander und anteilig (375/125 und 225/75 Stück bei zwei Losen), Verhältnisrundung, Sperren des Jahresabschlusses, Protokoll, Excel-Blätter, das Demo-USD-Konto (+34,13 € beim Aktienkauf 2023, 78,00 € steuerbar beim Rücktausch 2026), Freigrenze 599,99/600 € und 999,99/1.000 €, Frist „nicht mehr als ein Jahr“, Überträge, offene EUR-Werte und Anschaffungstage. Der Darstellungstest umfasst alle neuen Vorgangsarten.

## 2026-10-31 - Übersicht über mehrere Jahre und je Wertpapier

Anlass: Die Übersicht zeigte je Depot genau ein Jahr. Für die Entwicklung eines Fonds seit 2018 – vor allem der steuerlichen Basis mit den Vorabpauschalen – und für einen Fonds, der per Schenkung auf mehrere Depots verteilt ist, mussten Jahr für Jahr und Depot für Depot einzeln aufgerufen werden.

Verhalten: Neben dem Jahr gibt es „Von“ für den Beginn eines Zeitraums und „Wertpapier“ für einen einzelnen Fonds. Über mehrere Jahre stehen je Wertpapier Stand 01.01. des ersten Jahres, alle Vorgänge und der Stand 31.12. jedes Jahres als Zwischenzeile untereinander, in beiden Betrachtungen. Bei Auswahl eines Wertpapiers erscheinen nur die Depots, in denen es im Zeitraum lag, darüber die Summe über alle Depots zum Ende des Zeitraums. Erlös und Gewinn summieren sich über den Zeitraum. Druck, Drucktitel und Excel übernehmen Zeitraum und Auswahl; die Excel-Datei heißt dann zum Beispiel depotklar-uebersicht-2018-2026.xlsx. Wird nur das Jahr geändert, folgt ein einzelnes Jahr mit; ein gewählter Zeitraum behält seinen Beginn.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Der Zeitraum setzt die unveränderten Jahresblätter aneinander und prüft, dass jeder Stand 31.12. dem Stand 01.01. des Folgejahres gleicht.

Grenzen: Steuerlich beginnt jeder Fonds frühestens am 01.01.2018. Die Summe über alle Depots addiert verschiedene Personen und ist kein Steuerwert einer Person. Der Abgleich mit der Buchhaltung gilt dem ganzen Depot und entfällt bei Auswahl eines Wertpapiers. Die Steuerseite bleibt eine Jahresrechnung je Person.

Tests: Neue Datei tests/v4-period.test.mjs – Verkettung 2018 bis 2026 gegen die Einzeljahre in beiden Betrachtungen, Verfolgung eines Fonds in die Kinderdepots mit 6.400 Stück Gesamtbestand, Neubeginn nach Verkauf und Wiederkauf, Ansicht mit Zeitraum und Filter, Excel-Zeilen je Jahresende; das nachgebaute Jahresblatt wird weiterhin auf den Cent reproduziert.

## 2026-10-31 - Depotklar 4: Neuaufbau für zwei Betrachtungen mit wenig Eingabe

Anlass: Version 3 war über viele Iterationen zu einem Programm mit rund zwanzig Buchungsarten, Geldkonten, Fremdwährungslosen, Bankimport und 140 KB Hilfetexten gewachsen. Die tatsächliche Arbeitsweise ist schmaler: Die Buchhaltung führt die Geldkonten, je Depot und Jahr werden zwei Blätter geführt – wirtschaftlich und steuerlich –, Altfonds vor 2009 liegen meist in einem eigenen Depot, im Jahr fallen wenige Vorgänge an. Ziel ist, mit möglichst wenig Eingaben richtig zu rechnen und den Verlauf nachvollziehbar zu halten.

Verhalten: Neues Datenformat 4 und neue Oberfläche. Acht Vorgangsarten: Bestand übernehmen, Kauf, Verkauf, Übertrag (Schenkung, Erbschaft, eigenes Depot), Ausschüttung, Vorabpauschale laut Bank, Split, Fondsverschmelzung. Jeder Vorgang trägt seinen EUR-Betrag laut Abrechnung; Geldkonten entfallen. Die Hauptansicht ist das Jahresblatt je Depot – oben wirtschaftlich, darunter steuerlich, je Wertpapier Stand 01.01., jeder Vorgang mit laufendem Bestand, Stand 31.12. mit Wert je Stück, Abgleich mit dem Sachkonto der Buchhaltung, Druck und Excel. Jahresendkurse liefern Marktwert und Vorabpauschale zugleich; ein Bankwert hat Vorrang. Jede Erfassung rechnet vor dem Speichern vor: Gewinn, steuerpflichtiger Teil, Anrechnung auf den Alt-Anteile-Freibetrag, Schenkungsteuer mit Vorerwerben. Der Anschaffungswert lässt sich je Stück eingeben. Die Steuerseite schlägt Vorträge und Rest-Freibetrag aus dem Vorjahr vor, gleicht mit dem Steuerabzug der Bank ab und zeigt die Werte für die Anlage KAP-INV. Die Schenkungsteuer summiert Vorerwerbe aus den erfassten Schenkungen selbst und zeigt den noch steuerfrei übertragbaren Betrag. Personen ohne Erträge im Jahr müssen keine Jahresdaten bestätigen.

Auswirkung auf Bestände, Geld und Steuerwerte: Die Rechenregeln sind unverändert aus Version 3 übernommen und gegen sie geprüft. Tresore der Version 3 werden nicht gelesen; sie bleiben unverändert im Browser, Version 3 ist über den Git-Tag v3.4.0 wiederherstellbar. Bestände sind neu zu übernehmen.

Grenzen: Nicht mehr enthalten sind Geldkonten und Kontosalden, Fremdwährungsguthaben und deren Währungsgewinne, Bankimport mit Spaltenzuordnung, Belegdateien im Tresor und Journalsperren. Weiterhin außerhalb des Modells: Zusammenveranlagung, Günstigerprüfung, Anrechnung ausländischer Quellensteuer, Anleihen, Verkäufe vor 2018. Schenkung von Alt-Anteilen vor 2009 wird mit Fortführung des Bestandsschutzes und eigenem Freibetrag des Empfängers gerechnet (BMF-Schreiben vom 21.05.2019, Rz. 56.98, nach Fachliteratur) – vor einer Gestaltung mit dem Berater bestätigen. Für geschenkte Lose zählt bei der Vorabpauschale das ursprüngliche Erwerbsdatum. Die Vorabpauschale aus Kursen nimmt den letzten Dezemberkurs; banktägliche Abweichungen am Jahresanfang werden über den Bankwert korrigiert.

Tests: Neue Dateien tests/v4-ledger.test.mjs, tests/v4-tax.test.mjs, tests/v4-gift-vault.test.mjs, tests/v4-ui.test.mjs und tests/v4-docs.test.mjs. Ein nachgebautes Jahresblatt 2026 mit Alt-Fonds und Schenkungen wird in beiden Betrachtungen auf den Cent reproduziert. Differenzprüfung gegen Version 3 während der Entwicklung: 13 Jahresfälle einschließlich Verlustbescheinigung identisch, 3.000 Fälle der Vorabpauschalenformel und 465 Fälle der Fortschreibung identisch, Schenkungsteuertarif über den gesamten Wertebereich und 120 Fälle der Zehnjahreszusammenrechnung identisch; die Sollwerte stehen als feste Prüffälle in den Tests.

## 2026-10-31 - Exportfenster nennt die Jahresübersicht

Anlass: Der Erklärtext im Exportfenster zählt auf, was Mappe und Ausdruck enthalten. Die beiden neuen Jahresübersichten fehlten in dieser Aufzählung; sie waren enthalten, aber nicht angekündigt.

Verhalten: Der Text nennt die Jahresübersicht je Depot in beiden Betrachtungen als Bestandteil von Excel und Druckansicht und trennt sie von den Angaben, die nur in der Mappe stehen.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Nur Hinweistext.

Grenzen: keine zusätzlichen; Umfang und Zeitraum des Exports sind unverändert.

Tests: Ein weiterer Fall in `tests/movement.test.mjs`, der den Text des Exportfensters gegen die tatsächlich erzeugten Tabellen hält.

## 2026-10-31 - Jahresübersicht beider Betrachtungen drucken und exportieren

Anlass: Die beiden Fortschreibungen waren nur am Bildschirm zu sehen. Für die Ablage und die Weitergabe an die Buchhaltung fehlte das gedruckte Blatt, das die geführte Jahresübersicht ersetzt.

Verhalten: Der vorhandene Ausdruck enthält zusätzlich zwei Abschnitte, „Jahresübersicht · wirtschaftliche Betrachtung" und „Jahresübersicht · steuerliche Betrachtung", mit denselben Zeilen wie die Ansicht: Stand zu Beginn, jeder Vorgang mit Datum, Stückzahl, Wert, gegebenenfalls Erlös und Gewinn, laufendem Bestand, dann der Stand am Ende. Dieselben Tabellen erscheinen als eigene Blätter in der Excel-Mappe. Ohne ausdrücklich gewählten Zeitraum läuft die Übersicht über das Kalenderjahr des gewählten Auswertungsjahres.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Druck und Export lesen dieselbe Fortschreibung wie der Bildschirm.

Grenzen: Der Ausdruck ist unverschlüsselt und kein amtlicher Steuerbericht. Eine nicht einzeln zugeordnete Wirkung erscheint auch im Ausdruck als eigene Differenzzeile, statt stillschweigend ausgeglichen zu werden. Beginnt der gewählte Zeitraum nach dem Ende des Auswertungsjahres, bleibt die Übersicht leer und wird nicht auf ein anderes Jahr umgedeutet.

Tests: Zwei weitere Fälle in `tests/movement.test.mjs` - Zeilengleichheit von Export und Bildschirm für beide Betrachtungen einschließlich der nur steuerlich geführten Vorabpauschale, und der leere Kopf bei einem Zeitraum nach dem Auswertungsjahr.

## 2026-10-31 - Bewegungsrechnung je Depot: wirtschaftlich und steuerlich mit Verlauf

Anlass: Die Buchhaltung führt je Depot und Jahr zwei Blätter nebeneinander - eine wirtschaftliche und eine steuerliche Betrachtung, beide als Fortschreibung vom Stand zum Jahresbeginn über jeden einzelnen Vorgang bis zum Stand am Jahresende. Depotklar zeigte bisher nur Momentaufnahmen. Der Verlauf fehlte, und damit die Möglichkeit, eine Zahl bis zu ihrem Vorgang zurückzuverfolgen oder einen Endbestand gegen das geführte Sachkonto zu stellen.

Verhalten: „Depot & Buchhaltung" beginnt jetzt mit beiden Fortschreibungen untereinander, je Wertpapier eine Tabelle: Stand zu Beginn, jeder Vorgang mit Datum, Stückzahl, Wert und laufendem Bestand, dann der Stand am Ende mit dem Wert je Stück. Ohne ausdrücklich gewählten Beginn läuft der Zeitraum über das Kalenderjahr des Stichtags. Beide Betrachtungen zeigen dieselben Zeilen und dieselben Stückzahlen; sie unterscheiden sich im fortgeführten Wert. Wirtschaftlich ist das der Anschaffungswert der Buchhaltung. Steuerlich ist es die Basis, die bei einem Verkauf vom Erlös abgezogen wird: bei Fonds mit Übergang zum 01.01.2018 der belegte Stichtagswert, sonst die Anschaffungskosten, jeweils erhöht um angesetzte Vorabpauschalen. Eine Vorabpauschale erscheint deshalb nur in der steuerlichen Betrachtung, bewegt dort keine Stücke und kein Geld. Unentgeltliche Übergänge verlassen das Depot in beiden Betrachtungen zum jeweiligen Buchwert und erzeugen keinen Gewinn; ein Verkauf führt Erlös und den in dieser Betrachtung gemessenen Gewinn mit.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Ansicht liest und rechnet, sie bucht nichts. Erlös, Kosten und Veräußerungsgewinn stammen unverändert aus derselben Rekonstruktion wie die Jahresrechnung.

Grenzen: Die Fortschreibung ist keine Jahresrechnung. Teilfreistellung, Sparer-Pauschbetrag, Verlusttöpfe und der persönliche Alt-Fonds-Freibetrag wirken erst dort und sind in keiner der beiden Spalten enthalten. Marktwerte kommen nicht vor: beide Betrachtungen führen Buchwerte fort. Ist die steuerliche Einordnung eines Loses offen, bleibt sein steuerlicher Wert unbekannt und wird nicht als Null geführt, während die wirtschaftliche Seite weiterläuft. Split, Verschmelzung, Kapitalrückzahlung und nachträglich erfasste Übergangswerte werden nicht in eine eigene Wertzeile zerlegt; ihre Wirkung erscheint als ausgewiesene Differenzzeile mit Hinweis, statt eine ausgleichende Buchung zu erfinden. Anfangsbestand plus erfasste Vorgänge wird gegen den Endbestand geprüft; jede Abweichung steht sichtbar in der Tabelle.

Tests: Neue Dateien `dist/movement.mjs` und `dist/movement-ui.mjs` mit `tests/movement.test.mjs`, neun Fälle. Darunter der Nachbau eines geführten Jahresblatts mit Stichtagsübernahme, Vorabpauschale des Vorjahres und drei Schenkungen, dessen Beträge und Stückkurse in beiden Betrachtungen auf den Cent mit der geführten Übersicht übereinstimmen; die Probe Anfangsbestand plus Vorgänge gleich Endbestand über mehrere Depots und beide Betrachtungen; die Gleichheit von Abgang beim Schenker und Zugang beim Beschenkten; getrennte wirtschaftliche und steuerliche Veräußerungsgewinne; unbekannter Steuerstatus ohne Nullwert.

## 2026-10-29 - Wirtschaftlicher und steuerlicher Wert je Fonds und Depot nebeneinander

Anlass: Nach einer Stichtagsübernahme zum 01.01.2018 waren beide Werte im Tresor vorhanden, aber nirgends zusammen zu sehen. „Wertpapierbestände" zeigte nur die wirtschaftliche Seite mit Anschaffungskosten und Marktwert; die steuerliche Basis ab 2018 stand als kleine Nebenzeile im Losfenster, das man erst über einen Klick auf die Zeile erreichte. Wer mit Altfonds vor 2009 anfängt, sucht genau diesen Vergleich: Buchwert aus der Buchhaltung gegen Stichtagswert, und was davon steuerlich übrig bleibt.

Verhalten: „Wertpapierbestände" ist jetzt nach Depots gegliedert. Jedes Depot führt seine Positionen in einer Tabelle mit zwei benannten Blöcken - „Wirtschaftlich · Buchhaltung" mit Buchwert und Buchgewinn, „Steuerlicher Stand ab 01.01.2018" mit Basis ab 2018, dem bis 31.12.2017 angewachsenen Teil und dem Zuwachs danach - und schließt mit einer Depotsumme ab; bei mehreren Depots folgt eine Gesamtsumme. Die letzte Spalte rechnet den steuerpflichtigen Betrag bei einem Verkauf zum angezeigten Stichtagskurs über denselben Weg wie ein echter Verkauf: angesetzte Vorabpauschalen mindern den Gewinn, danach greift die Teilfreistellung. Vier Kennzahlen über der Tabelle zeigen Marktwert, wirtschaftlichen Buchgewinn, den Teil bis 31.12.2017 und den steuerpflichtigen Betrag.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Ansicht liest und rechnet, sie bucht nichts. Die steuerliche Spalte verwendet unverändert `saleTaxParts`, also dieselbe Funktion wie ein gebuchter Verkauf, mit denselben Nachweispflichten und Sperren.

Grenzen: Die letzte Spalte ist keine Jahresrechnung und kein Steuerbetrag. Sparer-Pauschbetrag, Verlusttöpfe, der persönliche Alt-Fonds-Freibetrag von 100.000 Euro und Verkaufsgebühren sind nicht enthalten; für die Altfonds vor 2009 weist die Zeile zusätzlich den auf diesen Freibetrag anrechenbaren Teil aus. Fehlt für ein Los noch ein Vorabpauschalen-Ansatz oder ein belegter Nullansatz, bleibt nur die steuerliche Spalte dieser Position offen und wird nicht durch Null ersetzt - die wirtschaftlichen Werte bleiben vollständig sichtbar. Der bis 31.12.2017 angewachsene Teil ist nur bei durchgehend bestandsgeschützten Losen vor 2009 nicht steuerbar; bei Fonds der Jahre 2009 bis 2017 tritt der belegte Übergangsgewinn 2017 an diese Stelle, und die Ansicht sagt das an der Position. Eine bestandsgeschützte Aktie vor 2009 hat keine Basis zum 01.01.2018; sie bleibt aus den Stichtagssummen heraus und wird dort gezählt, statt die Summen der übrigen Positionen unbekannt zu machen. Ohne Bewertungskurs bleiben Marktwert, Buchgewinn und Steuerspalte unbekannt, während die belegte Basis ab 2018 weiterhin angezeigt wird.

Tests: Neue Dateien `dist/positions.mjs` und `dist/positions-ui.mjs` mit `tests/positions.test.mjs`, elf Fälle - getrennte Fortführung von Buchwert und Stichtagsbasis, Abstimmung beider Seiten gegen `taxReport` desselben Verkaufs, gesperrte Steuerspalte bei offener Vorabpauschale ohne Nullersatz, fehlender Kurs, regulärer Bestand, bestandsgeschützte Aktie ohne Basis 2018, Minderung durch angesetzte Vorabpauschalen, Depotgliederung und Summenbildung, Lesefreiheit und Maskierung fremder Beschriftungen, Sperre vor 2018 sowie die tatsächliche Verwendung in `dist/app.mjs`.

## 2026-10-29 - Fremdwährungssperre benennt das auslösende Konto

Anlass: Eine einzige Bewegung in Fremdwährung sperrt die persönliche Jahresrechnung. Der Hinweis nannte nur den Sachverhalt, nicht den Auslöser; in einem Jahr mit vielen Buchungen musste man danach suchen.

Verhalten: Der Hinweis nennt jetzt zusätzlich die betroffenen Geldkonten mit ihrer Währung und die Zahl der Bewegungen im betrachteten Kalenderjahr.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die fachliche Sperre bleibt unverändert bestehen; Währungsgewinne nach § 20 / § 23 EStG werden weiterhin nicht automatisch ermittelt, und die Jahresrechnung bleibt für diese Person gesperrt.

Grenzen: Der Hinweis zählt Geldbewegungen in Fremdwährung, nicht steuerliche Währungsgewinne. Er ersetzt keine Prüfung des Einzelfalls.

## 2026-10-29 - Tresorpasswort ändern

Anlass: Ein vorhandener Tresor ließ sich nicht auf ein neues Passwort umstellen. Wer sein Passwort wechseln wollte oder musste, hatte keinen Weg dorthin; zugleich fehlte die Möglichkeit, einen älteren Umschlag auf die aktuelle Rundenzahl der Schlüsselableitung zu heben.

Verhalten: Unter „Datentresor" gibt es bei entsperrtem Tresor „Tresorpasswort ändern". Das bisherige Passwort wird verlangt und durch Öffnen des Umschlags geprüft, damit eine unbeaufsichtigte entsperrte Sitzung den Tresor nicht übernehmen kann. Der Wechsel erzeugt ein frisches Salt, leitet mit der aktuellen Rundenzahl ab und erhöht die Revision. Gespeichert wird vor dem Umstellen der Sitzung: Schlägt das Speichern fehl, gilt unverändert das bisherige Passwort und der bisherige Schlüssel.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Der Inhalt wird unverändert neu verschlüsselt.

Grenzen: Bereits gespeicherte Tresordateien behalten das bisherige Passwort, bis sie neu gespeichert werden. Der Dialog sagt das ausdrücklich und rät, beide Passwörter aufzubewahren, bis das erledigt ist. Ein vergessenes Passwort lässt sich weiterhin nicht zurücksetzen; ohne Passwort gibt es keinen Zugang zu den Daten.

Tests: Drei weitere Fälle in `tests/vault-iterations.test.mjs` - Wechsel ohne Inhaltsänderung mit Revisionssprung und neuem Salt, Anheben eines Umschlags mit abweichender Rundenzahl, und vier abgelehnte Versuche (falsches bisheriges Passwort, zu kurzes, unverändertes und fehlendes neues Passwort), nach denen der vorhandene Tresor unverändert mit dem bisherigen Passwort öffnet.

## 2026-10-29 - Tresor bleibt nach Erhöhung der Schlüsselrunden lesbar

Anlass: Die Zahl der PBKDF2-Runden war fest verdrahtet, und `openEnvelope` lehnte jeden Umschlag mit abweichender Zahl ab. Eine spätere Erhöhung hätte jeden vorhandenen Tresor und jede vorhandene Tresordatei unlesbar gemacht - mit der irreführenden Meldung „Unbekanntes oder zu großes Tresorformat". Da der Schlüssel nur während der entsperrten Sitzung besteht, wäre das nicht reparabel gewesen.

Verhalten: Ein Umschlag trägt seine eigene Rundenzahl; die Schlüsselableitung verwendet beim Öffnen genau diese. Neue Tresore entstehen weiterhin mit 600.000 Runden. Beim Speichern wird die Rundenzahl des geöffneten Umschlags fortgeführt, damit Schlüssel und Kopfzeile nie auseinanderlaufen. Zulässig sind 600.000 bis 10.000.000 Runden: die Untergrenze ist der niedrigste je ausgelieferte Wert, die Obergrenze verhindert, dass eine manipulierte Datei den Browser blockiert.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Vorhandene Tresore und Sicherungen öffnen unverändert.

Grenzen: Ein Wechsel auf eine höhere Rundenzahl für einen bereits bestehenden Tresor ist damit noch nicht umgesetzt; er benötigt eine erneute Ableitung aus dem Passwort und wird gesondert behandelt. Die Rundenzahl gehört zur authentifizierten Kopfzeile: Wird sie in der Datei verändert, lässt sich der Tresor nicht öffnen, statt eine billigere Ableitung zu erlauben.

Tests: Neue Datei `tests/vault-iterations.test.mjs` mit drei Fällen - Umschlag mit abweichender Rundenzahl öffnen und erneut speichern, Grenzwerte ablehnen, falsches Passwort und verbogene Rundenzahl zurückweisen.

## 2026-10-29 - Verluste und steuerfreie Altgewinne in der Jahresrechnung lesbar

Anlass: Überwogen die Verluste, stand in der Jahresrechnung „Teilfreistellungen -2.400,00 EUR" und als Folgeformel „2.000,00 EUR - -2.400,00 EUR". Rechnerisch richtig, aber mit doppeltem Vorzeichen nicht lesbar. Umgekehrt erschien ein bestandsgeschützt verkauftes Wertpapier mit einer Jahressumme von null, ohne dass der steuerfrei realisierte Betrag irgendwo stand.

Verhalten: Bei negativer Summe heißt der Posten „Nicht abziehbarer Verlustanteil", wird positiv ausgewiesen und die Folgeformel als Addition dargestellt. Die Fußnote zur Ertragssumme beziffert zusätzlich den bestandsgeschützt und damit steuerfrei realisierten Betrag; bei Vor-2009-Aktien den gesamten Gewinn, bei bestandsgeschützten Alt-Fonds den vor 2018 entstandenen Anteil.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Die Beträge der Modellrechnung bleiben unverändert; nur Benennung und Darstellung ändern sich.

Grenzen: Fehlen Anschaffungsdaten, wird der steuerfreie Anteil nicht geschätzt. Die Fußnote sagt dann ausdrücklich, dass ein bestandsgeschützter Abgang enthalten, sein Anteil aber nicht beziffert ist.

## 2026-10-29 - Steuerbereich führt mit dem Ergebnis, Zahlungsfluss klarer benannt

Anlass: Der Hauptbereich „Steuern" öffnete die Arbeitsliste „Erträge prüfen"; das Jahresergebnis lag auf dem dritten Reiter. Die Kennzahl „Wirtschaftlich · Kontobewegungen" stand unmittelbar neben „Steuerlich · Ertragsbasis", obwohl sie den Netto-Zahlungsfluss einschließlich Käufen zeigt und nicht das wirtschaftliche Ergebnis. Die erklärende Fassung dieser Gegenüberstellung nennt das, die kompakte ließ den Satz weg.

Verhalten: „Steuern" öffnet jetzt die Jahresrechnung, die auch als erster Reiter steht; „Erträge prüfen", „Vorabpauschalen" und „Steuerkonten" folgen. Die Kennzahl heißt „Zahlungsfluss · Konten" und nennt ausdrücklich, dass Käufe und Verkäufe enthalten sind und es sich nicht um ein wirtschaftliches Ergebnis handelt. Die Jahresauswahl kennzeichnet Jahre ohne hinterlegtes Modell mit „kein Jahresmodell"; die Auswahl bleibt möglich, da Journal und Bestände dieser Jahre einsehbar sind.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Reine Benennung, Reihenfolge und Einstiegsziel.

Grenzen: Der Zahlungsfluss bleibt eine Kontogröße und keine Erfolgsrechnung; das wirtschaftliche Ergebnis je Depot steht unverändert unter „Depots & Konten". Ein als „kein Jahresmodell" gekennzeichnetes Jahr liefert weiterhin keinen Steuerbetrag.

Aufräumarbeit: In der Kopfzeile wurde ein unerreichbarer Zweig für „Buchungsjahr gesperrt" entfernt. Er stand hinter einer fest verdrahteten Bedingung und erschien nie, verursachte aber bei jedem Seitenaufbau eine Statusabfrage des Buchungsjahres. Der Zweig wurde nicht aktiviert, weil er das Auswertungsjahr und nicht das Buchungsjahr geprüft hätte; die Jahressperre bleibt wie bisher im Journal geführt.

Tests: 402 Tests. Die Zusicherung auf das alte Kachel-Label wurde auf den neuen Wortlaut umgestellt und um die Erklärzeile ergänzt.

## 2026-10-29 - Standleiste im persönlichen Arbeitsplatz

Anlass: Der wirtschaftliche und der steuerliche Stand waren auf der Übersicht nicht ablesbar. Die Vermögensbewertung lag zugeklappt unter „Weitere Angaben" am Seitenende, der Steuerbetrag nur zwei Ebenen tiefer in der Jahresrechnung; die Bestandsliste nannte ausschließlich Stückzahlen.

Verhalten: Der Arbeitsplatz zeigt direkt unter dem Namen vier abgeleitete Kennzahlen - Vermögen gesamt (Wertpapiere und Geld), nicht realisiertes Ergebnis gegenüber Anschaffungskosten, Summe der Geldkonten und den Steuermodellbetrag des gewählten Jahres samt Abweichung zum erfassten Bankabzug. Jede Kachel führt in den zuständigen Bereich. Die Bestandsliste nennt je Position zusätzlich den bewerteten Betrag und weist ab der siebten Position auf die ausgeblendeten Zeilen hin. Die zugeklappten Blöcke „Arbeitsbereiche im Überblick" (Wiederholung der Hauptnavigation) und „Weitere Angaben: Bewertung und Einrichtung" entfallen.

Auswirkung auf Bestände, Geld und Steuerwerte: keine. Alle Werte stammen unverändert aus `marketReport` und `taxReport`; es wird nur dargestellt, nicht gerechnet. Der Einrichtungshinweis bleibt über die Nächster-Schritt-Karte erhalten.

Grenzen: Fehlende Bewertungskurse werden nicht als Null behandelt. Ohne Kurs erscheint „mindestens" mit der Zahl unbewerteter Positionen, ohne Vergleichswert „Nicht ermittelt", und ein nicht freigegebenes Steuerjahr zeigt „Noch offen" mit der Anzahl offener Punkte statt eines Betrags. Der Steuerbetrag bleibt ein Modellwert und kein Zahlbetrag. Das Auswertungsjahr ist auf der Übersicht weiterhin nicht umschaltbar; die Kachel nennt es deshalb ausdrücklich.

Tests: `tests/experience.test.mjs` und `tests/flexible-workspace.test.mjs` decken Lesefreiheit, Escaping und die Stückanzeige ab. Noch nicht in dieser Umgebung ausgeführt.

## 2026-10-29 - Depotklar 3.4.0 / Engine 2.14.0 / Datenformat 3

Mehrere verschlüsselte Arbeitskopien und Dateiladen ohne Ersetzen vorhandener Tresore. Direkter Dateizugriff in unterstützten Browsern, Speichern unter, Download mit Ablagebestätigung, Warnung vor fehlender externer Sicherung beim Wechsel/Sperren und externe Konflikterkennung. Keine parallele Mehrbenutzer-Netzdatei. Ein bei der Versionsumstellung versehentlich veränderter Paketverweis wurde vor der abschließenden Produktionsfreigabe korrigiert; Abhängigkeitsversionen bleiben gegenüber 3.3 unverändert. Allgemeine Bestands-/Geldansichten über gesamte Historie bis heute; Steuerjahr unabhängig, Jahresabschluss optional, Buchungsjahr aus Datum abgeleitet. Direkte Übersicht gebuchter Stücke und Geldkonten auch ohne Bewertungskurse. Arbeitsweise ist freiwillig. Genaues Kursdatum für Stichtagspools optional, Nachweis des maßgeblichen 2017-Preises bleibt Pflicht. Kirchensteuer-Jahreswerte historisch erhalten; unterjährige Wechsel ausdrücklich dokumentierbar und pauschale Jahressteuer gesperrt. USD-Ablauf mit exakten Original-/historischen EUR-Salden getestet. Fachliche Fremdwährungs- und Quellensteuergrenzen bleiben erhalten.

## 2026-10-29 - Öffentliche Dokumentation zu Depotklar 3.3.0

Öffentliche Anleitungen, vollständiger Feld- und Buchungsartenkatalog, Begriffsglossar, hinterlegte Jahresregeln, nachvollziehbarer Rechenfluss, Quelldateiverzeichnis und KI-Textzugänge. Der Build erstellt die Dokumentation aus freigegebenen Fachtexten und den tatsächlichen Programmkatalogen. Prüfsummen verbinden die Veröffentlichung mit der Implementierung. Die automatischen Prüfungen kontrollieren Dokumentationsstand und verlangen bei Funktionsänderungen eine Änderung dieses Verlaufs. Keine Änderung an Steuerformeln oder Tresordaten.

## 2026-10-29 - Depotklar 3.3.0 / Engine 2.13.0 / Datenformat 3

Datumsbezogene Einstiegshilfe, kontextbezogene Eingabeerklärungen, frei eingebbare Buchungsjahre 1900-2100. Quelle und Ziel von Geld-/Wertpapierüberträgen werden gegen übernommene Tagesabschlüsse geprüft. Vorabpauschalen aus bereits enthaltener Historie werden nicht doppelt addiert. Vor dem ursprünglichen Erwerbsjahr wird keine Vorabpauschale verlangt. Alte Konflikte bleiben lesbar und korrigierbar, betroffene Steuer-/Kontrollresultate bleiben offen.

Nach Jahresende übertragene Lose werden für Vorabpauschalen je Reststück und Empfänger verfolgt. Die Bankansatzmaske bietet belegte Teil-Lose an; eine vereinfachte Eigenrechnung ist dort gesperrt. Offene Historienprüfungen verhindern eine scheinbar endgültige Jahresanzeige. 392 Tests bestanden vor dem Ausbau der Dokumentation; dies ist ein historischer Prüfstand, keine automatisch aktuelle Testanzahl.

## 2026-10-28 - Depotklar 3.2 und 3.1

3.2 vereinheitlichte die Schwarz-Weiß-Oberfläche und reduzierte dauerhaft sichtbare Zusatzangaben. 3.1 ergänzte Fonds-Stichtagspools 2018, wirtschaftlichen Restbuchwert/Altgewinn, Rückwärtsüberleitung und Sammelbelege, getrennte KESt-/Soli-/Kirchensteuerkonten einschließlich Erstattungen, dokumentiertes Auslandsbank-Steuersoll, HS-Steuerkontrollen und geschützte Buchungsjahre. Datenformat 3 wurde eingeführt. Weitere historische Entwicklung und damalige Abnahmen stehen im Prüfprotokoll.

## Pflegepflicht bei jeder Änderung

Jede fachliche oder bedienrelevante Änderung muss hier Datum, Zweck, betroffene Fälle, Berechnungs-/Datenwirkung, Grenzen und relevante Prüfung nennen. Neue Fälle benötigen passende Buchungs-/Feldhilfen und gegebenenfalls ein Fachkapitel. Bei Regeländerungen Engine/Regelpaket gezielt versionieren und die Quellenprüfung dokumentieren. Keine unzutreffenden Behauptungen universeller Steuerfreigabe. Die automatische Erzeugung ersetzt nicht die redaktionelle Erklärung einer neuen Funktion.
