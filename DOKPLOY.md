# Depotklar auf depotklar.niklaslinke.de bereitstellen

Repository: **https://github.com/NiLinke/depotklar**, öffentlich, Branch **main**. Landingpage und Anwendung werden gemeinsam als eine Dokploy-Application bereitgestellt. Der Server liefert Programmdateien; Finanzdaten bleiben verschlüsselt im Browserprofil. Keine Finanzdatenbank, Upload-API oder Synchronisation.

## 1. GitHub verbinden

Ist dein GitHub-Konto bereits in Dokploy verbunden, gib der vorhandenen Dokploy-GitHub-App Zugriff auf **NiLinke/depotklar**: GitHub → **Settings → Applications → Installed GitHub Apps → Dokploy → Configure**. Bei ausgewählten Repositories das neue Repository ergänzen; vorhandene Freigaben erhalten.

Ohne Verbindung: Dokploy → **Git → GitHub → Create GitHub App → Install → Install & Authorize**. Das persönliche Konto und die benötigten Repositories wählen. Keine Tokens in öffentlich ausgelieferte Dateien oder ins Repository eintragen.

## 2. Eine Application erstellen

Projekt **Depotklar** und darin eine **Application** anlegen. Diese Einstellungen verwenden:

| Einstellung | Wert |
|---|---|
| Git Provider | GitHub / verbundene Dokploy-App |
| Owner | `NiLinke` |
| Repository | `depotklar` |
| Branch | `main` |
| Build Path / Repository-Verzeichnis | `/` (Repositorywurzel) |
| Build Type | **Dockerfile** |
| Dockerfile Path | `Dockerfile` |
| Docker Context Path | `.` |
| Docker Build Stage | leer lassen |
| Start Command / Command Override | leer lassen |
| Publish Directory | leer lassen |

Das Dockerfile installiert festgeschriebene Abhängigkeiten, führt die Tests aus und erstellt die lokalen Browserbibliotheken. Die letzte Produktionsstufe enthält nur Programmdateien und den statischen Server. Der Container startet als Benutzer `node` auf **0.0.0.0:3000**. `HOST`, `PORT` und `NODE_ENV` sind im Image gesetzt. Keine zusätzlichen Anwendungsvariablen, Secrets, Datenvolumes oder Datenbanken erforderlich. Den Buildtyp nicht auf „Static“ ändern, da die Anwendung eigene Routen und Sicherheitsheader verwendet.

## 3. Domain und HTTPS

Unter **Domains → Create Domain**:

| Einstellung | Wert |
|---|---|
| Host | `depotklar.niklaslinke.de` (ohne `https://`) |
| Path | `/` |
| Internal Path | `/` bzw. unverändert |
| Strip Path | aus |
| Container Port | **3000** |
| HTTPS | **an** |
| Certificate | **Let's Encrypt** |

**Eine Domainzuordnung für `/` reicht.** Die Anwendung unter `/app/` und alle Unterseiten werden mitgeliefert. Unter **Advanced → Ports** keine zusätzliche öffentliche Portfreigabe anlegen. Der interne Container-Port 3000 kollidiert nicht mit dem Dokploy-Panel; Traefik leitet die Domain intern zum Container.

**Deploy** anklicken. Im Protokoll müssen Tests und Build erfolgreich abschließen. 80/443 müssen für Traefik erreichbar sein. Falls ein AAAA-Eintrag existiert, muss auch er zum richtigen Server gehören. Für echte Tresore erst eine gültige HTTPS-Verbindung verwenden.

## 4. Nach dem Deployment prüfen

- `https://depotklar.niklaslinke.de/` → Landingpage.
- `https://depotklar.niklaslinke.de/app/` → Anwendung / vorhandener lokaler Tresor.
- `https://depotklar.niklaslinke.de/app/?demo=1#family` → fiktive Familienübertragung.
- `https://depotklar.niklaslinke.de/healthz` → `{"status":"ok","service":"depotklar"}`.
- `/impressum` und `/datenschutz` → Betreiberangaben und Datenschutzhinweise.

Zusätzlich zum Healthcheck die Demo öffnen. Vor echten Daten einen eigenen Testtresor anlegen, einen Testbestand erfassen, verschlüsseltes Backup herunterladen und in einem separaten Browserprofil wiederherstellen. Der Betreiber benötigt für diese Prüfung keine echten Bankunterlagen.

