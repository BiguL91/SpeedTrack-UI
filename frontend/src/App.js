import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './App.css';
import packageJson from '../package.json';
import { getNextRunTime } from './utils/cronHelpers';
import { isBelowThreshold } from './utils/dataHelpers';
import SpeedChartsSection from './components/SpeedChartsSection';
import ExpandedChartModal from './components/ExpandedChartModal';
import SettingsModal from './components/SettingsModal';
import TestDetailModal from './components/TestDetailModal';
import ManualResultModal from './components/ManualResultModal';
import HistoryTable from './components/HistoryTable';
import SystemStatusPanel from './components/SystemStatusPanel';

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
  
  // Einstellungs-Status
  const [showSettings, setShowSettings] = useState(false);
  const [cronSchedule, setCronSchedule] = useState('0 * * * *'); // Der "echte" Cron-String für Backend
  
  // UI State für den Settings-Dialog (Ausgelagert in SettingsModal, hier nur noch Anzeige-relevantes)
  const [visibleCount, setVisibleCount] = useState(5); // Wie viele Tests anzeigen?
  const [selectedTest, setSelectedTest] = useState(null); // Für Detail-Ansicht
  const [chartDataLimit, setChartDataLimit] = useState(20); // Wie viele Tests im Chart anzeigen? (0 = Alle)
  
  // Ansichts-Status: 'dashboard' oder 'history'
  const [view, setView] = useState('dashboard');
  
  // Filter-Status
  const [filterSource, setFilterSource] = useState('all'); // 'all', 'manual', 'auto', 'aggregate'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'included', 'excluded'
  const [filterResult, setFilterResult] = useState('all'); // 'all', 'pass', 'fail'
  const [filterTime, setFilterTime] = useState('all'); // 'all', 'today', 'yesterday', 'week', 'month'


  
  // QS / Wiederholungs-Einstellungen
  const [expectedDownload, setExpectedDownload] = useState('0');
  const [expectedUpload, setExpectedUpload] = useState('0');
  const [tolerance, setTolerance] = useState('10');
  const [serverBlacklist, setServerBlacklist] = useState(''); // Kommaseparierte Server IDs



  // State für das Ergebnis-Modal nach manuellem Test
  const [manualResult, setManualResult] = useState(null); // Das Ergebnis-Objekt
  
  // State für vergrößerten Chart
  const [expandedChart, setExpandedChart] = useState(null); // 'speed' oder 'ping' oder null
  const [expandedChartLimit, setExpandedChartLimit] = useState(50); // Standard: 50 Einträge im vergrößerten Chart

  // State für aufgeklappte Gruppe (ID)
  const [expandedGroupId, setExpandedGroupId] = useState(null);

  // Toast-Benachrichtigungs-Status
  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }

  // System-Status-Logs (SSE) & Verbindungs-Status
  const [statusLogs, setStatusLogs] = useState([]);
  const [isStatusConnected, setIsStatusConnected] = useState(false);
  const eventSourceRef = React.useRef(null);
  
  // Refs für Zugriff innerhalb des EventListeners (Closure Trap vermeiden)
  const viewRef = React.useRef(view);
  const fetchHistoryRef = React.useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000); // Nach 3 Sekunden ausblenden
  }, []);

  // Funktion um Test aus Statistik auszuschließen
  const toggleExcludeStats = async (testId, exclude) => {
      try {
          await axios.patch(`/api/results/${testId}/exclude`, { exclude });
          showToast(exclude ? "Test wird ignoriert." : "Test wieder aufgenommen.", "success");
          fetchHistory(view === 'dashboard' ? 200 : 0); // Reload
          setManualResult(null); // Modal schließen falls offen
          if (selectedTest && selectedTest.id === testId) {
             setSelectedTest(prev => ({...prev, excludeFromStats: exclude ? 1 : 0}));
          }
      } catch (err) {
          showToast("Fehler beim Aktualisieren: " + err.message, "error");
      }
  };
  
  // Funktion um Server zu Blacklisten (ID hinzufügen/entfernen)
  const toggleServerBlacklist = async (serverId) => {
      if (!serverId) return;
      const idStr = String(serverId);
      let list = serverBlacklist.split(',').map(s => s.trim()).filter(s => s !== '');
      
      let newList;
      let msg;
      
      if (list.includes(idStr)) {
          // Entfernen
          newList = list.filter(s => s !== idStr);
          msg = "Server von Blacklist entfernt. ✅";
      } else {
          // Hinzufügen
          newList = [...list, idStr];
          msg = "Server zu Blacklist hinzugefügt. 🚫";
      }
      
      const newBlacklistStr = newList.join(', ');
      
      try {
          // Wir speichern nur diese eine Einstellung sofort
          await axios.post('/api/settings', { 
              server_blacklist: newBlacklistStr
          });
          setServerBlacklist(newBlacklistStr);
          showToast(msg, "success");
      } catch (err) {
          showToast("Fehler beim Speichern der Blacklist: " + err.message, "error");
      }
  };

  const fetchSettings = useCallback(async () => {
    try {
        const response = await axios.get('/api/settings');
        setCronSchedule(response.data.cron_schedule);
        setExpectedDownload(response.data.expected_download);
        setExpectedUpload(response.data.expected_upload);
        setTolerance(response.data.tolerance);
        setServerBlacklist(response.data.server_blacklist || '');
    } catch (err) {
        console.error("Fehler beim Laden der Einstellungen", err);
    }
  }, []);



  // Callback wenn Settings gespeichert wurden
  const handleSettingsSaved = (newCron, newSettings) => {
      setCronSchedule(newCron);
      if (newSettings) {
          setExpectedDownload(newSettings.expectedDownload);
          setExpectedUpload(newSettings.expectedUpload);
          setTolerance(newSettings.tolerance);
          setServerBlacklist(newSettings.serverBlacklist);
      }
      fetchHistory(); // Refresh falls sich was geändert hat (z.B. Reset DB)
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
      // ChartJS.defaults.color = activeTheme === 'dark' ? '#e0e0e0' : '#666666';
      // ChartJS.defaults.borderColor = activeTheme === 'dark' ? '#444444' : '#dddddd';
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
  const getFilteredHistory = useMemo(() => {
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

          // 4. Result Filter
          if (filterResult !== 'all') {
              const failed = isBelowThreshold(test, expectedDownload, expectedUpload, tolerance);
              if (filterResult === 'pass' && failed) return false;
              if (filterResult === 'fail' && !failed) return false;
          }

          // 5. Time Filter
          if (filterTime !== 'all') {
              const testDate = new Date(test.timestamp);
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
              const testTime = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate()).getTime();

              if (filterTime === 'today') {
                  if (testTime !== today) return false;
              } else if (filterTime === 'yesterday') {
                  const yesterday = today - 86400000;
                  if (testTime !== yesterday) return false;
              } else if (filterTime === 'week') {
                  const weekAgo = today - (7 * 86400000);
                  if (testTime < weekAgo) return false;
              } else if (filterTime === 'month') {
                  const monthAgo = today - (30 * 86400000);
                  if (testTime < monthAgo) return false;
              }
          }

          return true;
      });
  }, [history, filterSource, filterStatus, filterResult, filterTime, expectedDownload, expectedUpload, tolerance]);

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
    // Initiales Laden
    fetchSettings();
    if (view === 'dashboard') {
        fetchHistory(200);
    } else {
        fetchHistory(0); // Alles laden
    }

    // Auto Refresh nur im Dashboard
    const intervalId = setInterval(() => {
        if (!loading && view === 'dashboard') {
            fetchHistory(200);
        }
    }, 30000); 

    return () => clearInterval(intervalId); 
  }, [loading, fetchHistory, fetchSettings, view]); 

  // Auto-Nachladen von Daten für Expanded Chart, wenn nötig
  useEffect(() => {
    if (expandedChart) {
        // Wenn Modal offen ist und wir "Alle" (0) wollen oder mehr als wir haben
        if (expandedChartLimit === 0 || expandedChartLimit > history.length) {
            // Um Endlosschleifen zu vermeiden, prüfen wir, ob wir nicht schon "Alle" geladen haben (wenn history < limit aber DB leer ist).
            // Aber fetchHistory ist schlau genug bzw. wir machen es einfach.
            // Um Flackern zu vermeiden, laden wir nur wenn nötig.
            
            // Limit für Fetch: Wenn expandedChartLimit 0 ist, lade 0 (alles). Sonst das Limit.
            fetchHistory(expandedChartLimit);
        }
    }
  }, [expandedChart, expandedChartLimit, history.length, fetchHistory]);

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
                // Immer refreshen nach Test
                fetchHistory(view === 'dashboard' ? 200 : 0); 
                
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





  useEffect(() => {
      viewRef.current = view;
      fetchHistoryRef.current = fetchHistory;
  }, [view, fetchHistory]);

  // SSE Verbindung
  useEffect(() => {
    let retryTimeout;

    const connect = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource('/api/status/stream');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setIsStatusConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // 1. Logs updaten
                setStatusLogs(prev => {
                    const newLogs = [...prev, data];
                    if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
                    return newLogs;
                });
                
                // 2. Auf Actions reagieren
                if (data.action === 'refresh_history') {
                    const currentView = viewRef.current;
                    const fetchFn = fetchHistoryRef.current;
                    if (fetchFn) {
                        // Auto-Refresh auslösen
                        fetchFn(currentView === 'dashboard' ? 200 : 0);
                    }
                }
            } catch (e) {
                console.error("Status Parse Error", e);
            }
        };

        eventSource.onerror = (err) => {
            // console.log("Status Stream Verbindung verloren, reconnecting...");
            setIsStatusConnected(false);
            eventSource.close();
            retryTimeout = setTimeout(connect, 5000);
        };
    };

    connect();

    return () => {
        if (eventSourceRef.current) eventSourceRef.current.close();
        clearTimeout(retryTimeout);
    };
  }, []);

  const displayData = loading ? currentTestValues : (lastResult || { download: 0, upload: 0, ping: 0 });
  const resultCardTitle = loading ? 'Live Test läuft...' : 'Letztes Ergebnis';

  // --- RENDER HILFSFUNKTIONEN ---
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
                              <div style={{
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '10px', 
                                  color: 'var(--text-secondary)', 
                                  fontSize: '0.85rem', 
                                  fontWeight: '500',
                                  border: '1px solid var(--border-color)',
                                  padding: '6px 15px',
                                  borderRadius: '20px',
                                  backgroundColor: 'rgba(0,0,0,0.02)'
                              }}>
                                  Letzter Test: <span style={{color: 'var(--text-color)', fontWeight: 'bold'}}>
                                      {new Date(lastResult.timestamp).toLocaleString([], {year: 'numeric', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} Uhr
                                  </span>
                              </div>
                          )}
              
                          {!loading && (
                              <div style={{
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '10px', 
                                  color: 'var(--text-secondary)', 
                                  fontSize: '0.85rem', 
                                  fontWeight: '500',
                                  border: '1px solid var(--border-color)',
                                  padding: '6px 15px',
                                  borderRadius: '20px',
                                  backgroundColor: 'rgba(0,0,0,0.02)'
                              }}>
                                  <div className="pulse-dot" style={{backgroundColor: '#2ecc71', width: '8px', height: '8px', borderRadius: '50%', position: 'relative'}}></div>
                                  <span>Nächster: <strong style={{color: 'var(--text-color)'}}>{getNextRunTime(cronSchedule)}</strong></span>
                              </div>
                          )}
                      </div>
                      
                      {error && <p style={{color: 'red', width: '100%', marginTop: '0'}}>{error}</p>}
                    </div>        {/* HAUPTBEREICH: Kombinierte Metriken */}
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
                <p 
                    style={{ 
                        color: (
                            parseFloat(expectedDownload) > 0 && 
                            displayData.download < parseFloat(expectedDownload) * (1 - parseFloat(tolerance) / 100)
                        ) ? '#e74c3c' : 'var(--text-color)' 
                    }}
                >
                    {displayData.download?.toFixed(2) || '0.00'} <br/> <span style={{fontSize: '0.6em'}}>MBit/s</span>
                </p>
                
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
                <p 
                    style={{ 
                        color: (
                            parseFloat(expectedUpload) > 0 && 
                            displayData.upload < parseFloat(expectedUpload) * (1 - parseFloat(tolerance) / 100)
                        ) ? '#e74c3c' : 'var(--text-color)' 
                    }}
                >
                    {displayData.upload?.toFixed(2) || '0.00'} <br/> <span style={{fontSize: '0.6em'}}>MBit/s</span>
                </p>
                
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
                    
                {/* DIAGRAMM CONTAINER */}
                <SpeedChartsSection 
                    history={history}
                    theme={theme}
                    expectedDownload={expectedDownload}
                    expectedUpload={expectedUpload}
                    tolerance={tolerance}
                    chartDataLimit={chartDataLimit}
                    setChartDataLimit={setChartDataLimit}
                    setExpandedChart={setExpandedChart}
                />
        
                        {/* LISTEN KARTE (KLEIN) */}
                <div className="card">

                    <div className="list-header-row">

                        <div className="list-header-left">

                            <h2 style={{margin: 0, border: 'none', padding: 0}}>Letzte {getFilteredHistory.slice(0, visibleCount).length} Tests</h2>

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

                                <select 
                                    value={filterResult} 
                                    onChange={(e) => setFilterResult(e.target.value)}
                                    style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                                >
                                    <option value="all">Jedes Ergebnis</option>
                                    <option value="pass">👍 Bestanden</option>
                                    <option value="fail">⚠️ Nicht Bestanden</option>
                                </select>

                                <select 
                                    value={filterTime} 
                                    onChange={(e) => setFilterTime(e.target.value)}
                                    style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                                >
                                    <option value="all">Gesamte Zeit</option>
                                    <option value="today">Heute</option>
                                    <option value="yesterday">Gestern</option>
                                    <option value="week">Letzte 7 Tage</option>
                                    <option value="month">Letzte 30 Tage</option>
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
                    
                    <HistoryTable 
                        tests={getFilteredHistory.slice(0, visibleCount)}
                        history={history}
                        expandedGroupId={expandedGroupId}
                        toggleExpand={toggleExpand}
                        serverBlacklist={serverBlacklist}
                        expectedDownload={expectedDownload}
                        expectedUpload={expectedUpload}
                        tolerance={tolerance}
                        onSelectTest={setSelectedTest}
                        isFullHistory={false}
                    />

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
                <h2 style={{margin: 0, border: 'none'}}>Gesamte Historie ({getFilteredHistory.length} Einträge)</h2>
                
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

                    <select 
                        value={filterResult} 
                        onChange={(e) => setFilterResult(e.target.value)}
                        style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                    >
                        <option value="all">Jedes Ergebnis</option>
                        <option value="pass">👍 Bestanden</option>
                        <option value="fail">⚠️ Nicht Bestanden</option>
                    </select>

                    <select 
                        value={filterTime} 
                        onChange={(e) => setFilterTime(e.target.value)}
                        style={{padding: '5px 10px', borderRadius: '15px', border: '1px solid var(--border-color)', background: 'var(--metric-bg)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer'}}
                    >
                        <option value="all">Gesamte Zeit</option>
                        <option value="today">Heute</option>
                        <option value="yesterday">Gestern</option>
                        <option value="week">Letzte 7 Tage</option>
                        <option value="month">Letzte 30 Tage</option>
                    </select>
                </div>

                <div style={{display:'flex', gap: '15px', alignItems: 'center'}}>
                    
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

          <HistoryTable 
            tests={getFilteredHistory}
            history={history}
            expandedGroupId={expandedGroupId}
            toggleExpand={toggleExpand}
            serverBlacklist={serverBlacklist}
            expectedDownload={expectedDownload}
            expectedUpload={expectedUpload}
            tolerance={tolerance}
            onSelectTest={setSelectedTest}
            isFullHistory={true}
          />
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
          <div style={{fontSize: '0.7rem', marginTop: '5px'}}>Created with support from Gemini</div>
      </footer>

      {/* MANUELLES ERGEBNIS MODAL */}
      <ManualResultModal 
        result={manualResult}
        onClose={() => setManualResult(null)}
        onExclude={toggleExcludeStats}
      />

      {/* ERWEITERTES DIAGRAMM MODAL */}
      <ExpandedChartModal 
        expandedChart={expandedChart}
        setExpandedChart={setExpandedChart}
        expandedChartLimit={expandedChartLimit}
        setExpandedChartLimit={setExpandedChartLimit}
        history={history}
        theme={theme}
        expectedDownload={expectedDownload}
        expectedUpload={expectedUpload}
      />
      
      {/* EINSTELLUNGEN MODAL */}
      <SettingsModal 
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        onSettingsSaved={handleSettingsSaved}
        showToast={showToast}
        fetchHistory={fetchHistory}
      />

      {/* DETAIL MODAL */}
      <TestDetailModal 
        test={selectedTest}
        onClose={() => setSelectedTest(null)}
        onToggleExclude={toggleExcludeStats}
        onToggleBlacklist={toggleServerBlacklist}
        serverBlacklist={serverBlacklist}
      />

      {/* TOAST BENACHRICHTIGUNG */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* SYSTEM STATUS PANEL */}
      <SystemStatusPanel logs={statusLogs} isConnected={isStatusConnected} />
    </div>
  );
}

export default App;