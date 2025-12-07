import React, { useState, useEffect } from 'react';
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
  Defaults
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [averages, setAverages] = useState({ download: 0, upload: 0, ping: 0 });
  
  // Neuer State für die Live-Werte aller Metriken gleichzeitig
  const [currentTestValues, setCurrentTestValues] = useState({ download: 0, upload: 0, ping: 0 });
  
  // Theme State: 'light', 'dark', oder 'auto'
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'auto');

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

  const calculateAverages = (testHistory) => {
    if (testHistory.length === 0) {
      setAverages({ download: 0, upload: 0, ping: 0 });
      return;
    }
    const totalDownload = testHistory.reduce((sum, test) => sum + test.download, 0);
    const totalUpload = testHistory.reduce((sum, test) => sum + test.upload, 0);
    const totalPing = testHistory.reduce((sum, test) => sum + test.ping, 0);

    setAverages({
      download: totalDownload / testHistory.length,
      upload: totalUpload / testHistory.length,
      ping: totalPing / testHistory.length,
    });
  };

  const fetchHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/history');
      setHistory(response.data);
      if (response.data.length > 0) {
        setLastResult(response.data[0]);
      }
      calculateAverages(response.data);
    } catch (err) {
      console.error("Fehler beim Abrufen des Verlaufs", err);
    }
  };

  // useEffect für Initialisierung und Auto-Refresh
  useEffect(() => {
    fetchHistory(); 

    const intervalId = setInterval(() => {
        if (!loading) {
            fetchHistory();
        }
    }, 30000); 

    return () => clearInterval(intervalId); 
  }, [loading]); 

  // Neue runTest Funktion mit SSE
  const runTest = () => {
    setLoading(true);
    setError(null);
    // Reset Live-Werte auf 0 beim Start
    setCurrentTestValues({ download: 0, upload: 0, ping: 0 });

    const eventSource = new EventSource('http://localhost:5000/api/test/stream');
    
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
            } else if (data.type === 'error') {
                setError(data.message);
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
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        yAxisID: 'y',
        tension: 0.3,
      },
      {
        label: 'Upload (Mbps)',
        data: chartDataReversed.map(item => item.upload),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        yAxisID: 'y',
        tension: 0.3,
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
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        yAxisID: 'y',
        tension: 0.3,
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
      title: {
        display: true,
        text: 'Download & Upload Verlauf',
        color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666',
      },
      legend: {
        labels: {
            color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#e0e0e0' : '#666'
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

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        
        {/* MAIN CARD (Links oben) */}
        {displayData && (
          <div className="card card-main">
            <h2>{resultCardTitle}</h2>
            
            {/* Entfernte Zeile: Metadaten (Datum/Uhrzeit und Server) werden hier nicht mehr angezeigt */}
            {loading && (
               <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic'}}>
                 Ermittle Daten...
               </p>
            )}

            <div className="results-grid">
              <div className="metric">
                <h3>Download</h3>
                <p>{displayData.download?.toFixed(2) || '0.00'} <span>Mbps</span></p>
              </div>
              <div className="metric">
                <h3>Upload</h3>
                <p>{displayData.upload?.toFixed(2) || '0.00'} <span>Mbps</span></p>
              </div>
              <div className="metric">
                <h3>Ping</h3>
                <p>{displayData.ping?.toFixed(0) || '0'} <span>ms</span></p>
              </div>
            </div>
          </div>
        )}
        
        {/* STATS CARD (Rechts oben) */}
        {history.length > 0 && (
          <div className="card card-stats">
            <h2>Durchschnitt</h2>
            <div className="stats-grid">
              <div className="metric">
                <h3>Download Ø</h3>
                <p>{averages.download.toFixed(2)} <span>Mbps</span></p>
              </div>
              <div className="metric">
                <h3>Upload Ø</h3>
                <p>{averages.upload.toFixed(2)} <span>Mbps</span></p>
              </div>
              <div className="metric">
                <h3>Ping Ø</h3>
                <p>{averages.ping.toFixed(0)} <span>ms</span></p>
              </div>
            </div>
          </div>
        )}

        {/* LIST CARD (Mitte) */}
        {history.length > 0 && (
          <div className="card card-list">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h2 style={{margin: 0, border: 'none', padding: 0}}>Letzte 5 Tests</h2>
                <a href="http://localhost:5000/api/export" target="_blank" rel="noopener noreferrer" style={{color: '#667eea', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold'}}>
                    CSV Export ⬇
                </a>
            </div>
            
            {/* Kopfzeile hinzugefügt */}
            <div className="recent-tests-table-header">
                <div className="header-time">Uhrzeit</div>
                <div className="header-server">Server</div>
                <div className="header-download">Download</div>
                <div className="header-upload">Upload</div>
                <div className="header-ping">Ping</div>
            </div>

            <ul className="recent-tests-list"> 
              {history.slice(0, 5).map((test, index) => (
                <li key={test.id} className="recent-tests-row">
                  <div className="row-time">
                    {new Date(test.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    <span className="row-date">{new Date(test.timestamp).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="row-server" title={test.serverLocation}>
                    {test.serverLocation}
                  </div>

                  <div className="row-metric download">
                    <span className="icon">⬇</span> {test.download.toFixed(0)} <small>Mbps</small>
                  </div>
                  
                  <div className="row-metric upload">
                    <span className="icon">⬆</span> {test.upload.toFixed(0)} <small>Mbps</small>
                  </div>
                  
                  <div className="row-metric ping">
                    <span className="icon">⚡</span> {test.ping.toFixed(0)} <small>ms</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CHARTS (Unten) */}
        {history.length > 0 && (
          <>
            <div className="card chart-container card-chart1">
              <Line key={`speed-${theme}`} options={speedOptions} data={speedData} />
            </div>
            <div className="card chart-container card-chart2">
              <Line key={`ping-${theme}`} options={pingOptions} data={pingData} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
