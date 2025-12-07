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
  
  // Neuer State für Live-Daten
  const [liveData, setLiveData] = useState({ phase: null, value: 0 }); 
  
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

  useEffect(() => {
    fetchHistory();
  }, []);

  // Neue runTest Funktion mit SSE
  const runTest = () => {
    setLoading(true);
    setError(null);
    setLiveData({ phase: 'init', value: 0 });

    const eventSource = new EventSource('http://localhost:5000/api/test/stream');

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'progress') {
                setLiveData({ phase: data.phase, value: data.value });
            } else if (data.type === 'done') {
                setLastResult(data.result);
                fetchHistory(); // Verlauf aktualisieren
                eventSource.close();
                setLoading(false);
                setLiveData({ phase: null, value: 0 });
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
        // Bei SSE ist onerror oft ungenau. Wir schließen und zeigen Fehler nur wenn wir noch laden.
        console.error("SSE Error:", err);
        if (eventSource.readyState === EventSource.CLOSED) return;
        
        eventSource.close();
        setLoading(false);
        // Wir setzen keinen harten Error Text hier, da Browser oft beim Schließen (Ende) einen Fehler werfen
        // außer wir haben noch kein Ergebnis.
        if (!lastResult && liveData.phase === 'init') {
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
        tension: 0.3, // Etwas weichere Kurven für modernen Look
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
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#444' : '#ddd' }
      },
    },
  };

  // Optionen für Ping
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
        grid: { color: theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '#444' : '#ddd' }
      },
    },
  };

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

      {/* LIVE ANZEIGE */}
      {loading && (
        <div className="card live-card">
            <h2>Live Test</h2>
            <div className="live-display">
                <p className="live-phase">{liveData.phase === 'init' ? 'Initialisiere...' : liveData.phase}</p>
                <p className="live-value">{liveData.value.toFixed(1)}</p>
                <p className="live-unit">{liveData.phase === 'ping' ? 'ms' : 'Mbps'}</p>
            </div>
        </div>
      )}

      {/* Durchschnittswerte */}
      {history.length > 0 && !loading && (
        <div className="card">
          <h2>Durchschnittliche Werte</h2>
          <div className="results-grid">
            <div className="metric">
              <h3>Durchschnitt Download</h3>
              <p>{averages.download.toFixed(2)} <span>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Durchschnitt Upload</h3>
              <p>{averages.upload.toFixed(2)} <span>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Durchschnitt Ping</h3>
              <p>{averages.ping.toFixed(0)} <span>ms</span></p>
            </div>
          </div>
        </div>
      )}

      {lastResult && !loading && (
        <div className="card">
          <h2>Letztes Ergebnis</h2>
          <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
            {new Date(lastResult.timestamp).toLocaleString()} - Server: {lastResult.serverLocation} ({lastResult.isp})
          </p>
          <div className="results-grid">
            <div className="metric">
              <h3>Download</h3>
              <p>{lastResult.download.toFixed(2)} <span>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Upload</h3>
              <p>{lastResult.upload.toFixed(2)} <span>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Ping</h3>
              <p>{lastResult.ping.toFixed(0)} <span>ms</span></p>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="card">
            <h2>Letzte 5 Tests</h2>
            <div className="recent-tests">
              {history.slice(0, 5).map((test, index) => (
                <div key={test.id} className="recent-test-item">
                  <p><strong>{new Date(test.timestamp).toLocaleString()}</strong></p>
                  <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>{test.serverLocation}</p>
                  <hr/>
                  <p>Down: <strong>{test.download.toFixed(0)}</strong> Mbps</p>
                  <p>Up: <strong>{test.upload.toFixed(0)}</strong> Mbps</p>
                  <p>Ping: <strong>{test.ping.toFixed(0)}</strong> ms</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card chart-container">
            <Line key={`speed-${theme}`} options={speedOptions} data={speedData} />
          </div>
          <div className="card chart-container">
            <Line key={`ping-${theme}`} options={pingOptions} data={pingData} />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
