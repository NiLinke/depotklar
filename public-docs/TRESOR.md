# Tresor, Sicherung und Datenschutz

## Verschlüsselung

Alle Daten liegen verschlüsselt im Browser-Speicher (IndexedDB) dieses Geräts: AES-256-GCM, Schlüssel per PBKDF2-SHA256 mit 600.000 Runden aus dem Passwort. Die Kopfzeile des Tresors ist authentifiziert; eine veränderte Datei lässt sich nicht öffnen. Der Schlüssel liegt nur während einer entsperrten Sitzung im Arbeitsspeicher. Nach zehn Minuten ohne Eingabe sperrt sich der Tresor. Ein Passwort mit Umlauten oder Akzenten öffnet auf jedem Gerät, gleich in welcher Unicode-Schreibweise die Tastatur sie liefert.

## Speichern

Jede Änderung wird sofort gespeichert, in der Reihenfolge der Änderungen und jeweils mit dem Stand zum Zeitpunkt der Änderung. Sperren, Sicherung und Passwortwechsel warten, bis alles gespeichert ist. Scheitert das Speichern, steht in der Seitenleiste „Nicht gespeichert“, bis der aktuelle Stand gespeichert ist, und der Browser fragt vor dem Schließen nach; wird eine Tresordatei gelöst oder neu verbunden, speichert Depotklar sofort nach. Sperrt sich der Tresor ohne Rückfrage – etwa nach zehn Minuten ohne Eingabe –, bewahrt Depotklar einen nicht gespeicherten Stand verschlüsselt im Arbeitsspeicher auf, solange der Browser offen ist, und bietet ihn beim nächsten Öffnen an: übernehmen, als eigene Datei sichern oder verwerfen. Ist der Tresor in einem zweiten Fenster geändert worden, verweigert Depotklar das Speichern, statt neuere Daten zu überschreiben – dann neu öffnen.

## Mehrere Tresore

In einem Browser lassen sich mehrere Tresore führen, jeder mit eigenem Passwort. Nach dem Sperren stehen sie zur Auswahl. Der Name eines Tresors, der Name einer verbundenen Datei und der Stand der letzten Sicherung liegen unverschlüsselt im Browser; alle Finanzdaten bleiben verschlüsselt. „Aus diesem Browser entfernen“ löscht nur die Kopie im Browser.

Für getrennte Familien empfiehlt sich je Familie ein eigener Tresor mit eigenem Passwort: Schenkungen und Zusammenveranlagung brauchen die Beteiligten im selben Tresor, alles andere bleibt getrennt. Ab sechs Tresoren hat die Auswahl ein Suchfeld; es sucht im Namen des Tresors und der verbundenen Datei, die Eingabetaste wählt den ersten Treffer. Sind mehrere Tresore im Browser, steht der Name des geöffneten unten in der Seitenleiste.

## Tresordatei

In Chrome und Edge lässt sich ein Tresor mit einer Datei verbinden. Jede Änderung wird dann zusätzlich verschlüsselt in diese Datei geschrieben; der Browser fragt beim Öffnen des Tresors nach der Erlaubnis. Eine Tresordatei oder Sicherung lässt sich als eigener Tresor öffnen, auch auf einem anderen Gerät.

Depotklar merkt sich, mit welchem Stand es die Datei zuletzt gelesen oder geschrieben hat, und erkennt daran, ob sie anderswo geändert wurde – unabhängig von der Revisionsnummer:

- **Nur die Datei wurde geändert** (anderes Gerät): Beim Öffnen gilt der Stand der Datei.
- **Nur dieser Browser ist weiter** (die Datei war eine Zeit lang nicht erreichbar): Es gilt der Browser, die Datei wird fortgeschrieben.
- **Beide wurden geändert:** Depotklar überschreibt nichts. Geöffnet wird der Stand dieses Browsers, gespeichert wird bis zur Entscheidung nur im Browser. Unter „Tresor“ → „Datei“ wählen Sie: Stand der Datei übernehmen, die Datei mit diesem Stand überschreiben, diesen Stand in eine neue Datei speichern oder die Verbindung lösen.
- **Die Datei wurde geändert, während der Tresor offen ist:** Ihre nächste Änderung wird im Browser gespeichert, die Datei bleibt unberührt, und Depotklar fragt wie bei „Beide wurden geändert“, welcher Stand gilt.

Bevor der Stand einer Datei den Stand des Browsers ersetzt, vergleicht Depotklar beim Öffnen beide am Protokoll. Fehlt der Datei eine Änderung dieses Browsers, gilt das als „beide wurden geändert“ – auch wenn der Browser seinen Stand schon in die Datei geschrieben hatte und ein anderes Gerät sie danach mit einem unabhängig weitergeführten Stand ersetzt hat.

