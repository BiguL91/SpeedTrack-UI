# SpeedTest Tracker

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht detaillierte Analysen.

## Features

*   🚀 **Automatisierte Speedtests:** Stündliche Messungen im Hintergrund (Standard), Intervalle direkt über die UI anpassbar.
*   📊 **Interaktive Diagramme:** Zoom & Pan Funktionen, dynamische Datenauswahl (letzte 5, 10, 20... Tests) und modernes Design.
*   ⚡ **Live-Test:** Starte manuelle Tests und verfolge Ping, Download und Upload in Echtzeit.
*   🔍 **Detail-Ansicht:** Klicke auf Testergebnisse für Details wie Jitter, Paketverlust, externe IP, Server-ID und Datenvolumen.
*   ⚙️ **Einstellungen:** Ändere das Test-Intervall (z.B. alle 10 Min, stündlich, täglich) bequem über das Dashboard.
*   🛡️ **Sicherheit:** Verhindert gleichzeitige Tests (Auto vs. Manuell), um verfälschte Ergebnisse zu vermeiden.
*   🌗 **Dark Mode:** Automatische Erkennung (System) oder manueller Umschalter.
*   💾 **Historie & Export:** Speicherung in persistenter SQLite-Datenbank und CSV-Export-Funktion.
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

Die Grundkonfiguration erfolgt über Umgebungsvariablen oder direkt in der UI.

| Variable | Standard | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | 5000 | Port des Backend-Servers (Intern) |
| `CRON_SCHEDULE` | `0 * * * *` | Initialer Zeitplan. Kann später in der UI unter "Einstellungen" geändert werden. |

## Updates & Changelog

*   **V1.2:**
    *   Detail-Ansicht für Testergebnisse (Jitter, IP, Datenvolumen).
    *   Unterscheidung zwischen manuellen (👤) und automatischen (🤖) Tests in der Liste.
    *   Einstellungs-Modal für Test-Intervalle.
    *   Interaktive Charts mit Zoom-Funktion.
*   **V1.1:**
    *   Datenbank-Persistenz Fix für Docker.
    *   Relative API-Pfade für einfacheres Deployment.

## Technologien

*   **Frontend:** React, Chart.js (mit Zoom-Plugin), CSS Modules
*   **Backend:** Node.js, Express, SQLite, node-cron
*   **Core:** Ookla Speedtest CLI

## Lizenz

MIT