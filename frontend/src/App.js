import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import './App.css';
import packageJson from '../package.json';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

function App() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  
  // Erweiterter State für Statistiken (Avg, Min, Max)
  const [stats, setStats] = useState({
    download: { avg: 0, min: 0, max: 0 },
    upload: { avg: 0, min: 0, max: 0 },
    ping: { avg: 0, min: 0, max: 0 }
  });
  
  // Neuer State für die Live-Werte aller Metriken gleichzeitig
  const [currentTestValues, setCurrentTestValues] = useState({ download: 0, upload: 0, ping: 0 });
  
  // Theme State: 'light', 'dark', oder 'auto'
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'auto');
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [cronSchedule, setCronSchedule] = useState('0 * * * *'); // Der "echte" Cron-String für Backend
  
  // UI State für den Settings-Dialog
  const [intervalBase, setIntervalBase] = useState('1h'); // '5m', '10m', '30m', '1h', '2h', '3h', '4h', '6h', '12h', '24h'
  const [startTime, setStartTime] = useState('00:00'); // HH:mm

  const [visibleCount, setVisibleCount] = useState(5); // Wie viele Tests anzeigen?
  const [selectedTest, setSelectedTest] = useState(null); // Für Detail-Ansicht
  const [chartDataLimit, setChartDataLimit] = useState(20); // Wie viele Tests im Chart anzeigen? (0 = Alle)
  
  // View State: 'dashboard' oder 'history'
  const [view, setView] = useState('dashboard');
  
  // Filter State
  const [filterSource, setFilterSource] = useState('all'); // 'all', 'manual', 'auto', 'aggregate'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'included', 'excluded'

  // Einstellung für Datenvorhaltung (in Tagen, 0 = nie löschen)
  const [retentionPeriod, setRetentionPeriod] = useState('0');
  
  // QS / Retry Settings
  const [expectedDownload, setExpectedDownload] = useState('0');
  const [expectedUpload, setExpectedUpload] = useState('0');
  const [tolerance, setTolerance] = useState('10');
  const [retryCount, setRetryCount] = useState('3');
  const [retryDelay, setRetryDelay] = useState('30');
  const [retryStrategy, setRetryStrategy] = useState('AVG');

  // Confirm Flow State: null -> 'backup' -> 'delete'
  const [confirmStep, setConfirmStep] = useState(null);

  // State für das Ergebnis-Modal nach manuellem Test
  const [manualResult, setManualResult] = useState(null); // Das Ergebnis-Objekt
  
  // State für aufgeklappte Gruppe (ID)
  const [expandedGroupId, setExpandedGroupId] = useState(null);

  // Toast Notification State
  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000); // Nach 3 Sekunden ausblenden
  };

  // Funktion um Test aus Statistik auszuschließen
  const toggleExcludeStats = async (testId, exclude) => {
      try {
          await axios.patch(`/api/results/${testId}/exclude`, { exclude });
          showToast(exclude ? "Test wird ignoriert." : "Test wieder aufgenommen.", "success");
          fetchHistory(view === 'dashboard' ? 50 : 0); // Reload
          setManualResult(null); // Modal schließen falls offen
          if (selectedTest && selectedTest.id === testId) {
             setSelectedTest(prev => ({...prev, excludeFromStats: exclude ? 1 : 0}));
          }
      } catch (err) {
          showToast("Fehler beim Aktualisieren: " + err.message, "error");
      }
  };

  // --- CRON LOGIC HELPERS ---

  // Generiert den Cron-String aus Intervall und Startzeit
  const generateCron = (interval, timeStr) => {
    const [hh, mm] = timeStr.split(':').map(Number);
    
    if (interval === '5m') {
        // Alle 5 Min ab MM. 
        // Node-cron syntax für offset: "3-59/5 * * * *" startet bei Minute 3
        const startMin = mm % 5;
        return `${startMin}-59/5 * * * *`;
    }
    if (interval === '10m') {
        const startMin = mm % 10;
        return `${startMin}-59/10 * * * *`;
    }
    if (interval === '30m') {
        const startMin = mm % 30;
        return `${startMin}-59/30 * * * *`;
    }
    if (interval === '1h') {
        // Jede Stunde bei Minute mm
        return `${mm} * * * *`;
    }
    if (interval === '24h') {
        // Täglich um hh:mm
        return `${mm} ${hh} * * *`;
    }
    
    // Für X Stunden (2, 3, 4, 6, 12)
    // Wir müssen eine Liste von Stunden generieren, startend bei hh
    const hoursGap = parseInt(interval.replace('h', ''));
    if (!isNaN(hoursGap)) {
        let hours = [];
        // Finde den ersten Startpunkt am Tag (könnte gestern gewesen sein, aber wir nehmen hh als Anker)
        // Wir wollen: hh, hh+gap, hh+2gap... modulo 24.
        // Sortiert aufsteigend für Cron.
        
        let startHour = hh % hoursGap; // Normalisiert auf den Tag
        // Wenn User 14:00 wählt und alle 4h, dann: 2, 6, 10, 14, 18, 22.
        // Das ist besser als stur bei 14 anzufangen und 14, 18, 22, (morgen 02) zu machen.
        // Wir richten es am Tag aus, damit der Cron clean bleibt "2,6,10,14...".
        // ABER: Wenn User explizit 14:00 will, erwartet er vllt dass 14:00 der ERSTE ist.
        // Bei Cron "2,6,10,14" läuft er um 2 Uhr nachts auch. Das ist bei "Alle 4h" aber korrekt.
        // Nur "Täglich" ist einmalig.
        
        for (let h = startHour; h < 24; h += hoursGap) {
            hours.push(h);
        }
        return `${mm} ${hours.join(',')} * * *`;
    }

    return '0 * * * *'; // Fallback
  };

  // Liest den Cron-String und setzt UI States (Best Guess)
  const parseCronToState = (cronStr) => {
    try {
        const parts = cronStr.split(' ');
        const minPart = parts[0];
        const hourPart = parts[1];

        let parsedTime = '00:00';
        let parsedInterval = '1h';

        // Helper für Minute
        const getMin = (p) => {
            if (p.includes('-')) return parseInt(p.split('-')[0]); // "3-59/5" -> 3
            if (p.includes('/')) return 0; // "*/5" -> 0
            return parseInt(p); // "15" -> 15
        };
        
        const mm = getMin(minPart);
        const mmStr = mm.toString().padStart(2, '0');

        // Check Interval
        if (minPart.includes('/5')) { parsedInterval = '5m'; parsedTime = `00:${mmStr}`; }
        else if (minPart.includes('/10')) { parsedInterval = '10m'; parsedTime = `00:${mmStr}`; }
        else if (minPart.includes('/30')) { parsedInterval = '30m'; parsedTime = `00:${mmStr}`; }
        else if (hourPart === '*') {
            // Hourly: "15 * * * *"
            parsedInterval = '1h';
            parsedTime = `00:${mmStr}`; // Stunde egal bei stündlich, wir zeigen nur Min an eigentlich, aber User hat Input type=time
        }
        else if (hourPart.includes(',') || !isNaN(parseInt(hourPart))) {
            // Liste "2,6,10" oder Einzelwert "14"
            const hours = hourPart.split(',').map(Number);
            
            if (hours.length === 1) {
                // Täglich
                parsedInterval = '24h';
                parsedTime = `${hours[0].toString().padStart(2, '0')}:${mmStr}`;
            } else {
                // X Stunden
                // Abstand ermitteln
                const gap = hours.length > 1 ? (hours[1] - hours[0]) : 24;
                parsedInterval = `${gap}h`;
                
                // Als Startzeit nehmen wir die erste Stunde in der Liste, oder besser:
                // Wir versuchen die aktuelle Zeit zu matchen? Nein, einfach die erste der Liste.
                // Oder wir lassen den User 00:mm sehen.
                // Nehmen wir die erste Stunde der Liste.
                parsedTime = `${hours[0].toString().padStart(2, '0')}:${mmStr}`;
            }
        }
        
        setIntervalBase(parsedInterval);
        setStartTime(parsedTime);

    } catch (e) {
        console.error("Fehler beim Parsen des Cron Strings für UI", e);
        // Fallbacks
        setIntervalBase('1h');
        setStartTime('00:00');
    }
  };

  const getNextRunTime = () => {
    if (!cronSchedule) return 'Lädt...';

    try {
        const parser = (str) => {
            // Sehr rudimentärer Parser für die Anzeige
            const now = new Date();
            let next = new Date(now);
            next.setMilliseconds(0);
            next.setSeconds(0);

            const parts = str.split(' ');
            const minStr = parts[0];
            const hourStr = parts[1];

            // 1. Minute bestimmen
            let addHour = false;
            
            // Logik für Minuten-Intervall
            if (minStr.includes('/')) {
                // z.B. 3-59/5 oder */5
                const offset = minStr.includes('-') ? parseInt(minStr.split('-')[0]) : 0;
                const step = parseInt(minStr.split('/')[1]);
                
                // Nächster Step finden
                let found = false;
                for (let m = offset; m < 60; m += step) {
                    if (m > now.getMinutes()) {
                        next.setMinutes(m);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    next.setMinutes(offset); // Nächste Stunde, erster Slot
                    addHour = true;
                }
            } else {
                // Feste Minute (z.B. "15")
                const fixedMin = parseInt(minStr);
                next.setMinutes(fixedMin);
                if (now.getMinutes() >= fixedMin) {
                    addHour = true;
                }
            }

            // 2. Stunde bestimmen
            if (hourStr === '*') {
                if (addHour) next.setHours(now.getHours() + 1);
            } else {
                // Feste Stunden oder Liste (2,6,10)
                const validHours = hourStr.split(',').map(Number).sort((a,b)=>a-b);
                
                let currentH = now.getHours();
                if (addHour) currentH++; // Wir sind schon über die Minute hinaus in dieser Stunde

                // Suche nächste valide Stunde
                let foundH = -1;
                for (let h of validHours) {
                    if (h >= currentH) {
                        foundH = h;
                        break;
                    }
                }

                if (foundH !== -1) {
                    next.setHours(foundH);
                    // Falls wir heute sind aber die Stunde "kleiner" ist als jetzt (passiert nicht durch loop)
                    // Falls wir durch addHour in den nächsten Tag rutschen würden (z.B. 23 Uhr -> 24 Uhr)
                    if (foundH < now.getHours()) {
                         next.setDate(now.getDate() + 1);
                    }
                } else {
                    // Keine Stunde mehr heute übrig -> Nimm erste Stunde morgen
                    next.setDate(now.getDate() + 1);
                    next.setHours(validHours[0]);
                }
            }
            
            return next;
        };

        const nextDate = parser(cronSchedule);
        
        // Formatierung
        const now = new Date();
        const isToday = nextDate.getDate() === now.getDate() && nextDate.getMonth() === now.getMonth();
        const isTomorrow = new Date(now.getTime() + 86400000).getDate() === nextDate.getDate();
        const timeStr = nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
        if (isToday) return `Heute, ${timeStr} Uhr`;
        if (isTomorrow) return `Morgen, ${timeStr} Uhr`;
        return `${nextDate.toLocaleDateString()} ${timeStr} Uhr`;

    } catch (err) {
      console.error("NextRun Parser Fehler:", err);
      return cronSchedule;
    }
  };

  // Helper um Server Location sauber anzuzeigen (ohne ID im Text) und zu formatieren
  const formatServerDisplay = (test) => {
      let displayLocation = test.serverLocation || '';
      let displayId = test.serverId;

      // Für alte manuelle Tests, bei denen die ID noch im Location-String steckt:
      // Versuche, die ID aus dem Location-String zu extrahieren, wenn test.serverId fehlt
      if (!displayId && displayLocation) {
          const embeddedIdMatch = displayLocation.match(/\(id\s*[=:]\s*(\d+)\)/i);
          if (embeddedIdMatch && embeddedIdMatch[1]) {
              displayId = embeddedIdMatch[1];
          }
      }

      // Entferne immer die (id=...) oder (ID=...) Teile aus dem Location-String für eine saubere Anzeige
      displayLocation = displayLocation.replace(/\s*\(id\s*[=:]\s*\d+\)/gi, '').trim();

      let formattedString = displayLocation;
      if (displayId) {
          formattedString += ` (ID: ${displayId})`;
      }
      return formattedString;
  };

  const fetchSettings = useCallback(async () => {
    try {
        const response = await axios.get('/api/settings');
        const loadedCron = response.data.cron_schedule;
        setCronSchedule(loadedCron);
        parseCronToState(loadedCron); 
        setRetentionPeriod(response.data.retention_period);
        
        setExpectedDownload(response.data.expected_download);
        setExpectedUpload(response.data.expected_upload);
        setTolerance(response.data.tolerance);
        setRetryCount(response.data.retry_count);
        setRetryDelay(response.data.retry_delay);
        setRetryStrategy(response.data.retry_strategy);
    } catch (err) {
        console.error("Fehler beim Laden der Einstellungen", err);
    }
  }, []);

  // Settings speichern
  const saveSettings = async () => {
    try {
        const newCron = generateCron(intervalBase, startTime);
        const newRetention = retentionPeriod; 
        
        await axios.post('/api/settings', { 
            cron_schedule: newCron,
            retention_period: newRetention,
            expected_download: expectedDownload,
            expected_upload: expectedUpload,
            tolerance: tolerance,
            retry_count: retryCount,
            retry_delay: retryDelay,
            retry_strategy: retryStrategy
        });
        
        setCronSchedule(newCron);
        setRetentionPeriod(newRetention);
        // Andere States sind schon gesetzt durch Input
        setShowSettings(false);
        showToast("Einstellungen erfolgreich gespeichert! ✅", "success");
    } catch (err) {
        showToast("Fehler beim Speichern: " + (err.response?.data?.error || err.message), "error");
    }
  };

  // --- RESET DATABASE FLOW ---
  const startResetFlow = () => {
      setConfirmStep('backup');
  };

  const handleBackupChoice = (shouldBackup) => {
      if (shouldBackup) {
          const link = document.createElement('a');
          link.href = '/api/export';
          link.setAttribute('download', 'speedtest_backup.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
      setConfirmStep('delete');
  };

  const handleFinalDelete = async () => {
      try {
          await axios.post('/api/reset-db');
          showToast("Datenbank erfolgreich geleert! 🗑️", "success");
          fetchHistory(); // Ansicht aktualisieren
          setConfirmStep(null);
          setShowSettings(false); // Modal schließen
      } catch (err) {
          showToast("Fehler beim Leeren der DB: " + (err.response?.data?.error || err.message), "error");
      }
  };

  const toggleExpand = (groupId) => {
      if (expandedGroupId === groupId) {
          setExpandedGroupId(null);
      } else {
          setExpandedGroupId(groupId);
      }
  };

  // --- CSV IMPORT ---
  const fileInputRef = React.useRef(null);

  const handleImportClick = () => {
      fileInputRef.current.click();
  };

  const handleFileUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
          setLoading(true); // Kurzes Laden anzeigen
          const response = await axios.post('/api/import', formData, {
              headers: {
                  'Content-Type': 'multipart/form-data'
              }
          });
          showToast(response.data.message, "success");
          fetchHistory(); // Refresh
      } catch (err) {
          showToast("Import Fehler: " + (err.response?.data?.error || err.message), "error");
      } finally {
          setLoading(false);
          // Reset input damit man die gleiche Datei nochmal wählen kann
          event.target.value = null; 
      }
  };

  // Theme Logik
  useEffect(() => {
    const applyTheme = (themeName) => {
      let activeTheme = themeName;
      if (themeName === 'auto') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        activeTheme = systemPrefersDark ? 'dark' : 'light';
      }
      document.body.setAttribute('data-theme', activeTheme);
      
      // Chart.js globale Standards anpassen
      ChartJS.defaults.color = activeTheme === 'dark' ? '#e0e0e0' : '#666666';
      ChartJS.defaults.borderColor = activeTheme === 'dark' ? '#444444' : '#dddddd';
    };

    applyTheme(theme);

    // Listener für Systemänderungen im Auto-Modus
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') applyTheme('auto');
    };
    
    // Kompatibilität für ältere Browser
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [theme]);

  const toggleTheme = () => {
    const modes = ['light', 'dark', 'auto'];
    const currentIndex = modes.indexOf(theme);
    const nextTheme = modes[(currentIndex + 1) % modes.length];
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // Erweiterte Statistik-Berechnung
  const calculateStats = (testHistory) => {
    if (testHistory.length === 0) {
        setStats({
            download: { avg: 0, min: 0, max: 0 },
            upload: { avg: 0, min: 0, max: 0 },
            ping: { avg: 0, min: 0, max: 0 }
        });
        return;
    }

    const getStats = (key) => {
        // Filtere Tests raus, die ignoriert werden sollen
        const validTests = testHistory.filter(t => t.excludeFromStats !== 1);
        
        if (validTests.length === 0) return { avg: 0, min: 0, max: 0 };

        const values = validTests.map(t => t[key]);
        const sum = values.reduce((a, b) => a + b, 0);
        return {
            avg: sum / values.length,
            min: Math.min(...values),
            max: Math.max(...values)
        };
    };

    setStats({
        download: getStats('download'),
        upload: getStats('upload'),
        ping: getStats('ping')
    });
  };

  // Filter Logik
  const getFilteredHistory = () => {
      return history.filter(test => {
          // 1. Basis-Filter (Was ist ein "Haupteintrag"?)
          // Zeige Aggregate, Manuelle Tests oder Tests ohne Gruppe.
          // Verstecke die Einzelversuche einer Retry-Serie (die haben groupId aber isAggregate=0),
          // ES SEI DENN, wir wollen explizit "Alles" sehen (könnte man machen, aber hier bleiben wir bei der View-Logik).
          // Wir behalten die bisherige Logik bei: Nur "Ergebnisse" anzeigen.
          const isMainItem = test.isAggregate === 1 || !test.groupId || test.isManual === 1;
          if (!isMainItem) return false;

          // 2. Source Filter
          if (filterSource === 'manual' && test.isManual !== 1) return false;
          if (filterSource === 'auto' && test.isManual === 1) return false;
          if (filterSource === 'aggregate' && test.isAggregate !== 1) return false;

          // 3. Status Filter
          if (filterStatus === 'included' && test.excludeFromStats === 1) return false;
          if (filterStatus === 'excluded' && test.excludeFromStats !== 1) return false;

          return true;
      });
  };

  const fetchHistory = useCallback(async (limit = 0) => {
    try {
      const url = limit > 0 ? `/api/history?limit=${limit}` : '/api/history';
      const response = await axios.get(url);
      setHistory(response.data);
      
      if (response.data.length > 0 && limit > 0) {
        setLastResult(response.data[0]);
      }
      
      calculateStats(response.data); 
    } catch (err) {
      console.error("Fehler beim Abrufen des Verlaufs", err);
    }
  }, []);

  // useEffect für Initialisierung und Auto-Refresh
  useEffect(() => {
    // Initial Load
    fetchSettings();
    if (view === 'dashboard') {
        fetchHistory(50);
    } else {
        fetchHistory(0); // Alles laden
    }

    // Auto Refresh nur im Dashboard
    const intervalId = setInterval(() => {
        if (!loading && view === 'dashboard') {
            fetchHistory(50);
        }
    }, 30000); 

    return () => clearInterval(intervalId); 
  }, [loading, fetchHistory, fetchSettings, view]); 

  // Neue runTest Funktion mit SSE
  const runTest = () => {
    setLoading(true);
    setError(null);
    // Reset Live-Werte auf 0 beim Start
    setCurrentTestValues({ download: 0, upload: 0, ping: 0 });

    const eventSource = new EventSource('/api/test/stream');
    
    let hasStartedDownload = false;
    let hasStartedUpload = false;

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'progress') {
                if (data.phase === 'download') {
                    hasStartedDownload = true;
                    setCurrentTestValues(prev => ({ ...prev, download: data.value }));
                } else if (data.phase === 'upload') {
                    hasStartedUpload = true;
                    setCurrentTestValues(prev => ({ ...prev, upload: data.value }));
                } else if (data.phase === 'ping') {
                    if (!hasStartedDownload && !hasStartedUpload) {
                        setCurrentTestValues(prev => ({ ...prev, ping: data.value }));
                    }
                }
            } else if (data.type === 'done') {
                setLastResult(data.result);
                // Wenn wir im Dashboard sind, refresh. Sonst nix.
                if (view === 'dashboard') fetchHistory(50);
                
                eventSource.close();
                setLoading(false);
                
                // Öffne Entscheidungs-Modal
                setManualResult(data.result);
                
            } else if (data.type === 'error') {
                showToast(data.message, "error"); // Fehler als Toast!
                eventSource.close();
                setLoading(false);
            }
        } catch (e) {
            console.error("Fehler beim Parsen der SSE Daten", e);
        }
    };

    eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        if (eventSource.readyState === EventSource.CLOSED) return;
        
        eventSource.close();
        setLoading(false);
        // Wenn noch keine Ergebnisse da sind, ist es ein echter Fehler
        if (!lastResult && currentTestValues.ping === 0) {
            setError("Verbindung zum Test-Stream unterbrochen.");
        }
    };
  };

  // Chart-Daten vorbereiten
  // History ist: [Neueste, ..., Älteste]
  // Wir wollen im Chart: [Älteste, ..., Neueste]
  // Aber nur die letzten X (chartDataLimit)
  
  const chartDataSource = chartDataLimit === 0 ? history : history.slice(0, chartDataLimit);
  const chartDataReversed = [...chartDataSource].reverse();
  
  const labels = chartDataReversed.map(item => new Date(item.timestamp).toLocaleTimeString());

  // Daten für Geschwindigkeits-Chart
  const speedData = {
    labels,
    datasets: [
      {
        label: 'Download (Mbps)',
        data: chartDataReversed.map(item => item.download),
        borderColor: 'rgb(53, 162, 235)', // 100% Deckkraft
        backgroundColor: 'rgba(53, 162, 235, 0.2)',
        yAxisID: 'y',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Upload (Mbps)',
        data: chartDataReversed.map(item => item.upload),
        borderColor: 'rgb(255, 99, 132)', // 100% Deckkraft
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yAxisID: 'y',
        tension: 0.4,
        fill: true,
      },
      // Grenzwerte (Nur anzeigen wenn > 0)
      ...(parseFloat(expectedDownload) > 0 ? [{
        label: 'Soll Download',
        data: Array(chartDataReversed.length).fill(parseFloat(expectedDownload)),
        borderColor: '#f39c12', // Orange
        borderDash: [10, 5], // Längere Striche
        borderWidth: 2, // Dicker
        pointRadius: 0, // Keine Punkte
        fill: false,
        yAxisID: 'y',
      }] : []),
      ...(parseFloat(expectedUpload) > 0 ? [{
        label: 'Soll Upload',
        data: Array(chartDataReversed.length).fill(parseFloat(expectedUpload)),
        borderColor: '#2ecc71', // Grün
        borderDash: [10, 5],
        borderWidth: 2, // Dicker
        pointRadius: 0,
        fill: false,
        yAxisID: 'y',
      }] : [])
    ],
  };

  // Daten für Ping-Chart
  const pingData = {
    labels,
    datasets: [
      {
        label: 'Ping (ms)',
        data: chartDataReversed.map(item => item.ping),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        yAxisID: 'y',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // Optionen für Geschwindigkeit
  const speedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    stacked: false,
    plugins: {
      legend: {
        labels: {
            color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true
          },
          mode: 'x',
        }
      }
    },
    scales: {
      x: {
        ticks: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' },
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#444' : '#ddd' }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Geschwindigkeit (Mbps)',
          color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
        },
        ticks: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' },
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' }
      },
    },
  };

  const pingOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    stacked: false,
    plugins: {
      title: {
        display: false, // Überschrift entfernt
      },
      legend: {
        labels: {
            color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true
          },
          mode: 'x',
        }
      }
    },
    scales: {
      x: {
        ticks: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' },
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#444' : '#ddd' }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Ping (ms)',
          color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
        },
        ticks: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' },
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666' },
      },
    },
  };

  const displayData = loading ? currentTestValues : (lastResult || { download: 0, upload: 0, ping: 0 });
  const resultCardTitle = loading ? 'Live Test läuft...' : 'Letztes Ergebnis';

  // --- RENDER HELPERS ---
  const renderDashboard = () => (
      <>
                    <div className="card" style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '20px'}}>
                      <div style={{ flexGrow: 0.5 }}> {/* Dies verschiebt den Button relativ zum linken Rand nach rechts */}
                        <button className="start-btn" onClick={runTest} disabled={loading}>
                            {loading ? 'Speedtest läuft...' : 'Neuen Test starten'}
                        </button>
                      </div>
                      
                      <div style={{display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto'}}> {/* Dies drückt den Block nach ganz rechts */}
                          {lastResult && (
                              <div style={{color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500'}}>
                                                      Letzter Test: <span style={{color: 'var(--text-color)', fontWeight: 'bold'}}>
                                                          {new Date(lastResult.timestamp).toLocaleString([], {year: 'numeric', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} Uhr
                                                      </span>                              </div>
                          )}
              
                          {!loading && (
                              <div className="next-test-badge" style={{margin: 0}}>
                              <span className="pulse-dot"></span>
                              Nächster Test: <strong>{getNextRunTime()}</strong>
                              </div>
                          )}
                      </div>
                      
                      {error && <p style={{color: 'red', width: '100%', marginTop: '0'}}>{error}</p>}
                    </div>        {/* HAUPTBEREICH: Combined Metrics */}
        <div className="card card-main">
            <h2>{resultCardTitle}</h2>
            
            {loading && (
                <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic'}}>
                Ermittle Daten...
                </p>
            )}

            <div className="results-grid">
                {/* DOWNLOAD */}
                <div className="metric">
                <h3>Download</h3>
                <p>{displayData.download?.toFixed(2) || '0.00'} <br/> <span style={{fontSize: '0.6em'}}>MBit/s</span></p>
                
                {history.length > 0 && (
                    <div className="sub-metrics">
                        <div>Ø {stats.download.avg.toFixed(2)} MBit/s (Durchschnitt)</div>
                        <div>{stats.download.min.toFixed(2)} MBit/s (Minimum)</div>
                        <div>{stats.download.max.toFixed(2)} MBit/s (Maximum)</div>
                    </div>
                )}
                </div>

                {/* UPLOAD */}
                <div className="metric">
                <h3>Upload</h3>
                <p>{displayData.upload?.toFixed(2) || '0.00'} <br/> <span style={{fontSize: '0.6em'}}>MBit/s</span></p>
                
                {history.length > 0 && (
                    <div className="sub-metrics">
                        <div>Ø {stats.upload.avg.toFixed(2)} MBit/s (Durchschnitt)</div>
                        <div>{stats.upload.min.toFixed(2)} MBit/s (Minimum)</div>
                        <div>{stats.upload.max.toFixed(2)} MBit/s (Maximum)</div>
                    </div>
                )}
                </div>

                {/* PING */}
                <div className="metric">
                <h3>Ping</h3>
                <p>{displayData.ping?.toFixed(0) || '0'} <br/> <span style={{fontSize: '0.6em'}}>ms</span></p>
                
                {history.length > 0 && (
                    <div className="sub-metrics">
                        <div>Ø {stats.ping.avg.toFixed(0)} ms (Durchschnitt)</div>
                        <div>{stats.ping.min.toFixed(0)} ms (Minimum)</div>
                        <div>{stats.ping.max.toFixed(0)} ms (Maximum)</div>
                    </div>
                )}
                </div>
                        </div>
                    </div>
                    
        {/* CHARTS WRAPPER */}
        {history.length > 0 && (
            <div className="charts-row">
            <div className="card chart-container" style={{display: 'flex', flexDirection: 'column'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                    <h3 style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-color)'}}>Geschwindigkeit</h3>
                    <div style={{display: 'flex', gap: '5px'}}>
                        {[5, 10, 20, 50].map(limit => (
                            <button 
                                key={limit}
                                onClick={() => setChartDataLimit(limit)}
                                style={{
                                    background: chartDataLimit === limit ? 'var(--primary-gradient)' : 'transparent',
                                    color: chartDataLimit === limit ? 'white' : 'var(--text-secondary)',
                                    border: '1px solid ' + (chartDataLimit === limit ? 'transparent' : 'var(--border-color)'),
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {limit === 0 ? 'Alle' : limit}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{flex: 1, minHeight: 0}}>
                    <Line key={`speed-${theme}`} options={speedOptions} data={speedData} />
                </div>
            </div>
            <div className="card chart-container" style={{display: 'flex', flexDirection: 'column'}}>
                <div style={{marginBottom: '15px'}}>
                     <h3 style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-color)'}}>Ping</h3>
                </div>
                <div style={{flex: 1, minHeight: 0}}>
                    <Line key={`ping-${theme}`} options={pingOptions} data={pingData} />
                </div>
            </div>
            </div>
        )}

                {/* LIST CARD (SMALLER) */}

                <div className="card">

                    <div className="list-header-row">

                        <div className="list-header-left">

                            <h2 style={{margin: 0, border: 'none', padding: 0}}>Letzte Tests</h2>

                            <div style={{display: 'flex', gap: '10px', marginLeft: '10px'}}>
                                <select 
                                    value={filterSource} 
                                    onChange={(e) => setFilterSource(e.target.value)}
                                    style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                                >
                                    <option value="all">Alle Typen</option>
                                    <option value="auto">🤖 Automatisch</option>
                                    <option value="manual">👤 Manuell</option>
                                    <option value="aggregate">📦 Nur Durchschnitt</option>
                                </select>

                                <select 
                                    value={filterStatus} 
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                                >
                                    <option value="all">Jeder Status</option>
                                    <option value="included">✅ Gewertet</option>
                                    <option value="excluded">🚫 Ignoriert</option>
                                </select>
                            </div>

                            <input 

                                type="range" 
                                min="3" 
                                max="50" 
                                value={visibleCount} 
                                onChange={(e) => setVisibleCount(Number(e.target.value))}
                                className="range-slider"
                                title="Anzahl ändern"
                                style={{marginLeft: '15px'}}
                            />

                        </div>

                        <div style={{display:'flex', gap: '15px', alignItems: 'center'}}>

                            <button 
                                onClick={() => setView('history')}
                                className="export-link" 
                            >
                                📜 Historie (Alle)
                            </button>
                            <input 
                                type="file" 
                                accept=".csv" 
                                ref={fileInputRef} 
                                style={{display: 'none'}} 
                                onChange={handleFileUpload} 
                            />
                            <button 
                                onClick={handleImportClick}
                                className="export-link"
                            >
                                Import <span className="icon-import">⬆</span>
                            </button>
                            <a href="/api/export" target="_blank" rel="noopener noreferrer" className="export-link">
                                Export <span className="icon-export">⬇</span>
                            </a>
                        </div>
                    </div>
                    
                                                    <div className="recent-tests-table-header">
                                                        <div className="header-id" style={{width: '120px', textAlign: 'left'}}>ID</div>
                                                        <div className="header-time">Uhrzeit</div>
                                                        <div className="header-server">Server</div>
                                                        <div className="header-download">Download</div>
                                                        <div className="header-upload">Upload</div>
                                                        <div className="header-ping">Ping</div>
                                                    </div>
                    
                                                    {getFilteredHistory().length > 0 ? (
                                                        <ul className="recent-tests-list"> 
                                                            {getFilteredHistory()
                                                                .slice(0, visibleCount)
                                                                .map((test, index) => {

                    

                                                                    const isGroup = test.isAggregate === 1;

                    

                                                                    const isExpanded = isGroup && expandedGroupId === test.groupId;

                    

                                                                    const details = isGroup ? history.filter(d => d.groupId === test.groupId && d.isAggregate === 0) : [];

                    

                                        

                    

                                                                    return (

                    

                                                                    <React.Fragment key={test.id}>

                    

                                                                        <li 

                    

                                                                            className={`recent-tests-row ${test.isManual ? 'manual-test-row' : 'auto-test-row'}`} 

                    

                                                                            onClick={() => isGroup ? toggleExpand(test.groupId) : setSelectedTest(test)} 

                    

                                                                            style={{cursor: 'pointer', borderLeft: isGroup ? '4px solid #9b59b6' : undefined}}

                    

                                                                        >

                    

                                                                                                                                                        <div className="row-id" style={{width: '120px', fontWeight: 'bold', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px'}}>

                    

                                                                            

                    

                                                                                                                                                            {isGroup && <span style={{fontSize: '0.8rem'}}>{isExpanded ? '▼' : '▶'}</span>}

                    

                                                                            

                    

                                                                                                                                                            {test.id}

                    

                                                                                                                                                            

                    

                                                                                                                                                            <div style={{display: 'flex', gap: '4px'}}>

                    

                                                                                                                                                                <span title={test.isManual ? "Manueller Test" : "Automatischer Test"} style={{fontSize: '0.8rem', cursor: 'help', lineHeight: 1}}>

                    

                                                                                                                                                                    {test.isManual ? '👤' : '🤖'}

                    

                                                                                                                                                                </span>

                    

                                                                                                                                                                {isGroup && <span title="Durchschnittswert" style={{fontSize: '0.8rem', lineHeight: 1}}>📦</span>}

                    

                                                                                                                                                                {test.excludeFromStats === 1 && <span title="Wird in Statistik ignoriert" style={{fontSize: '0.8rem', lineHeight: 1}}>🚫</span>}

                    

                                                                                                                                                            </div>

                    

                                                                            

                    

                                                                                                                                                        </div>

                    

                                                                            

                    

                                                                                                                                                        <div className="row-time">

                    

                                                                            

                    

                                                                                                                                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>

                    

                                                                            

                    

                                                                                                                                                            {new Date(test.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}

                    

                                                                            

                    

                                                                                                                                                        </div>

                    

                                                                            

                    

                                                                                                                                                        <span className="row-date">{new Date(test.timestamp).toLocaleDateString()}</span>

                    

                                                                            

                    

                                                                                                                                                        </div>

        

                                                        

        

                                                        <div className="row-server" title={test.serverLocation}>

        

                                                        {formatServerDisplay(test)}

        

                                                        </div>

        

                    

        

                                                        <div className="row-metric download">

        

                                                        <span className="icon">⬇</span> {test.download.toFixed(0)} <small>MBit/s</small>

        

                                                        </div>

        

                                                        

        

                                                        <div className="row-metric upload">

        

                                                        <span className="icon">⬆</span> {test.upload.toFixed(0)} <small>MBit/s</small>

        

                                                        </div>

        

                                                        

        

                                                        <div className="row-metric ping">

        

                                                        <span className="icon">⚡</span> {test.ping.toFixed(0)} <small>ms</small>

        

                                                        </div>

        

                                                    </li>

        

                    

        

                                                                                    {/* DETAIL ROWS FOR DASHBOARD */}

        

                    

        

                                                                                    {isExpanded && details.map(detail => (

        

                    

        

                                                                                        <li 

        

                    

        

                                                                                            key={detail.id} 

        

                    

        

                                                                                            className={`recent-tests-row`} 

        

                    

        

                                                                                            onClick={() => setSelectedTest(detail)} 

        

                    

        

                                                                                            style={{

        

                    

        

                                                                                                cursor: 'pointer', 

        

                    

        

                                                                                                background: 'rgba(0,0,0,0.02)', 

        

                    

        

                                                                                                opacity: 0.8,

        

                    

        

                                                                                                padding: '8px 15px' 

        

                    

        

                                                                                            }}

        

                    

        

                                                                                        >

        

                    

        

                                                                                                                                    <div className="row-id" style={{width: '60px', paddingLeft: '15px', fontSize: '0.8rem', color: '#999'}}>↳ {detail.id}</div>

        

                    

        

                                                                                                                                    <div className="row-time">

        

                    

        

                                                                                                                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px', fontStyle: 'italic', color: '#999'}}>

        

                    

        

                                                                                                                                            {new Date(detail.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}

        

                    

        

                                                                                                                                        </div>

        

                    

        

                                                                                                                                    </div>

        

                    

        

                                                                                            

        

                    

        

                                                                                            <div className="row-server" style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>

        

                    

        

                                                                                                {formatServerDisplay(detail)}

        

                    

        

                                                                                            </div>

        

                    

        

                                                    

        

                    

        

                                                                                            <div className="row-metric download">

        

                    

        

                                                                                                {detail.download.toFixed(0)} <small>MBit/s</small>

        

                    

        

                                                                                            </div>

        

                    

        

                                                                                            

        

                    

        

                                                                                            <div className="row-metric upload">

        

                    

        

                                                                                                {detail.upload.toFixed(0)} <small>MBit/s</small>

        

                    

        

                                                                                            </div>

        

                    

        

                                                                                            

        

                    

        

                                                                                            <div className="row-metric ping">

        

                    

        

                                                                                                {detail.ping.toFixed(0)} <small>ms</small>

        

                    

        

                                                                                            </div>

        

                    

        

                                                                                        </li>

        

                    

        

                                                                                    ))}

        

                                                </React.Fragment>

        

                                            )})}

        

                                    </ul>

        

                                ) : (

                        <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-secondary)'}}>

                            Keine Testergebnisse vorhanden. Starte einen Test oder importiere Daten.

                        </div>

                    )}

                </div>
      </>
  );

  const renderFullHistory = () => (
      <div className="card">
          <div className="list-header-row" style={{marginBottom: '30px'}}>
                <button 
                    onClick={() => setView('dashboard')}
                    style={{
                        background: 'none', 
                        border: 'none', 
                        fontSize: '1.2rem', 
                        cursor: 'pointer', 
                        color: 'var(--text-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}
                >
                    ⬅ Zurück
                </button>
                <h2 style={{margin: 0, border: 'none'}}>Gesamte Historie ({getFilteredHistory().length} Einträge)</h2>
                
                <div style={{display: 'flex', gap: '10px'}}>
                    <select 
                        value={filterSource} 
                        onChange={(e) => setFilterSource(e.target.value)}
                        style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                    >
                        <option value="all">Alle Typen</option>
                        <option value="auto">🤖 Automatisch</option>
                        <option value="manual">👤 Manuell</option>
                        <option value="aggregate">📦 Nur Durchschnitt</option>
                    </select>

                    <select 
                        value={filterStatus} 
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                    >
                        <option value="all">Jeder Status</option>
                        <option value="included">✅ Gewertet</option>
                        <option value="excluded">🚫 Ignoriert</option>
                    </select>
                </div>

                <div style={{display:'flex', gap: '15px', alignItems: 'center'}}>
                    <input 
                        type="file" 
                        accept=".csv" 
                        ref={fileInputRef} 
                        style={{display: 'none'}} 
                        onChange={handleFileUpload} 
                    />
                                                            <button 
                                                                onClick={handleImportClick}
                                                                className="export-link" 
                                                            >
                                                                Import <span className="icon-import">⬆</span>
                                                            </button>
                                                            <a href="/api/export" target="_blank" rel="noopener noreferrer" className="export-link">
                                                            Export <span className="icon-export">⬇</span>
                                                            </a>                </div>
          </div>

          <div className="recent-tests-table-header full-history-header">
                <div className="header-id">ID</div>
                <div className="header-time">Zeitpunkt</div>
                <div className="header-server">Server</div>
                <div className="header-download">Download</div>
                <div className="header-upload">Upload</div>
                <div className="header-ping">Ping</div>
                <div className="header-packet-loss">Paketverlust</div>
                <div className="header-country">Land</div>
            </div>

            <ul className="recent-tests-list"> 
                {getFilteredHistory()
                    .map((test, index) => {
                        const isGroup = test.isAggregate === 1;
                        const isExpanded = isGroup && expandedGroupId === test.groupId;
                        
                        // Detail-Items finden
                        const details = isGroup ? history.filter(d => d.groupId === test.groupId && d.isAggregate === 0) : [];

                        return (
                            <React.Fragment key={test.id}>
                                <li 
                                    className={`recent-tests-row full-history-row ${test.isManual ? 'manual-test-row' : 'auto-test-row'}`} 
                                    onClick={() => isGroup ? toggleExpand(test.groupId) : setSelectedTest(test)} 
                                    style={{cursor: 'pointer', borderLeft: isGroup ? '4px solid #9b59b6' : undefined}}
                                >
                                    <div className="row-id" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        {isGroup && <span style={{fontSize: '0.8rem'}}>{isExpanded ? '▼' : '▶'}</span>}
                                        {test.id}
                                        <div style={{display: 'flex', gap: '4px'}}>
                                            <span title={test.isManual ? "Manueller Test" : "Automatischer Test"} style={{fontSize: '0.8rem', cursor: 'help', lineHeight: 1}}>
                                                {test.isManual ? '👤' : '🤖'}
                                            </span>
                                            {isGroup && <span title="Durchschnittswert einer Testreihe" style={{fontSize: '0.8rem', lineHeight: 1}}>📦</span>}
                                            {test.excludeFromStats === 1 && <span title="Wird in Statistik ignoriert" style={{fontSize: '0.8rem', lineHeight: 1}}>🚫</span>}
                                        </div>
                                    </div>
                                    <div className="row-time">
                                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                        {new Date(test.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                    <span className="row-date">{new Date(test.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    
                                    <div className="row-server" title={test.serverLocation}>
                                    {formatServerDisplay(test)}
                                    </div>

                                    <div className="row-metric download">
                                    <span className="icon">⬇</span> {test.download.toFixed(0)} <small>MBit/s</small>
                                    </div>
                                    
                                    <div className="row-metric upload">
                                    <span className="icon">⬆</span> {test.upload.toFixed(0)} <small>MBit/s</small>
                                    </div>
                                    
                                    <div className="row-metric ping">
                                    <span className="icon">⚡</span> {test.ping.toFixed(0)} <small>ms</small>
                                    </div>
                                    
                                    <div className="row-packet-loss">{test.packetLoss ? test.packetLoss.toFixed(2) : '0.00'}%</div>
                                    <div className="row-country">{test.serverCountry || '-'}</div>
                                </li>
                                
                                {/* DETAIL ROWS */}
                                {isExpanded && details.map(detail => (
                                    <li 
                                        key={detail.id} 
                                        className={`recent-tests-row full-history-row`} 
                                        onClick={() => setSelectedTest(detail)} 
                                        style={{
                                            cursor: 'pointer', 
                                            background: 'rgba(0,0,0,0.02)', 
                                            opacity: 0.8
                                        }}
                                    >
                                        <div className="row-id" style={{fontSize: '0.8rem', color: '#999', paddingLeft: '15px'}}>↳ {detail.id}</div>
                                        <div className="row-time">
                                            <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                {new Date(detail.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                        
                                        <div className="row-server" style={{fontStyle: 'italic'}}>
                                            {formatServerDisplay(detail)}
                                        </div>

                                        <div className="row-metric download">
                                            {detail.download.toFixed(0)} <small>MBit/s</small>
                                        </div>
                                        
                                        <div className="row-metric upload">
                                            {detail.upload.toFixed(0)} <small>MBit/s</small>
                                        </div>
                                        
                                        <div className="row-metric ping">
                                            {detail.ping.toFixed(0)} <small>ms</small>
                                        </div>
                                        
                                        <div className="row-packet-loss">{detail.packetLoss ? detail.packetLoss.toFixed(2) : '0.00'}%</div>
                                        <div className="row-country">{detail.serverCountry}</div>
                                    </li>
                                ))}
                            </React.Fragment>
                        );
                })}
            </ul>
      </div>
  );

  return (
    <div className="App">
      <div className="theme-toggle-container">
        <button className="theme-toggle" onClick={() => setShowSettings(true)} style={{marginRight: '10px'}}>
          ⚙️ Einstellungen
        </button>
        <button className="theme-toggle" onClick={toggleTheme}>
          Modus: {theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dunkel' : 'Hell'}
        </button>
      </div>

      <h1 onClick={() => setView('dashboard')} style={{cursor: 'pointer'}}>SpeedTest Tracker</h1>
      
      {/* Global File Input for Import */}
      <input 
        type="file" 
        accept=".csv" 
        ref={fileInputRef} 
        style={{display: 'none'}} 
        onChange={handleFileUpload} 
      />
      
      {view === 'dashboard' ? renderDashboard() : renderFullHistory()}

      <footer style={{
          textAlign: 'center', 
          marginTop: '40px', 
          marginBottom: '20px', 
          color: 'var(--text-secondary)', 
          fontSize: '0.8rem',
          opacity: 0.7
      }}>
          <div>Version {packageJson.version}</div>
          <div style={{fontSize: '0.7rem', marginTop: '5px'}}>Created with Gemini</div>
      </footer>

      {/* MANUAL RESULT MODAL */}
      {manualResult && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{textAlign: 'center'}}>
            <h2>✅ Test abgeschlossen</h2>
            <p style={{marginBottom: '20px'}}>Hier sind deine Ergebnisse:</p>
            
            <div style={{display: 'flex', justifyContent: 'space-around', marginBottom: '30px'}}>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Download</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#35a2eb'}}>{manualResult.download.toFixed(1)} <small>Mbps</small></div>
                </div>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Upload</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#ff6384'}}>{manualResult.upload.toFixed(1)} <small>Mbps</small></div>
                </div>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Ping</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold'}}>{manualResult.ping.toFixed(0)} <small>ms</small></div>
                </div>
            </div>

            <p style={{fontSize: '1rem', fontWeight: 'bold', marginBottom: '20px'}}>
                Soll dieses Ergebnis in die Statistik aufgenommen werden?
            </p>

            <div className="modal-actions" style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
                <button 
                    className="modal-button" 
                    style={{backgroundColor: '#666'}} 
                    onClick={() => toggleExcludeStats(manualResult.id, true)}
                >
                    🚫 Nein, ignorieren
                </button>
                <button 
                    className="modal-button" 
                    style={{background: 'var(--primary-gradient)'}} 
                    onClick={() => setManualResult(null)} // Default ist "Aufnehmen" (Status ist DB default 0)
                >
                    ✅ Ja, aufnehmen
                </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content card">
            {confirmStep === 'backup' && (
                <>
                    <h2>⚠️ Datensicherung</h2>
                    <p style={{fontSize: '1rem', marginBottom: '30px'}}>
                        Möchtest du vor dem Löschen ein Backup deiner Historie als CSV herunterladen?
                    </p>
                    <div className="modal-actions" style={{display: 'flex', justifyContent: 'space-between', gap: '10px'}}>
                        <button className="modal-button" style={{backgroundColor: '#666'}} onClick={() => setConfirmStep(null)}>Abbrechen</button>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button className="modal-button" onClick={() => handleBackupChoice(false)}>Nein, nur löschen</button>
                            <button className="modal-button" style={{background: 'var(--primary-gradient)'}} onClick={() => handleBackupChoice(true)}>Ja, Backup laden</button>
                        </div>
                    </div>
                </>
            )}

            {confirmStep === 'delete' && (
                <>
                    <h2 style={{color: '#e74c3c', borderColor: '#e74c3c'}}>🚨 Endgültig löschen?</h2>
                    <p style={{fontSize: '1rem', marginBottom: '30px', fontWeight: 'bold'}}>
                        Bist du sicher? Dieser Vorgang kann nicht rückgängig gemacht werden. Alle gespeicherten Testergebnisse werden gelöscht.
                    </p>
                    <div className="modal-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                        <button className="modal-button" onClick={() => setConfirmStep(null)}>Abbrechen</button>
                        <button className="modal-button-danger" onClick={handleFinalDelete}>Ja, alles löschen</button>
                    </div>
                </>
            )}

            {!confirmStep && (
                <>
                    <h2>⚙️ Einstellungen</h2>
                    <div className="form-group">
                        <label>Intervall:</label>
                        <select 
                            value={intervalBase} 
                            onChange={(e) => setIntervalBase(e.target.value)}
                            style={{width: '100%', padding: '10px', marginTop: '5px', marginBottom: '15px'}}
                        >
                            <option value="5m">Alle 5 Minuten</option>
                            <option value="10m">Alle 10 Minuten</option>
                            <option value="30m">Alle 30 Minuten</option>
                            <option value="1h">Jede Stunde</option>
                            <option value="2h">Alle 2 Stunden</option>
                            <option value="3h">Alle 3 Stunden</option>
                            <option value="4h">Alle 4 Stunden</option>
                            <option value="6h">Alle 6 Stunden</option>
                            <option value="12h">Alle 12 Stunden</option>
                            <option value="24h">Täglich</option>
                        </select>
                        
                        <label>Startzeit / Referenzzeit:</label>
                        <input 
                            type="time" 
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            style={{width: '100%', padding: '10px', marginBottom: '0'}}
                        />
                        <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                            Der Test-Zyklus orientiert sich an dieser Zeit.
                        </div>

                        <p style={{fontSize: '0.8rem', color: '#666'}}>
                            Generierter Cron-Job: <code>{generateCron(intervalBase, startTime)}</code>
                        </p>
                    </div>
                    
                    <div className="form-group" style={{marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px'}}>
                        <h3 style={{fontSize: '1rem', marginBottom: '15px'}}>Qualitätssicherung & Wiederholung</h3>
                        
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                            <div>
                                <label>Erwarteter Download (Mbps):</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={expectedDownload}
                                    onChange={(e) => setExpectedDownload(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                    placeholder="0 = Deaktiviert"
                                />
                            </div>
                            <div>
                                <label>Erwarteter Upload (Mbps):</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={expectedUpload}
                                    onChange={(e) => setExpectedUpload(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                    placeholder="0 = Deaktiviert"
                                />
                            </div>
                        </div>

                        <div style={{marginTop: '15px'}}>
                            <label>Toleranz (%):</label>
                            <input 
                                type="number" 
                                min="0"
                                max="100"
                                value={tolerance}
                                onChange={(e) => setTolerance(e.target.value)}
                                style={{width: '100%', padding: '10px', marginBottom: '0'}}
                            />
                            <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                                Abweichung, ab der wiederholt wird (z.B. 10%).
                            </div>
                        </div>

                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px'}}>
                            <div>
                                <label>Wiederholungen:</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    max="5"
                                    value={retryCount}
                                    onChange={(e) => setRetryCount(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginBottom: '0'}}
                                />
                                <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                                    (Max. 1-5)
                                </div>
                            </div>
                            <div>
                                <label>Pause (Sekunden):</label>
                                <input 
                                    type="number" 
                                    min="5"
                                    max="60"
                                    value={retryDelay}
                                    onChange={(e) => setRetryDelay(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginBottom: '0'}}
                                />
                                <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                                    (5-60 Sekunden)
                                </div>
                            </div>
                        </div>

                        <div style={{marginTop: '15px'}}>
                                <label>Strategie:</label>
                                <select 
                                    value={retryStrategy} 
                                    onChange={(e) => setRetryStrategy(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                >
                                    <option value="AVG">Durchschnitt</option>
                                    <option value="MIN">Minimum (Worst Case)</option>
                                    <option value="MAX">Maximum (Best Case)</option>
                                </select>
                        </div>
                    </div>

                    <div className="form-group" style={{marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px'}}>
                        <label>Daten aufbewahren für (Tage):</label>
                        <input 
                            type="number" 
                            min="0"
                            value={retentionPeriod}
                            onChange={(e) => setRetentionPeriod(e.target.value)}
                            style={{width: '100%', padding: '10px', marginBottom: '0'}}
                        />
                        <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                            Alte Tests werden automatisch gelöscht. 0 = Nie löschen.
                        </div>
                    </div>

                    <div className="modal-actions" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px'}}>
                        <button 
                            className="modal-button-danger" 
                            onClick={startResetFlow}
                        >
                            🗑️ Datenbank leeren
                        </button>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button className="modal-button" style={{backgroundColor: '#666'}} onClick={() => setShowSettings(false)}>Abbrechen</button>
                            <button className="modal-button" onClick={() => saveSettings()}>Speichern</button>
                        </div>
                    </div>
                </>
            )}
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedTest && (
        <div className="modal-overlay" onClick={() => setSelectedTest(null)}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h2 style={{margin: 0}}>📊 Test Details</h2>
                <button 
                    onClick={() => setSelectedTest(null)} 
                    style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-color)'}}
                >
                    &times;
                </button>
            </div>
            
            <div className="detail-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', textAlign: 'left'}}>
                
                <div className="detail-item full-width" style={{gridColumn: '1 / -1', background: 'var(--metric-bg)', padding: '15px', borderRadius: '10px'}}>
                    <strong style={{display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Zeitpunkt</strong>
                    <span style={{fontSize: '1.1rem', fontWeight: 'bold'}}>
                        {new Date(selectedTest.timestamp).toLocaleString()}
                    </span>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Download</strong>
                    <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#35a2eb'}}>{selectedTest.download.toFixed(2)} Mbps</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Upload</strong>
                    <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#ff6384'}}>{selectedTest.upload.toFixed(2)} Mbps</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Ping</strong>
                    <div style={{fontSize: '1.1rem'}}>{selectedTest.ping.toFixed(1)} ms</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Jitter</strong>
                    <div style={{fontSize: '1.1rem'}}>{selectedTest.jitter ? selectedTest.jitter.toFixed(1) + ' ms' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Paketverlust</strong>
                    <div style={{fontSize: '1.1rem'}}>{selectedTest.packetLoss ? selectedTest.packetLoss.toFixed(2) : '0.00'}%</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>ISP</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.isp}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Download Zeit</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.downloadElapsed ? (selectedTest.downloadElapsed / 1000).toFixed(2) + ' s' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Upload Zeit</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.uploadElapsed ? (selectedTest.uploadElapsed / 1000).toFixed(2) + ' s' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Daten (Down)</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.downloadBytes ? (selectedTest.downloadBytes / 1024 / 1024).toFixed(1) + ' MB' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Daten (Up)</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.uploadBytes ? (selectedTest.uploadBytes / 1024 / 1024).toFixed(1) + ' MB' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>VPN aktiv?</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.isVpn ? 'Ja 🔒' : 'Nein'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Externe IP</strong>
                    <div style={{fontSize: '1rem'}}>{selectedTest.externalIp || '-'}</div>
                </div>

                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Ergebnis Link</strong>
                    {selectedTest.resultUrl ? (
                        <a href={selectedTest.resultUrl} target="_blank" rel="noopener noreferrer" style={{color: '#667eea', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold', display: 'block', wordBreak: 'break-all'}}>
                            {selectedTest.resultUrl.split('/').pop()} ↗
                        </a>
                    ) : (
                        <div>-</div>
                    )}
                </div>

                <div className="detail-group" style={{gridColumn: '1 / -1', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '15px'}}>
                    <h3 style={{fontSize: '1rem', margin: '0 0 10px 0'}}>Server Details</h3>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Ort</strong>
                    <div>{selectedTest.serverLocation} ({selectedTest.serverCountry})</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Server ID</strong>
                    <div>{selectedTest.serverId || '-'}</div>
                </div>

                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Host</strong>
                    <div style={{fontFamily: 'monospace'}}>{selectedTest.serverHost ? `${selectedTest.serverHost}:${selectedTest.serverPort}` : '-'}</div>
                </div>
                
                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Server IP</strong>
                    <div style={{fontFamily: 'monospace'}}>{selectedTest.serverIp || '-'}</div>
                </div>

            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

export default App;