# SpeedTrack UI

Ein modernes, selbst gehostetes Dashboard zur Überwachung der Internetgeschwindigkeit. Es führt automatische Speedtests durch, visualisiert die Ergebnisse und ermöglicht detaillierte Analysen.

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

## Installation (Docker)

Die einfachste Methode zur Installation ist Docker Compose.

1.  **Repository klonen:**
    ```bash
    git clone https://github.com/BiguL91/SpeedTrack-UI.git
    cd SpeedTrack-UI
    ```

2.  **Container starten:**
    ```bash
    docker-compose up -d
    ```

    Die Anwendung ist anschließend unter `http://localhost:8080` erreichbar.

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
| `RETRY_SERVER_STRATEGY` | NEW | Strategie für Serverwahl bei Wiederholung (KEEP = Gleicher, NEW = Neuer Server). |
| `SERVER_BLACKLIST` | (leer) | Kommaseparierte Server-IDs, die bei automatischen Tests ignoriert werden. |

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