Ein Stand aus einer Datei ersetzt den Stand im Browser erst, nachdem er sich mit dem Passwort öffnen ließ. Eine beschädigte Datei ersetzt ihn nie: Depotklar öffnet dann den Stand des Browsers und sagt es. Gehört eine eingelesene Datei zu einem Tresor, den es in diesem Browser schon gibt, und ist sie neuer, wird sie vorgemerkt und beim nächsten Öffnen geprüft und übernommen. Ist sie älter, bleibt der Stand im Browser; wer zum älteren Stand zurück will, entfernt den Tresor zuerst aus dem Browser und öffnet die Datei dann erneut.

**Aufbewahrter Stand.** Ersetzt ein Stand aus einer Datei den Stand dieses Browsers, ohne dessen Änderungen vollständig zu enthalten, bewahrt Depotklar den ersetzten Stand auf: nach Ihrer Entscheidung „Stand der Datei übernehmen“, beim Einlesen einer neueren Datei oder wenn die verbundene Datei anderswo auf einen früheren Stand zurückgesetzt wurde. Unter „Tresor“ lässt er sich wiederherstellen (der jetzige Stand wird dafür aufbewahrt), herunterladen oder verwerfen. Aufbewahrt wird jeweils ein Stand.

Gleichzeitig an zwei Geräten zu arbeiten, ist weiter nicht vorgesehen: Depotklar führt Stände nicht zusammen, es verhindert nur, dass einer den anderen unbemerkt überschreibt.

## Sicherung

Unter „Tresor“ lässt sich eine verschlüsselte Sicherungsdatei herunterladen und auf einem anderen Gerät oder nach Verlust wieder einlesen; sie wird dabei ein eigener Tresor und ersetzt keinen vorhandenen. Ohne verbundene Datei erinnert Depotklar vor dem Sperren an die Sicherung, wenn sich seither etwas geändert hat. Eine Sicherung öffnet nur mit dem Passwort, das beim Speichern galt. Nach einem Passwortwechsel behalten ältere Sicherungen das alte Passwort.

Druck, PDF- und Excel-Export sind unverschlüsselt. Wohin sie gespeichert werden, entscheiden Sie. Die PDF-Vorschau entsteht nur im Browser und wird erst mit „Speichern“ zur Datei.

## Version 3

Depotklar 4 verwendet ein neues Datenformat und einen eigenen Speicherbereich. Ein Tresor der Version 3 bleibt unverändert im Browser liegen, wird aber nicht gelesen. Version 3 wird nicht mehr ausgeliefert.

Tresore aus Depotklar 4.0 werden beim Öffnen um den leeren Bereich für Währungskonten ergänzt. Umgekehrt kann Depotklar 4.0 Daten mit Zinsen, Währungskonten, Schenkungen an mehrere oder einem Jahresabschluss nicht lesen. Seit 4.2 gilt der Jahresabschluss je Person (Bereich `closing`); ein gemeinsamer Abschluss aus 4.1 wird beim Öffnen für jede Person übernommen.

## Keine Verbindungen

Die Anwendung baut keine ausgehenden Verbindungen auf; die Sicherheitsrichtlinie des Servers verbietet sie (`connect-src 'none'`). Keine Konten, keine Analyse, keine Kursabrufe.

## Betrieb auf einem eigenen Server

Depotklar lässt sich als Container im eigenen Netz betreiben, auch ohne Internetzugang. Der Server liefert nur die Programmdateien aus und speichert nichts; die Tresore bleiben verschlüsselt im Browser der Nutzer oder in ihren Tresordateien, gesichert werden diese Dateien. Nötig ist HTTPS: Browser stellen die Verschlüsselung nur über HTTPS oder unter localhost bereit, sonst zeigt Depotklar „Sichere Verbindung nötig“ und nur die Demo läuft. Der Server verlangt über HTTPS, dass der Browser die Adresse ein Jahr lang nur noch verschlüsselt aufruft (`Strict-Transport-Security`). Mit `DEPOTKLAR_SITE=app` liefert der Server nur Anwendung und Handbuch. Die EZB- und Umsatzsteuer-Umrechnungskurse sind dann auf dem Stand des Images; spätere Werte werden von Hand erfasst. Bau, Übertragung ohne Internet, Start mit Sicherheitseinstellungen und Aktualisierung beschreibt `BETRIEB.md` im Quellcode.
