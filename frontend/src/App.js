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

  const fetchHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/history');
      setHistory(response.data);
      if (response.data.length > 0) {
        setLastResult(response.data[0]);
      }
    } catch (err) {
      console.error("Fehler beim Abrufen des Verlaufs", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('http://localhost:5000/api/test');
      setLastResult(response.data);
      await fetchHistory(); // Verlauf aktualisieren
    } catch (err) {
      setError("Test fehlgeschlagen. Bitte stelle sicher, dass das Backend läuft und die Speedtest CLI installiert ist.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Chart-Daten vorbereiten
  // Wir wollen den Verlauf für das Diagramm umkehren, damit er von links nach rechts verläuft (alt nach neu)
  const chartDataReversed = [...history].reverse();

  const data = {
    labels: chartDataReversed.map(item => new Date(item.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Download (Mbps)',
        data: chartDataReversed.map(item => item.download),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        yAxisID: 'y',
      },
      {
        label: 'Upload (Mbps)',
        data: chartDataReversed.map(item => item.upload),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        yAxisID: 'y',
      },
      {
        label: 'Ping (ms)',
        data: chartDataReversed.map(item => item.ping),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        yAxisID: 'y1',
      },
    ],
  };

  const options = {
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
        text: 'Speedtest Verlauf',
      },
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Geschwindigkeit (Mbps)'
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'Ping (ms)'
        }
      },
    },
  };

  return (
    <div className="App">
      <h1>SpeedTest Tracker</h1>
      
      <div className="card">
        <button onClick={runTest} disabled={loading}>
          {loading ? 'Speedtest läuft...' : 'Neuen Test starten'}
        </button>
        {loading && <p className="loader">Das kann bis zu 30 Sekunden dauern...</p>}
        {error && <p style={{color: 'red'}}>{error}</p>}
      </div>

      {lastResult && (
        <div className="card">
          <h2>Letztes Ergebnis</h2>
          <p style={{fontSize: '0.8em', color: '#666'}}>
            {new Date(lastResult.timestamp).toLocaleString()} - Server: {lastResult.serverLocation} ({lastResult.isp})
          </p>
          <div className="results-grid">
            <div className="metric">
              <h3>Download</h3>
              <p>{lastResult.download.toFixed(2)} <span style={{fontSize: '0.5em'}}>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Upload</h3>
              <p>{lastResult.upload.toFixed(2)} <span style={{fontSize: '0.5em'}}>Mbps</span></p>
            </div>
            <div className="metric">
              <h3>Ping</h3>
              <p>{lastResult.ping.toFixed(0)} <span style={{fontSize: '0.5em'}}>ms</span></p>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card chart-container">
          <Line options={options} data={data} />
        </div>
      )}
    </div>
  );
}

export default App;
