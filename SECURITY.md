# Sicherheit

## Eine Schwachstelle melden

Bitte keine Einzelheiten öffentlich nennen, bevor es eine Korrektur gibt. Meldungen gehen an die Kontaktadresse im Impressum der öffentlichen Instanz: https://depotklar.niklaslinke.de/impressum. Ist auf GitHub „Report a vulnerability“ freigeschaltet, geht es auch darüber.

Hilfreich sind: die Version (unten in der Seitenleiste der Anwendung), der Browser, die Schritte zum Nachstellen und was dabei sichtbar oder möglich wurde. Bitte keine echten Tresore, Passwörter oder Belege mitschicken; die Demo (`/app/?demo=1`) oder erfundene Daten genügen.

## Unterstützte Versionen

Korrigiert wird die jeweils neueste Version. Jede Version steht mit Anlass, Verhalten und Tests im Änderungsverlauf (`public-docs/AENDERUNGEN.md`).

## Wie Depotklar Daten schützt

- **Daten bleiben beim Anwender.** Der Server liefert nur Programmdateien aus und speichert nichts. Die Sicherheitsrichtlinie der Seite verbietet jeden Netzabruf der Anwendung (`connect-src 'none'`).
- **Tresor.** AES-256-GCM, Schlüssel per PBKDF2-SHA256 mit 600.000 Runden aus dem Passwort. Kopfzeile und Inhalt sind gemeinsam gesichert: Eine veränderte Tresordatei lässt sich nicht öffnen.
- **Tresordateien.** Ein Stand aus einer Datei ersetzt den Stand im Browser erst, nachdem er sich mit dem Passwort öffnen ließ. Wurde eine verbundene Datei anderswo geändert, überschreibt Depotklar sie nicht, sondern lässt entscheiden.
- **Eingaben.** Texte aus Tresor- und Excel-Dateien werden nur maskiert angezeigt; eine geladene Datei durchläuft dieselbe Prüfung wie jede Eingabe.
- **Lieferkette.** Grundimage mit Prüfsumme, Bibliotheken nach `package-lock.json`, GitHub-Aktionen auf feste Commits; Tests laufen im Build des Images.

Einzelheiten zum Betrieb: [BETRIEB.md](BETRIEB.md). Grenzen: Wer Zugriff auf den entsperrten Browser hat, sieht die Daten; ein vergessenes Passwort lässt sich nicht zurücksetzen.
