# SpeedTest Tracker

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht detaillierte Analysen.

## Features

*   🚀 **Automatisierte Speedtests:** Führt Tests im Hintergrund durch, konfigurierbare Intervalle über die UI.
*   🛡️ **Qualitätssicherung & Wiederholung:** Definiere erwartete Geschwindigkeiten und Toleranz. Bei Unterschreitung werden Tests automatisch mehrfach wiederholt. Das Ergebnis (Durchschnitt, Minimum oder Maximum) dieser Serie wird dann gespeichert.
*   📊 **Interaktive Diagramme:** Zoom & Pan Funktionen, dynamische Datenauswahl (letzte 5, 10, 20... Tests) und modernes Design.
*   ⚡ **Live-Test:** Starte manuelle Tests und verfolge Ping, Download und Upload in Echtzeit.
*   🔍 **Detaillierte Historie:** Eine erweiterte Ansicht zeigt alle Testergebnisse an, inklusive aufgeklappter Wiederholungstests.
*   📦 **Gruppierte Testergebnisse:** Aggregierte Ergebnisse von Wiederholungen können aufgeklappt werden, um die einzelnen Messungen der Testserie anzuzeigen.
*   ⚙️ **Umfassende Einstellungen:** Konfiguriere Test-Intervalle (Cron), Datenvorhaltung (Tage), erwartete Geschwindigkeiten, Toleranzen, Wiederholungsanzahl und -strategie bequem über das Dashboard.
*   💾 **Daten-Management:**
    *   **Persistente Speicherung:** Alle Ergebnisse in einer SQLite-Datenbank.
    *   **CSV Export:** Lade deine gesamte Testhistorie herunter.
    *   **CSV Import:** Spiele Backups ein oder verschmelze Daten aus anderen Instanzen.
    *   **Datenbereinigung:** Automatische Löschung alter Testergebnisse nach konfigurierbarer Zeit.
    *   **Datenbank leeren:** Sichere Option zum vollständigen Löschen aller Daten mit vorheriger Backup-Möglichkeit.
*   🌗 **Dark Mode:** Automatische Erkennung (System) oder manueller Umschalter.
*   📱 **Responsive:** Optimiert für Desktop und Mobile.

## Installation

### Option A: Docker (Empfohlen)

1.  Klone das Repository:
    ```bash
    git clone https://github.com/BiguL91/SpeedTest-Tracker.git
    cd SpeedTest-Tracker
    ```

2.  Starte den Container:
    ```bash
    docker-compose up -d --build
    ```

3.  Öffne `http://localhost:8080` im Browser.
    *(Daten werden im Ordner `./data` persistent gespeichert)*

### Option B: Manuell (Node.js)

Voraussetzungen:
*   Node.js (v16+)
*   Ookla Speedtest CLI (muss installiert und im PATH sein: [Installationsanleitung](https://www.speedtest.net/apps/cli))

1.  **Repository klonen:**
    ```bash
    git clone https://github.com/BiguL91/SpeedTest-Tracker.git
    cd SpeedTest-Tracker
    ```

2.  **Backend einrichten:**
    ```bash
    cd backend
    npm install
    # Starte Server (Port 5000)
    npm start
    ```

3.  **Frontend einrichten:**
    (In neuem Terminal)
    ```bash
    cd frontend
    npm install
    # Starte React Dev Server (Port 3000)
    npm start
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

## Updates & Changelog

*   **V1.3 (Aktuell):**
    *   **Qualitätssicherung & Wiederholungs-Logik:** Einstellbare Referenzwerte, Toleranz, Wiederholungen, Strategie.
    *   **Erweiterte Historie:** Aufklappbare Gruppen für Wiederholungstests im Dashboard und der vollständigen Historie.
    *   **Daten-Management:** Konfigurierbare Datenvorhaltung, sicheres Leeren der Datenbank mit Backup-Option.
    *   **CSV Import/Export:** Importfunktion für Testergebnisse, Export erweitert um `groupId` und `isAggregate`.
    *   **UI/UX Verbesserungen:**
        *   Layout der Dashboard-Karten bei leerer DB verbessert.
        *   Platzierung des "Nächster Test" Badges.
        *   Anzeige des "Letzter Test" Zeitstempels mit Jahr.
        *   Verbessertes Styling für Buttons und Icons (Settings-Modal, Import/Export, Historie).

*   **V1.2:**
    *   Detail-Ansicht für Testergebnisse (Jitter, IP, Datenvolumen).
    *   Unterscheidung zwischen manuellen (👤) und automatischen (🤖) Tests in der Liste.
    *   Einstellungs-Modal für Test-Intervalle.
    *   Interaktive Charts mit Zoom-Funktion.
*   **V1.1:**
    *   Datenbank-Persistenz Fix für Docker.
    *   Relative API-Pfade für einfachereres Deployment.

## Technologien

*   **Frontend:** React, Chart.js (mit Zoom-Plugin), CSS Modules
*   **Backend:** Node.js, Express, SQLite, node-cron, multer, csv-parse
*   **Core:** Ookla Speedtest CLI

## Lizenz

MIT