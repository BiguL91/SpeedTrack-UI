# SpeedTest Tracker

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht den Export der Daten.

![Screenshot](https://via.placeholder.com/800x400?text=SpeedTest+Tracker+Dashboard)

## Features

*   🚀 **Automatisierte Speedtests:** Stündliche Messungen im Hintergrund (konfigurierbar).
*   📊 **Modernes Dashboard:** Interaktive Diagramme für Download, Upload und Ping.
*   ⚡ **Live-Test:** Starte manuelle Tests und verfolge die Werte in Echtzeit.
*   🌗 **Dark Mode:** Automatische Erkennung oder manueller Umschalter.
*   💾 **Historie & Export:** Speicherung in SQLite-Datenbank und CSV-Export-Funktion.
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

### Option B: Manuell (Node.js)

Voraussetzungen:
*   Node.js (v16+)
*   Ookla Speedtest CLI (muss installiert und im PATH sein: https://www.speedtest.net/apps/cli)

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

Die Konfiguration erfolgt über Umgebungsvariablen (in `docker-compose.yml` oder `.env` im `backend` Ordner).

| Variable | Standard | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | 5000 | Port des Backend-Servers |
| `CRON_SCHEDULE` | `0 * * * *` | Zeitplan für automatische Tests (Cron-Syntax). Standard: Jede Stunde. |

## Technologien

*   **Frontend:** React, Chart.js, CSS Modules
*   **Backend:** Node.js, Express, SQLite, node-cron
*   **Core:** Ookla Speedtest CLI

## Lizenz

MIT
