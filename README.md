# SpeedTest Tracker

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht detaillierte Analysen.

## Features

*   🚀 **Automatisierte Speedtests:** Führt Tests im Hintergrund durch, konfigurierbare Intervalle über die UI.
*   🛡️ **Qualitätssicherung & Wiederholung:** Definiere erwartete Geschwindigkeiten und Toleranz. Bei Unterschreitung werden Tests automatisch mehrfach wiederholt. Das Ergebnis (Durchschnitt, Minimum oder Maximum) dieser Serie wird dann gespeichert.
*   🚫 **Server Blacklist:** Schließe bestimmte Speedtest-Server-IDs von automatischen Tests aus. Konfigurierbar über die UI und direkt aus der Test-Detailansicht.
*   📊 **Interaktive Diagramme:** 
    *   Zoom & Pan Funktionen.
    *   **Soll-Werte Visualisierung:** Zeigt eingestellte Grenzwerte als Referenzlinien im Chart.
    *   **Vollbild-Modus:** Klicke auf ein Diagramm für eine vergrößerte Detailansicht mit dynamischem Nachladen von Daten.
    *   **Tests pro Tag Übersicht:** Neues Balkendiagramm visualisiert die Anzahl der bestandenen und nicht bestandenen Tests pro Tag.
*   ⚡ **Live-Test:** Starte manuelle Tests und verfolge Ping, Download und Upload in Echtzeit.
    *   **Statistik-Option:** Entscheide nach einem manuellen Test, ob er in die Statistik einfließen soll.
*   🔍 **Detaillierte Historie & Filter:** 
    *   Filtere Ergebnisse nach Typ (Manuell/Automatisch) und Status (Gewertet/Ignoriert).
    *   Erweiterte Ansicht zeigt alle Testergebnisse an, inklusive aufgeklappter Wiederholungstests.
*   📦 **Gruppierte Testergebnisse:** Aggregierte Ergebnisse von Wiederholungen können aufgeklappt werden.
*   ⚙️ **Umfassende Einstellungen:** Konfiguriere Test-Intervalle (Cron), Datenvorhaltung (Tage), erwartete Geschwindigkeiten, Toleranzen, Wiederholungsanzahl und -strategie, sowie eine Server-Blacklist bequem über das Dashboard.
*   💾 **Daten-Management:**
    *   **Persistente Speicherung:** Alle Ergebnisse in einer SQLite-Datenbank.
    *   **CSV Export:** Lade deine gesamte Testhistorie herunter, inklusive manueller Test- und Blacklist-Status.
    *   **CSV Import:** Spiele Backups ein oder verschmelze Daten aus anderen Instanzen, wobei die Blacklist- und manuellen Test-Status erhalten bleiben.
    *   **Datenbereinigung:** Automatische Löschung alter Testergebnisse nach konfigurierbarer Zeit.
    *   **Datenbank leeren:** Sichere Option zum vollständigen Löschen aller Daten mit vorheriger Backup-Möglichkeit.
*   🌗 **Dark Mode:** Automatische Erkennung (System) oder manueller Umschalter.
*   📱 **Responsive:** Optimiert für Desktop und Mobile.

## Installation (Manuell)

Voraussetzungen:
*   Node.js (v16+)
*   Ookla Speedtest CLI (muss installiert und im PATH sein: [Installationsanleitung](https://www.speedtest.net/apps/cli))

1.  **Repository klonen:**
    ```bash
    git clone https://github.com/BiguL91/SpeedTest-Tracker.git
    cd SpeedTest-Tracker
    ```

2.  **Backend einrichten und starten:**
    ```bash
    cd backend
    npm install
    npm start
    # Der Server läuft standardmäßig auf Port 5000.
    ```

3.  **Frontend einrichten und starten:**
    (In einem *neuen* Terminal)
    ```bash
    cd frontend
    npm install
    npm start
    # Das Frontend läuft standardmäßig auf Port 3000. Öffne http://localhost:3000 im Browser.
    ```

## Konfiguration

Die meisten Einstellungen können direkt über die Benutzeroberfläche unter "Einstellungen" vorgenommen werden. Einige initiale Werte können über Umgebungsvariablen gesetzt werden.

| Variable | Standard (UI-Default) | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | 5000 | Port des Backend-Servers (Intern) |
| `CRON_SCHEDULE` | `0 * * * *` | Initialer Zeitplan für automatische Tests. Kann später in der UI geändert werden. |
| `RETENTION_PERIOD` | 0 | Initialer Wert für die Datenvorhaltung in Tagen (0 = nie löschen). Kann später in der UI geändert werden. |
| `EXPECTED_DOWNLOAD` | 0 | Erwarteter Download-Wert (Mbps). 0 = Funktion deaktiviert. |
| `EXPECTED_UPLOAD` | 0 | Erwarteter Upload-Wert (Mbps). 0 = Funktion deaktiviert. |
| `TOLERANCE` | 10 | Toleranz in Prozent (z.B. 10 für 10%). |
| `RETRY_COUNT` | 3 | Anzahl der Wiederholungen, falls der Wert die Toleranz unterschreitet. |
| `RETRY_DELAY` | 30 | Pause in Sekunden zwischen den Wiederholungen. |
| `RETRY_STRATEGY` | AVG | Strategie zur Berechnung des Endergebnisses (AVG, MIN, MAX). |
| `SERVER_BLACKLIST` | (leer) | Kommaseparierte Server-IDs, die bei automatischen Tests ignoriert werden. |

## Updates & Changelog

*   **V1.2.1 (Aktuell):**
    *   **Features:**
        *   **Server Blacklist:** Implementierung einer Funktion zum Ausschließen spezifischer Speedtest-Server-IDs von automatischen Tests (konfigurierbar über UI). Icons visualisieren geblacklistete Server in den Listen.
    *   **Verbesserungen:**
        *   Balkendiagramm "Tests pro Tag" zeigt nun mehr historische Daten an und verwendet sanftere Farbtöne.
        *   CSV Import/Export behält nun den Status von manuellen Tests (`isManual`) und den Statistik-Ausschluss (`excludeFromStats`) bei.
        *   Verbesserung des Styling für Eingabefelder im Einstellungs-Modal.
    *   **Dokumentation:** README aktualisiert, um neue Features und die manuelle Installation hervorzuheben.

*   **V1.2.0:**
    *   **Erweiterte Charts:**
        *   Anzeige von Soll-Werten (Download/Upload) als Referenzlinien.
        *   **Klick-to-Zoom:** Vollbildmodus für Diagramme mit dynamischem Nachladen von historischen Daten.
    *   **Filter & Organisation:**
        *   Filterung nach Typ (Manuell/Automatisch) und Status (Gewertet/Ignoriert) im Dashboard und der Historie.
        *   Option zum Ausschließen von manuellen Testergebnissen aus der Statistik.
        *   Verbessertes Layout der Testliste (Icons für Status/Typ).
    *   **Stabilität & Sicherheit:**
        *   Timeouts für Speedtest-Prozesse (verhindert Hängenbleiben).
        *   Validierung von Eingabewerten in den Einstellungen.
    *   **UI:** Footer mit Versionsanzeige.

*   **V1.1.0:**
    *   Qualitätssicherung & Wiederholungs-Logik.
    *   Erweiterte Historie & CSV Import/Export.
    *   Datenbank-Persistenz Fix für Docker.

## Technologien

*   **Frontend:** React, Chart.js (mit Zoom-Plugin), CSS Modules
*   **Backend:** Node.js, Express, SQLite, node-cron, multer, csv-parse
*   **Core:** Ookla Speedtest CLI

## Lizenz

MIT
