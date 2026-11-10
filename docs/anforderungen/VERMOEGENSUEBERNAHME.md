# Bestehendes Vermögen übernehmen

Fachliche Anforderung vom 22.10.2026. Die Übernahme muss Bestände und ihre steuerliche Herkunft erhalten. Ein heutiger Marktwert ersetzt weder ursprüngliche Anschaffungskosten noch steuerliche Lose.

## Zwei Wege je Depot und Wertpapier

1. **Historie:** Einzeltransaktionen mit ursprünglichem Datum, Beleg, stabiler ID und Losbezug übernehmen. Käufe, Verkäufe, Überträge, Kapitalmaßnahmen, Vorabpauschalen, Stornos und Korrekturen bleiben einzelne nachvollziehbare Vorgänge. Unbekannte Vorgänge bleiben sichtbar und erfordern Klärung.
2. **Anfangsbestand:** Bestand zu einem eindeutig definierten Stichtag übernehmen. Ein Anfangsbestand besteht aus den zu diesem Zeitpunkt noch vorhandenen ursprünglichen Anschaffungslosen. Stückzahl und steuerliche Werte der verbliebenen Teilstücke müssen sich mit dem Bestandsbeleg abstimmen lassen. Der Stichtag bezeichnet den Tagesabschluss; folgende Bewegungen beginnen am nächsten Kalendertag.

Die Wahl darf je Position unterschiedlich ausfallen. Eine Anfangsposition und die darin bereits enthaltenen historischen Bewegungen dürfen für dieselbe Position nicht gleichzeitig bestandswirksam sein. Historische Unterlagen können daneben als Belege erhalten bleiben. Historienimporte dürfen keine tatsächlich vorhandenen Daten überschreiben.

## Je Anschaffungslos

- Person, Depot, Wertpapier, beständige Los-ID und ursprüngliches Anschaffungsdatum; eine Übertragung verändert das Anschaffungsdatum nicht.
- Ursprüngliche Stückzahl und ursprüngliche gesamte Anschaffungskosten einschließlich zugehöriger Nebenkosten sowie verbliebene Stückzahl und darauf entfallende Kosten getrennt speichern.
- Originalwährung, ursprünglicher Betrag, historischer Umrechnungskurs samt Datum, Richtung und Quelle sowie belegter EUR-Wert müssen ergänzbar bleiben. Steuerlicher Buchwert, ursprüngliche Kosten und Marktwert sind getrennte Werte.
- Bereits angesetzte Vorabpauschalen mit Steuerjahr, Zuflussdatum, ursprünglichem Bruttobetrag vor Teilfreistellung, verbleibendem losbezogenen Betrag und Beleg. Eine unterbliebene Steuerzahlung wegen Freibeträgen bedeutet nicht, dass die angesetzte Vorabpauschale null ist. Beim Import entsteht keine neue Ertragsbuchung.
- Frühere Übertragungen mit Datum, abgebendem und aufnehmendem Depot, Eigentümerwechsel bzw. Übertragungsart, Beleg und Verknüpfung zum ursprünglichen Los. Steuerliche Daten müssen bei Teilüberträgen anteilig fortgeführt werden. Ungeklärte Eigentümerwechsel bedürfen einer eigenen steuerlichen Prüfung.
- Altbestandsstatus ausdrücklich als bestätigt, nicht vorhanden oder ungeklärt führen. Bei Fonds gegebenenfalls Werte der fiktiven Veräußerung zum 31.12.2017, steuerliche Anschaffungskosten ab 01.01.2018, noch zu berücksichtigende Alt-Erträge und Bestandsschutzmerkmale getrennt erhalten. Ein altes Datum allein begründet keine pauschale Steuerfreiheit.
- Quelle und Bearbeitungsstand je Datenbereich. Fehlende Anschaffungskosten oder Vorabpauschalen sind unbekannt; sie werden nicht durch null oder den aktuellen Kurs ersetzt.

