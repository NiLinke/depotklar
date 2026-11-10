# Tresor, Sicherung und Datenschutz

## Verschlüsselung

Alle Daten liegen verschlüsselt im Browser-Speicher (IndexedDB) dieses Geräts: AES-256-GCM, Schlüssel per PBKDF2-SHA256 mit 600.000 Runden aus dem Passwort. Die Kopfzeile des Tresors ist authentifiziert; eine veränderte Datei lässt sich nicht öffnen. Der Schlüssel liegt nur während einer entsperrten Sitzung im Arbeitsspeicher. Nach zehn Minuten ohne Eingabe sperrt sich der Tresor.

## Speichern

Jede Änderung wird sofort gespeichert, in der Reihenfolge der Änderungen und jeweils mit dem Stand zum Zeitpunkt der Änderung. Sperren, Sicherung und Passwortwechsel warten, bis alles gespeichert ist. Scheitert das Speichern, steht in der Seitenleiste „Nicht gespeichert“, bis der aktuelle Stand gespeichert ist, und der Browser fragt vor dem Schließen nach; wird eine Tresordatei gelöst oder neu verbunden, speichert Depotklar sofort nach. Sperrt sich der Tresor ohne Rückfrage – etwa nach zehn Minuten ohne Eingabe –, bewahrt Depotklar einen nicht gespeicherten Stand verschlüsselt im Arbeitsspeicher auf, solange der Browser offen ist, und bietet ihn beim nächsten Öffnen an: übernehmen, als eigene Datei sichern oder verwerfen. Ist der Tresor in einem zweiten Fenster geändert worden, verweigert Depotklar das Speichern, statt neuere Daten zu überschreiben – dann neu öffnen.

## Mehrere Tresore

In einem Browser lassen sich mehrere Tresore führen, jeder mit eigenem Passwort. Nach dem Sperren stehen sie zur Auswahl. Der Name eines Tresors, der Name einer verbundenen Datei und der Stand der letzten Sicherung liegen unverschlüsselt im Browser; alle Finanzdaten bleiben verschlüsselt. „Aus diesem Browser entfernen“ löscht nur die Kopie im Browser.

## Tresordatei

In Chrome und Edge lässt sich ein Tresor mit einer Datei verbinden. Jede Änderung wird dann zusätzlich verschlüsselt in diese Datei geschrieben; der Browser fragt beim Öffnen des Tresors nach der Erlaubnis. Vor jedem Speichern prüft Depotklar, ob die Datei anderswo neuer geworden ist, und schreibt dann nicht darüber; beim Öffnen gilt der neuere Stand von Browser und Datei. Eine Tresordatei oder Sicherung lässt sich als eigener Tresor öffnen, auch auf einem anderen Gerät; ist es derselbe Tresor, übernimmt Depotklar den neueren Stand. Gleichzeitig an zwei Geräten zu arbeiten, ist nicht vorgesehen.

## Sicherung

Unter „Tresor“ lässt sich eine verschlüsselte Sicherungsdatei herunterladen und auf einem anderen Gerät oder nach Verlust wieder einlesen; sie wird dabei ein eigener Tresor und ersetzt keinen vorhandenen. Ohne verbundene Datei erinnert Depotklar vor dem Sperren an die Sicherung, wenn sich seither etwas geändert hat. Eine Sicherung öffnet nur mit dem Passwort, das beim Speichern galt. Nach einem Passwortwechsel behalten ältere Sicherungen das alte Passwort.

Druck, PDF- und Excel-Export sind unverschlüsselt. Wohin sie gespeichert werden, entscheiden Sie. Die PDF-Vorschau entsteht nur im Browser und wird erst mit „Speichern“ zur Datei.

## Version 3

Depotklar 4 verwendet ein neues Datenformat und einen eigenen Speicherbereich. Ein Tresor der Version 3 bleibt unverändert im Browser liegen, wird aber nicht gelesen. Version 3 wird nicht mehr ausgeliefert.

Tresore aus Depotklar 4.0 werden beim Öffnen um den leeren Bereich für Währungskonten ergänzt. Umgekehrt kann Depotklar 4.0 Daten mit Zinsen, Währungskonten, Schenkungen an mehrere oder einem Jahresabschluss nicht lesen. Seit 4.2 gilt der Jahresabschluss je Person (Bereich `closing`); ein gemeinsamer Abschluss aus 4.1 wird beim Öffnen für jede Person übernommen.

## Keine Verbindungen

Die Anwendung baut keine ausgehenden Verbindungen auf; die Sicherheitsrichtlinie des Servers verbietet sie (`connect-src 'none'`). Keine Konten, keine Analyse, keine Kursabrufe.

## Betrieb auf einem eigenen Server

Depotklar lässt sich als Container im eigenen Netz betreiben, auch ohne Internetzugang. Der Server liefert nur die Programmdateien aus und speichert nichts; die Tresore bleiben verschlüsselt im Browser der Nutzer oder in ihren Tresordateien, gesichert werden diese Dateien. Nötig ist HTTPS: Browser stellen die Verschlüsselung nur über HTTPS oder unter localhost bereit, sonst zeigt Depotklar „Sichere Verbindung nötig“ und nur die Demo läuft. Mit `DEPOTKLAR_SITE=app` liefert der Server nur Anwendung und Handbuch. Die EZB- und Umsatzsteuer-Umrechnungskurse sind dann auf dem Stand des Images; spätere Werte werden von Hand erfasst. Bau, Übertragung ohne Internet, Start mit Sicherheitseinstellungen und Aktualisierung beschreibt `BETRIEB.md` im Quellcode.
