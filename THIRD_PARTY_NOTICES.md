# Komponenten und Daten Dritter

Depotklar hat keine Laufzeitabhängigkeiten auf dem Server. Im Browser werden die folgenden Bibliotheken unverändert aus `dist/vendor/` geladen; sie entstehen beim Build (`npm run build`) aus den Paketen im Lockfile. Ihre Lizenztexte liegen jeweils daneben.

| Komponente | Version | Lizenz | Lizenztext | Zweck |
|---|---|---|---|---|
| ExcelJS | 4.4.0 | MIT | `dist/vendor/EXCELJS-LICENSE.txt` | Excel-Ausgabe, Excel-Vorlage und Excel-Import |
| jsPDF | 4.2.1 | MIT | `dist/vendor/JSPDF-LICENSE.txt` | PDF-Ausgabe |
| jsPDF-AutoTable | 5.0.8 | MIT | `dist/vendor/JSPDF-AUTOTABLE-LICENSE.txt` | Tabellen in der PDF-Ausgabe |

Nur für Entwicklung und Tests, nicht ausgeliefert: `fake-indexeddb` 6.2.4 (Apache-2.0).

Daten:

- **Euro-Referenzkurse** der Europäischen Zentralbank (`dist/rates/`), zur Übernahme eines Tageskurses, wenn eine Abrechnung keinen EUR-Wert nennt. Quelle: EZB Data Portal (data.ecb.europa.eu).
- **Umsatzsteuer-Umrechnungskurse** des Bundesministeriums der Finanzen (§ 16 Abs. 6 UStG), für Konten mit Buchhaltung zum Monatskurs; für Monate ohne amtlichen Wert das Monatsmittel der EZB-Referenzkurse, als vorläufig gekennzeichnet.
- **Basiszinsen** für die Vorabpauschale und weitere Rechenregeln stehen mit amtlicher Quelle in `dist/core/rules.mjs`.