## Konten und steuerliche Vorträge

- Geldbestände je Konto und Originalwährung zum Stichtag getrennt von Wertpapierbeständen übernehmen. Für Fremdwährungsbestände müssen gegebenenfalls ursprüngliche Währungsanschaffungslose erhalten bleiben.
- Vorträge nach Person, steuerlichem Geltungsbereich, Jahr, Art, Betrag und Nachweis erfassen. Insbesondere Aktienverlust, sonstiger Kapitalverlust, bankinterne Verlusttöpfe, bescheinigte/finanzamtlich festgestellte Verluste und verbleibender persönlicher Freibetrag für bestandsgeschützte Fondsanteile dürfen nicht vermischt werden.
- Bankinterne und veranlagungsbezogene Werte nicht doppelt ansetzen. Quellensteuerdaten mit Bezugsjahr und Rechtsgrundlage speichern; kein pauschaler unbegrenzter Quellensteuervortrag.
- Keine automatische Fortschreibung ungeprüfter Vorträge oder erneute Hinzurechnung historischer Gewinne, Erträge, Vorabpauschalen oder bereits genutzter Freibeträge als laufende Einnahmen.

## Ablauf und Abnahme

1. Vorschau zeigt Personen, Depots, Positionen, Lose, Geldbestände, Vorträge, Herkunft und sämtliche offenen Angaben vor der Übernahme.
2. Ungültige Verweise, doppelte IDs, negative Stückzahlen, unplausible Daten und abweichende Summen sperren die gesamte Übernahme atomar. Eine wiederholt eingelesene Übernahme-ID führt zu keiner weiteren Buchung.
3. Unvollständige, aber strukturell gültige Bestände dürfen als Entwurf erhalten bleiben. Die Oberfläche kennzeichnet die Lücken; betroffene Steuersummen werden nicht als vollständig oder endgültig ausgewiesen.
4. Zwei Lose mit verschiedenen ursprünglichen Anschaffungsdaten behalten nach Übernahme ihre getrennten FIFO-Positionen. Der Übernahmestichtag wird nicht zum Anschaffungsdatum.
5. Ein späterer Teilverkauf berücksichtigt nur die auf die veräußerten Stücke entfallenden Anschaffungskosten und angesetzten Vorabpauschalen; verbleibende Restbeträge sind abstimmbar.
6. Ein vorheriger Depotübertrag erhält Datum und Kosten der ursprünglichen Lose. Anfangsbestände erhöhen weder laufende Erträge noch steuerpflichtige Gewinne.
7. Altbestandsdaten und steuerliche Vorträge bleiben auch beim Export, Backup und erneuten Import vollständig erhalten. Belegreferenzen müssen auf tatsächlich gesicherte Unterlagen auflösbar sein.
8. Übernahmezeit, Quelldatei/Beleg, Nutzerkorrekturen und Importkennung werden protokolliert. Änderungen lösen eine erneute Prüfung aller betroffenen Folgeperioden aus.

## Amtliche Grundlagen

Am 22.10.2026 abgerufen; die konkrete Berechnung muss die jeweils einschlägige historische Gesetzesfassung berücksichtigen.

- [§ 19 Abs. 1 InvStG](https://www.gesetze-im-internet.de/invstg_2018/__19.html): Beim Verkauf angesetzte Vorabpauschalen in voller Höhe vor einer möglichen Teilfreistellung berücksichtigen.
- [§ 43a Abs. 2 und 3 EStG](https://www.gesetze-im-internet.de/estg/__43a.html): Anschaffungsdaten bei Depotüberträgen sowie Voraussetzungen für die Übermittlung nicht ausgeglichener Verluste.
- [§ 56 InvStG](https://www.gesetze-im-internet.de/invstg_2018/__56.html): Übergangswerte 2017/2018, gesonderte Datenhaltung, bestandsgeschützte Fondsanteile und verbleibender persönlicher Freibetrag.
