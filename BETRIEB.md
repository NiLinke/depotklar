# Depotklar im eigenen Netz betreiben

Diese Anleitung beschreibt den Betrieb als Container in einem eigenen Netz, auch ohne Internetzugang. Für die öffentliche Instanz siehe [DOKPLOY.md](DOKPLOY.md).

## Aufbau

- **Der Server speichert nichts.** Er liefert nur die Programmdateien aus (`dist/`): keine Datenbank, keine Benutzerkonten, keine Uploads, keine Protokolle außer der Startmeldung. Er beantwortet nur `GET` und `HEAD`.
- **Die Daten liegen beim Nutzer.** Jeder Tresor ist mit AES-256-GCM verschlüsselt; der Schlüssel entsteht im Browser per PBKDF2-SHA256 mit 600.000 Runden aus dem Passwort (mindestens 12 Zeichen). Gespeichert wird im Browser (IndexedDB) und auf Wunsch zusätzlich in einer Tresordatei, etwa auf einem Netzlaufwerk. Nach zehn Minuten ohne Eingabe sperrt sich der Tresor.
- **Keine Verbindungen nach außen.** Die Anwendung lädt nur Dateien vom eigenen Server; die Sicherheitsrichtlinie der Seite verbietet jeden Netzabruf (`connect-src 'none'`). Externe Verweise im Handbuch, etwa auf Gesetzestexte, öffnen sich nur auf Klick.

## Voraussetzungen

- Docker oder eine kompatible Container-Laufzeit.
- **HTTPS über einen Reverse Proxy.** Browser stellen die Verschlüsselung (Web Crypto) nur in einem sicheren Kontext bereit: über HTTPS oder direkt auf dem Rechner unter `localhost`. Über eine unverschlüsselte Adresse wie `http://server:3000` zeigt Depotklar „Sichere Verbindung nötig“; Tresore lassen sich dann nicht anlegen oder öffnen, nur die Demo läuft.
- Ein aktueller Browser. Speichern in eine Tresordatei geht in Chrome und Edge; andere Browser nutzen die Sicherungsdatei.

## Version wählen

Gebaut wird eine Versionsmarke `vX.Y.Z`, nicht der Zweig `main`: `main` ändert sich laufend, unter anderem durch die automatische Kursaktualisierung. Jede Version steht mit Anlass, Verhalten und Grenzen im Änderungsverlauf (`public-docs/AENDERUNGEN.md`).

## Image bauen

Auf einem Rechner mit Internetzugang:

```sh
git clone <Repository> depotklar && cd depotklar
git checkout vX.Y.Z
docker build -t depotklar:X.Y.Z .
```

Der Build verwendet ein fest angegebenes Grundimage mit Prüfsumme (`Dockerfile`, `NODE_IMAGE`) und die Bibliotheken genau nach `package-lock.json`. Er führt alle Tests aus und bricht bei einem Fehler ab. Das fertige Image enthält nur Node.js, `server.mjs` und `dist/`.

## Ohne Internetzugang übertragen

```sh
docker save depotklar:X.Y.Z | gzip > depotklar-X.Y.Z.tar.gz
sha256sum depotklar-X.Y.Z.tar.gz
```

Auf dem Zielsystem nach Prüfung der Prüfsumme:

```sh
gunzip -c depotklar-X.Y.Z.tar.gz | docker load
```

## Starten

Mit der Vorlage `compose.yaml` (Version über `DEPOTKLAR_VERSION`):

```sh
DEPOTKLAR_VERSION=X.Y.Z docker compose up -d --no-build
```

Oder direkt:

```sh
docker run -d --name depotklar --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -e DEPOTKLAR_SITE=app \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 256m depotklar:X.Y.Z
```

Der Container läuft ohne Root-Rechte, braucht kein beschreibbares Dateisystem, kein Volume und keine Netzverbindung nach außen. Der Port wird nur an `127.0.0.1` oder ein internes Netz gebunden; davor steht der Reverse Proxy mit HTTPS und einem Zertifikat, dem die Browser vertrauen.

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port im Container |
| `HOST` | `0.0.0.0` | Adresse im Container |
| `DEPOTKLAR_SITE` | `full` | `app`: nur Anwendung und Handbuch; `/` führt zur Anwendung, Startseite, Impressum und Datenschutz des Projekts entfallen, `robots.txt` sperrt Suchmaschinen. `full`: wie die öffentliche Instanz. |

Zustandsprüfung: `GET /healthz` liefert `{"status":"ok","service":"depotklar"}`; das Image enthält einen `HEALTHCHECK`.

## Sicherheitsmerkmale

- Antworten mit strenger Content-Security-Policy (nur eigene Skripte und Stile, `connect-src 'none'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy` und `Cross-Origin-Resource-Policy: same-origin`, eingeschränkter `Permissions-Policy` und `Cache-Control: no-store`.
- Nur Dateien unterhalb von `dist/`; Pfade außerhalb werden abgewiesen, andere Methoden als `GET` und `HEAD` mit 405 beantwortet.
- Keine Cookies, keine Analyse-, Schrift- oder Werbedienste, keine Telemetrie.
- Tresore lassen sich ohne Passwort nicht lesen, auch nicht vom Betreiber. Ein vergessenes Passwort lässt sich nicht zurücksetzen.
- Jeder GitHub-Lauf baut das Image, führt die Tests aus und startet den Container schreibgeschützt, ohne Linux-Rechte und ohne Rechteausweitung, in beiden Betriebsarten.

## Daten und Sicherung

- Gesichert werden die **Tresordateien** der Nutzer, nicht der Container. Empfohlen: jeder Tresor mit einer Datei auf einem gesicherten Laufwerk verbunden („Tresor“ → „Mit Datei verbinden“); Depotklar schreibt sie nach jeder Änderung und erkennt, wenn die Datei anderswo neuer geworden ist.
- Browserdaten gehören zur Adresse (Protokoll, Host und Port). Wechselt die Adresse, sind die Tresore im Browser dort nicht sichtbar; über die Tresordatei oder eine Sicherungsdatei lassen sie sich unter der neuen Adresse öffnen.
- Richtlinien, die Websitedaten beim Schließen des Browsers löschen, löschen auch Tresore im Browser. Die Depotklar-Adresse davon ausnehmen oder immer mit Tresordatei arbeiten.

## Aktualisieren

Neue Versionsmarke bauen, übertragen, laden und den Container mit dem neuen Image neu starten. Die Daten in Browsern und Tresordateien bleiben unberührt; vor einem Update trotzdem eine Sicherung herunterladen. Ein Rückschritt auf eine ältere Version liest Tresore, die eine neuere Version geschrieben hat, unter Umständen nicht; dann die Sicherung von vor dem Update verwenden.

## Kurse ohne Internetzugang

Die EZB-Referenzkurse und die Umsatzsteuer-Umrechnungskurse sind im Image auf dem Stand des Builds. Danach bleiben die Vorschläge für spätere Tage aus; EUR-Werte und Kurse laut Abrechnung werden dann von Hand erfasst, Umsatzsteuer-Umrechnungskurse und der jährliche Basiszins unter „Kurse“. Ein neues Image bringt die Kurse bis zu seinem Build-Tag mit.

## Lizenzen

Depotklar selbst: alle Rechte vorbehalten; Einsatz nur mit schriftlicher Erlaubnis des Rechteinhabers (README, Abschnitt „Nutzungsrechte“). Komponenten und Daten Dritter: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
