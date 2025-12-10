# SpeedTrack UI

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht detaillierte Analysen.


<p align="center"><img src="/bilder/main.png"></p>
![alt text](/bilder/main.png)
</p>
![alt text](/bilder/chart.png)
![alt text](/bilder/details.png)
![alt text](/bilder/historie.png)
![alt text](/bilder/setting.png)


## Features

*   🚀 **Automatisierte Speedtests:** Führt Tests im Hintergrund durch, konfigurierbare Intervalle über die UI.
*   🛡️ **Qualitätssicherung & Wiederholung:** Definiere erwartete Geschwindigkeiten und Toleranz. Bei Unterschreitung werden Tests automatisch mehrfach wiederholt. 
    *   Wähle Strategien für das Endergebnis (Durchschnitt, Minimum, Maximum).
    *   **Neu:** Konfiguriere, ob bei Wiederholungen der gleiche Server genutzt oder ein neuer gesucht werden soll.
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
    *   **CSV Export:** Lade deine gesamte Testhistorie herunter, inklusive manueller Test- und Blacklist-Status sowie aller Detailfelder.
    *   **CSV Import:** Spiele Backups ein oder verschmelze Daten aus anderen Instanzen, wobei alle Status und Details erhalten bleiben.
    *   **Datenbereinigung:** Automatische Löschung alter Testergebnisse nach konfigurierbarer Zeit.
    *   **Datenbank leeren:** Sichere Option zum vollständigen Löschen aller Daten mit vorheriger Backup-Möglichkeit.
*   🌗 **Dark Mode:** Automatische Erkennung (System) oder manueller Umschalter.
*   📱 **Responsive:** Optimiert für Desktop und Mobile.

## Installation

### Option 1: Docker Compose (Empfohlen)