**Von localhost umziehen:** Im bisherigen Browser unter **Datentresor → Backup herunterladen** sichern und auf der HTTPS-Domain wiederherstellen. Lokale Daten gehören zu Protokoll + Host + Port. Ein anderer Pfad innerhalb derselben Origin, also `/` → `/app/`, ändert den vorhandenen Tresor nicht. Der Wechsel von localhost oder HTTP auf die produktive HTTPS-Domain benötigt dagegen die Backupübernahme.

## 5. Automatische Bereitstellung

Bei der GitHub-App-Verknüpfung unterstützt Dokploy automatische Deployments bei Push auf den ausgewählten Branch. Unter **General** den Schalter **Auto Deploy** prüfen/aktivieren und Branch `main` verwenden. Normalerweise ist dabei kein zusätzlicher manuell angelegter GitHub-Webhook nötig.

GitHub Actions prüft Tests, Asset-Build, Docker-Build und den gestarteten Produktionscontainer mit schreibgeschütztem Dateisystem. Native Dokploy-Deployments können parallel zur CI beginnen; die Tests laufen deshalb zusätzlich im Dockerfile selbst. Schlägt ein Test fehl, entsteht kein neues Produktionsimage. Ein erfolgreicher GitHub-Lauf allein ist kein Nachweis eines Deployments auf deinem Server.

Es wurde kein Dokploy-API-Token, Deployment-Webhook oder Serverzugang im Repository gespeichert. Repository und Domain müssen einmal in deinem Dokploy-Panel ausgewählt werden. Ein GitHub-Repository allein startet noch keinen Container.

## 6. Updates und Betrieb

Vor fachlichen Updates jeden betroffenen Browser-Tresor extern sichern. Danach entsperren, Salden und Lose prüfen und erneut sichern. Ein Container-Rollback setzt lokale Datenversionen nicht zurück. Bei neueren Datenversionen eine kompatible Anwendung oder das frühere Backup verwenden; keine Browserdaten zur Reparatur löschen. Weitere Grenzen: `README.md`.

Verschlüsselte Backups auf mindestens einem zusätzlichen Datenträger aufbewahren. Servervolumes enthalten keine Finanzdaten. Das Passwort wird für jede Wiederherstellung benötigt.

Impressum und Datenschutzhinweise müssen zum tatsächlichen Betreiber und Hosting passen. Server- und Proxyprotokolle sowie Löschfristen richten sich nach der tatsächlichen Konfiguration; bei weiteren Diensten die Datenschutzhinweise ergänzen. Die Startseite setzt keine Cookies und verwendet keine externen Schrift-, Analyse- oder Werbedienste.

## Häufige Startprobleme

| Symptom | Prüfen |
|---|---|
| Repository fehlt | Dokploy-GitHub-App hat Zugriff auf das Repository; Liste aktualisieren |
| COPY / Build-Kontext schlägt fehl | Repositorywurzel `/`, Kontext `.`, Dockerfile `Dockerfile` |
| 502 / Bad Gateway | Container läuft, Domain-Port `3000`, Command Override leer |
| 404 / andere Website | Richtige Application, Host korrekt, Pfad `/`, keine konkurrierende Domainzuordnung |
| Zertifikatswarnung | Let's Encrypt, A/AAAA, 80/443 und Traefik-/Zertifikatslogs prüfen |
| Excel-Modul fehlt | Docker-Build erfolgreich; `/vendor/exceljs.min.js` muss 200 liefern |
| Alter Tresor scheinbar weg | Gleicher Browser und gleiche Origin? Von localhost/HTTP per Backup übernehmen |
| Kein Deployment nach Push | Auto Deploy, Branch `main` und GitHub-App-Verbindung prüfen |

## Optionaler lokaler Container-Test

```sh
docker build -t depotklar .
docker run --rm -p 4173:3000 --read-only --cap-drop ALL --security-opt no-new-privileges depotklar
```

Dann `http://localhost:4173` öffnen. Docker-Build und Containerstart werden zusätzlich bei jedem Push in GitHub Actions geprüft. Für den Betrieb im eigenen Netz siehe [BETRIEB.md](BETRIEB.md).

Offizielle Dokploy-Anleitung, geprüft am 22.10.2026: [GitHub](https://docs.dokploy.com/docs/core/github), [Dockerfile Build Type](https://docs.dokploy.com/docs/core/applications/build-type), [Domains](https://docs.dokploy.com/docs/core/domains), [Auto Deploy](https://docs.dokploy.com/docs/core/auto-deploy).
