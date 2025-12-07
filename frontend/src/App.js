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
  const [cronSchedule, setCronSchedule] = useState('0 * * * *'); // Default
  const [visibleCount, setVisibleCount] = useState(5); // Wie viele Tests anzeigen?
  const [selectedTest, setSelectedTest] = useState(null); // Für Detail-Ansicht

  // Toast Notification State
  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000); // Nach 3 Sekunden ausblenden
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

  const getNextRunTime = () => {
    if (!cronSchedule) return 'Lädt...';

    try {
      const now = new Date();
      let next = new Date(now);
      
      // Einfacher Parser für unsere spezifischen Dropdown-Werte
      if (cronSchedule === '*/5 * * * *') {
        // Nächste 5 Minuten Marke
        const minutes = now.getMinutes();
        const remainder = minutes % 5;
        next.setMinutes(minutes + (5 - remainder));
        next.setSeconds(0);
        next.setMilliseconds(0);
      }
      else if (cronSchedule === '*/10 * * * *') {
        // Nächste 10 Minuten Marke
        const minutes = now.getMinutes();
        const remainder = minutes % 10;
        next.setMinutes(minutes + (10 - remainder));
        next.setSeconds(0);
        next.setMilliseconds(0);
      }
      else if (cronSchedule === '*/30 * * * *') {
        // Nächste volle Stunde
        next.setHours(now.getHours() + 1);
        next.setMinutes(0);
        next.setSeconds(0);
        next.setMilliseconds(0);
      }
      else if (cronSchedule.startsWith('0 */')) {
        // Alle X Stunden (z.B. "0 */4 * * *")
        const parts = cronSchedule.split(' ');
        const hourPart = parts[1]; // "*/4"
        const interval = parseInt(hourPart.split('/')[1]); // 4
        
        // Finde nächste Stunde, die durch interval teilbar ist (vereinfacht: einfach + interval ab jetzt, oder sauberer am Tag ausgerichtet)
        // Wir machen es einfach: Nächste volle Stunde + Rest bis zum Intervall
        // Besser: Wir nehmen an, es läuft ab 0 Uhr. 
        // Aktuelle Stunde 14, Intervall 4. -> 0, 4, 8, 12, 16. Nächster ist 16.
        const currentHour = now.getHours();
        let nextHour = currentHour + 1;
        while (nextHour % interval !== 0) {
            nextHour++;
        }
        
        // Wenn wir über 24h gehen, ist es morgen
        if (nextHour >= 24) {
             next.setDate(now.getDate() + 1);
             next.setHours(nextHour - 24);
        } else {
             next.setHours(nextHour);
        }
        next.setMinutes(0);
        next.setSeconds(0);
        next.setMilliseconds(0);
      }
      else if (cronSchedule === '0 0 * * *') {
        // Morgen 00:00
        next.setDate(now.getDate() + 1);
        next.setHours(0);
        next.setMinutes(0);
        next.setSeconds(0);
        next.setMilliseconds(0);
      } 
      else {
        // Fallback für unbekannte Patterns (wir zeigen einfach nichts an oder den Rohwert)
        return cronSchedule; 
      }

      // Formatierung
      const isToday = next.getDate() === now.getDate() && next.getMonth() === now.getMonth() && next.getFullYear() === now.getFullYear();
      const isTomorrow = new Date(now.getTime() + 86400000).getDate() === next.getDate();
      const timeStr = next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (isToday) {
        return `Heute, ${timeStr} Uhr`;
      } else if (isTomorrow) {
        return `Morgen, ${timeStr} Uhr`;
      } else {
        return `${next.toLocaleDateString()} ${timeStr} Uhr`;
      }

    } catch (err) {
      console.error("Custom Parser Fehler:", err);
      return cronSchedule;
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
        const response = await axios.get('/api/settings');
        setCronSchedule(response.data.cron_schedule);
    } catch (err) {
        console.error("Fehler beim Laden der Einstellungen", err);
    }
  }, []);

  // Settings speichern
  const saveSettings = async (newSchedule) => {
    try {
        await axios.post('/api/settings', { cron_schedule: newSchedule });
        setCronSchedule(newSchedule);
        setShowSettings(false);
        showToast("Zeitplan erfolgreich gespeichert! ✅", "success");
    } catch (err) {
        showToast("Fehler beim Speichern: " + (err.response?.data?.error || err.message), "error");
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
        const values = testHistory.map(t => t[key]);
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

  const fetchHistory = useCallback(async () => {
    try {
      const response = await axios.get('/api/history');
      setHistory(response.data);
      if (response.data.length > 0) {
        setLastResult(response.data[0]);
      }
      calculateStats(response.data); // Neue Funktion nutzen
    } catch (err) {
      console.error("Fehler beim Abrufen des Verlaufs", err);
    }
  }, []);

  // useEffect für Initialisierung und Auto-Refresh
  useEffect(() => {
    fetchHistory(); 
    fetchSettings();

    const intervalId = setInterval(() => {
        if (!loading) {
            fetchHistory();
        }
    }, 30000); 

    return () => clearInterval(intervalId); 
  }, [loading, fetchHistory, fetchSettings]); 

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
                fetchHistory(); // Verlauf aktualisieren
                eventSource.close();
                setLoading(false);
                showToast("Test erfolgreich beendet! 🚀", "success");
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
  const chartDataReversed = [...history].reverse();
  const labels = chartDataReversed.map(item => new Date(item.timestamp).toLocaleTimeString());

  // Daten für Geschwindigkeits-Chart
  const speedData = {
    labels,
    datasets: [
      {
        label: 'Download (Mbps)',
        data: chartDataReversed.map(item => item.download),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.2)',
        yAxisID: 'y',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Upload (Mbps)',
        data: chartDataReversed.map(item => item.upload),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yAxisID: 'y',
        tension: 0.4,
        fill: true,
      },
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
        display: true,
        text: 'Ping (Latenz) Verlauf',
        color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
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

  const displayData = loading ? currentTestValues : lastResult;
  const resultCardTitle = loading ? 'Live Test läuft...' : 'Letztes Ergebnis';

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

      <h1>SpeedTest Tracker</h1>
      
      <div className="card">
        <button className="start-btn" onClick={runTest} disabled={loading}>
          {loading ? 'Speedtest läuft...' : 'Neuen Test starten'}
        </button>
        {error && <p style={{color: 'red', marginTop: '10px'}}>{error}</p>}
      </div>

      {/* HAUPTBEREICH: Combined Metrics (Last Result + Stats) */}
      {displayData && (
        <div className="card card-main">
          <h2>{resultCardTitle}</h2>
          
          {/* Datum/Server Zeile ist entfernt, wie gewünscht */}
          {loading && (
             <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic'}}>
               Ermittle Daten...
             </p>
          )}

          {!loading && (
             <div className="next-test-badge">
               <span className="pulse-dot"></span>
               Nächster Test: <strong>{getNextRunTime()}</strong>
             </div>
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
      )}
      
      {/* DIE SEPARATE STATS CARD IST HIER ENTFERNT WORDEN */}

      {/* CHARTS WRAPPER */}
      {history.length > 0 && (
        <div className="charts-row">
          <div className="card chart-container">
            <Line key={`speed-${theme}`} options={speedOptions} data={speedData} />
          </div>
          <div className="card chart-container">
            <Line key={`ping-${theme}`} options={pingOptions} data={pingData} />
          </div>
        </div>
      )}

      {/* LIST CARD */}
      {history.length > 0 && (
        <div className="card">
          <div className="list-header-row">
              <div className="list-header-left">
                  <h2 style={{margin: 0, border: 'none', padding: 0}}>Letzte {visibleCount} Tests</h2>
                  <input 
                    type="range" 
                    min="3" 
                    max="50" 
                    value={visibleCount} 
                    onChange={(e) => setVisibleCount(Number(e.target.value))}
                    className="range-slider"
                    title="Anzahl ändern"
                  />
              </div>
              <a href="/api/export" target="_blank" rel="noopener noreferrer" className="export-link">
                  CSV Export ⬇
              </a>
          </div>
          
          <div className="recent-tests-table-header">
              <div className="header-time">Uhrzeit</div>
              <div className="header-server">Server</div>
              <div className="header-download">Download</div>
              <div className="header-upload">Upload</div>
              <div className="header-ping">Ping</div>
          </div>

          <ul className="recent-tests-list"> 
            {history.slice(0, visibleCount).map((test, index) => (
              <li 
                key={test.id} 
                className={`recent-tests-row ${test.isManual ? 'manual-test-row' : 'auto-test-row'}`} 
                onClick={() => setSelectedTest(test)} 
                style={{cursor: 'pointer'}}
              >
                <div className="row-time">
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                      {new Date(test.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      <span title={test.isManual ? "Manueller Test" : "Automatischer Test"} style={{fontSize: '0.8rem', cursor: 'help'}}>
                        {test.isManual ? '👤' : '🤖'}
                      </span>
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
            ))}
          </ul>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h2>⚙️ Einstellungen</h2>
            <div className="form-group">
                <label>Automatischer Test-Intervall:</label>
                <select 
                    value={cronSchedule} 
                    onChange={(e) => setCronSchedule(e.target.value)}
                    style={{width: '100%', padding: '10px', marginTop: '10px', marginBottom: '20px'}}
                >
                    <option value="*/5 * * * *">Alle 5 Minuten</option>
                    <option value="*/10 * * * *">Alle 10 Minuten</option>
                    <option value="*/30 * * * *">Alle 30 Minuten</option>
                    <option value="0 * * * *">Jede Stunde</option>
                    <option value="0 */2 * * *">Alle 2 Stunden</option>
                    <option value="0 */3 * * *">Alle 3 Stunden</option>
                    <option value="0 */4 * * *">Alle 4 Stunden</option>
                    <option value="0 */6 * * *">Alle 6 Stunden</option>
                    <option value="0 */12 * * *">Alle 12 Stunden</option>
                    <option value="0 0 * * *">Täglich (00:00 Uhr)</option>
                </select>
                <p style={{fontSize: '0.8rem', color: '#666'}}>
                    Aktueller Cron-Wert: <code>{cronSchedule}</code>
                </p>
            </div>
            <div className="modal-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                <button className="start-btn" style={{backgroundColor: '#666'}} onClick={() => setShowSettings(false)}>Abbrechen</button>
                <button className="start-btn" onClick={() => saveSettings(cronSchedule)}>Speichern</button>
            </div>
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