Die einfachste Methode zur Installation ist Docker Compose. Dies zieht das fertige Image direkt von Docker Hub: [bigul91/speed-track-ui](https://hub.docker.com/r/bigul91/speed-track-ui).
```ruby
version: '3.8'

services:
  speed-track-ui:
    image: bigul91/speed-track-ui:latest
    container_name: speed-track-ui
    restart: unless-stopped
    ports:
      - "8888:5000" # Host-Port:Container-Port (Erreichbar unter http://localhost:8080)
    
    volumes:
      - ./data:/app/data # Persistente Speicherung der Datenbank (speedtest.db)

    environment:
      - PORT=5000
      - CRON_SCHEDULE=0 * * * *
      - TZ=Europe/Berlin # Zeitzone setzen für korrekte Cron-Ausführung und Logs
      # Die meisten Einstellungen werden direkt in der Datenbank verwaltet.
      # CRON_SCHEDULE wird nur für die erstmalige Initialisierung des Datenbank-Wertes verwendet.
```

    Die Anwendung ist anschließend unter `http://localhost:8080` erreichbar.


## Konfiguration

Die meisten Einstellungen (z.B. `RETENTION_PERIOD`, `EXPECTED_DOWNLOAD`, `TOLERANCE`, etc.) werden direkt über die Benutzeroberfläche unter "Einstellungen" vorgenommen und in der internen SQLite-Datenbank gespeichert.

Einige initiale oder umgebungsbezogene Werte können jedoch über Umgebungsvariablen in der `docker-compose.yml` oder beim manuellen `docker run` Befehl gesetzt werden:

| Variable | Standardwert in `docker-compose.yml` | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | 5000 | Der interne Port, auf dem der Node.js Backend-Server im Container lauscht. |
| `CRON_SCHEDULE` | `0 * * * *` | Der initiale Cron-Zeitplan für automatische Speedtests. Dieser Wert wird nur beim allerersten Start in die Datenbank geschrieben und kann danach über die UI geändert werden. |
| `TZ` | `Europe/Berlin` | Die Zeitzone des Containers. Wichtig für die korrekte Ausführung von Cronjobs und Zeitstempeln. Passen Sie diesen Wert an Ihre lokale Zeitzone an. |

## Support & Spenden ☕

Wenn Ihnen das Projekt gefällt und Sie die Entwicklung unterstützen möchten, können Sie mir gerne einen Kaffee spendieren: [ko-fi.com/bigul91](https://ko-fi.com/bigul91)

## Updates & Changelog

*   **V1.4.0 (Aktuell):**
    *   **Rebranding:** Projektname geändert zu **SpeedTrack UI**.
    *   **Performance:**
        *   Datenbank-Indexierung für schnellere Abfragen.
        *   Optimiertes Frontend-Rendering (Memoization) für flüssigere Bedienung.
    *   **UI/UX:**
        *   **Neues Einstellungs-Menü:** Komplett überarbeitetes Modal mit Tabs (Planung, Qualität, Erweitert, Datenbank) für bessere Übersichtlichkeit.
    *   **Code-Qualität:** Bereinigung von ungenutztem Code und Abhängigkeiten.
*   **V1.3.3:**
    *   **Live-Monitoring:**
        *   **System Status Panel:** Neues, minimierbares Panel am unteren Bildschirmrand zeigt Live-Statusmeldungen vom Backend (z.B. Start von Tests, Wiederholungsversuche, Serverwechsel).
        *   **Echtzeit-Updates:** Die Testergebnis-Liste und Diagramme aktualisieren sich nun *sofort* automatisch, sobald ein Hintergrundtest abgeschlossen ist (kein Warten mehr auf den Intervall-Timer).
    *   **Bugfixes:**
        *   Behebung eines `ReferenceError` beim Laden der Anwendung.

*   **V1.3.2:**
    *   **Refactoring & Performance:**
        *   **Modularisierung:** Umfangreiche Überarbeitung der Frontend-Architektur. Aufteilung der großen App-Komponente in spezialisierte Module (HistoryTable, Charts, Modals) für bessere Wartbarkeit.
    *   **Bugfixes & UX:**
        *   **Chart-Filterung:** Ignorierte Tests (`excludeFromStats`) werden nun korrekt aus den Linien- und Balkendiagrammen ausgeblendet.
        *   **Responsivität:** Das Dashboard aktualisiert sich nun alle 30 Sekunden (vorher 10s) und reagiert sofort auf Benutzeraktionen wie das Ausschließen von Tests.
        *   **Stabilisierung:** Fix für Listenansicht-Flackern beim Filtern.

*   **V1.3.1:**
    *   **Verbesserungen:**
        *   **Klarere Aggregat-Details:** Bei aggregierten Testergebnissen (Durchschnittswerten) werden irrelevante Detailfelder (wie exakte Downloadzeit, IP, Link) nun ausgeblendet, da sie für einen Durchschnittswert nicht eindeutig sind.
        *   **Präzisere Diagramme:** Die Charts filtern nun einzelne Wiederholungsversuche (Kind-Tests) aus und zeigen nur noch die relevanten Hauptergebnisse (Einzeltests und Aggregate) an.
        *   **Erweiterter CSV-Export:** Der CSV-Export enthält nun alle erweiterten Detailfelder.

*   **V1.3.0:**
    *   **Neue Features:**
        *   **Erweiterte Wiederholungs-Strategie:** Neue Option zur Wahl, ob bei Wiederholungstests der gleiche Server beibehalten (`KEEP`) oder dynamisch ein neuer Server gesucht werden soll (`NEW`, Standard).
        *   **Intelligente Server-Anzeige:** Aggregierte Testergebnisse zeigen nun "Diverse Server" an, wenn mehrere Server in einer Testserie verwendet wurden.
    *   **UI/UX Verbesserungen:**
        *   Blacklist-Icons (`⛔`) jetzt auch in den aufgeklappten Detail-Zeilen der Testlisten sichtbar.
        *   Optimierte Darstellung der Detail-Zeilen (eingerückt, rechtsbündig) zur besseren Unterscheidung von Haupttests.
        *   Verbesserte Navigation: Klick auf Pfeil/ID klappt Gruppe auf, Klick auf Rest der Zeile öffnet Details (auch bei Aggregaten).

*   **V1.2.1:**
    *   **Features:**
        *   **Server Blacklist:** Implementierung einer Funktion zum Ausschließen spezifischer Speedtest-Server-IDs von automatischen Tests (konfigurierbar über UI). Icons visualisieren geblacklistete Server in den Listen.
    *   **Verbesserungen:**
        *   Balkendiagramm "Tests pro Tag" zeigt nun mehr historische Daten an und verwendet sanftere Farbtöne.
        *   CSV Import/Export behält nun den Status von manuellen Tests (`isManual`) und den Statistik-Ausschluss (`excludeFromStats`) bei.
        *   Verbesserung des Styling für Eingabefelder im Einstellungs-Modal.

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
