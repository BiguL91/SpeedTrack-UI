import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

// ChartJS Registrierung (falls noch nicht global passiert, schadet nicht)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

const ExpandedChartModal = ({
    expandedChart,
    setExpandedChart,
    expandedChartLimit,
    setExpandedChartLimit,
    history,
    theme,
    expectedDownload,
    expectedUpload
}) => {
    
    // --- Data Logic ---
    const chartData = useMemo(() => {
        // Filtere Retry-Versuche raus
        const filteredHistory = history.filter(t => t.isAggregate === 1 || !t.groupId);
        
        const limit = expandedChartLimit;
        const source = limit === 0 ? filteredHistory : filteredHistory.slice(0, limit);
        const reversed = [...source].reverse();
        const labels = reversed.map(item => new Date(item.timestamp).toLocaleTimeString());
        
        const speedData = {
          labels,
          datasets: [
            {
              label: 'Download (Mbps)',
              data: reversed.map(item => item.download),
              borderColor: 'rgb(53, 162, 235)',
              backgroundColor: 'rgba(53, 162, 235, 0.2)',
              yAxisID: 'y',
              tension: 0.4,
              fill: true,
            },
            {
              label: 'Upload (Mbps)',
              data: reversed.map(item => item.upload),
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              yAxisID: 'y',
              tension: 0.4,
              fill: true,
            },
            // Grenzwerte
            ...(parseFloat(expectedDownload) > 0 ? [{
              label: 'Soll Download',
              data: Array(reversed.length).fill(parseFloat(expectedDownload)),
              borderColor: '#f39c12',
              borderDash: [10, 5],
              borderWidth: 2,
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            }] : []),
            ...(parseFloat(expectedUpload) > 0 ? [{
              label: 'Soll Upload',
              data: Array(reversed.length).fill(parseFloat(expectedUpload)),
              borderColor: '#2ecc71',
              borderDash: [10, 5],
              borderWidth: 2,
              pointRadius: 0,
              fill: false,
              yAxisID: 'y',
            }] : [])
          ],
        };
  
        const pingData = {
          labels,
          datasets: [
            {
              label: 'Ping (ms)',
              data: reversed.map(item => item.ping),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              yAxisID: 'y',
              tension: 0.4,
              fill: true,
            },
          ],
        };
  
        return { speedData, pingData };
    }, [history, expandedChartLimit, expectedDownload, expectedUpload]);

    // --- Options ---
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const textColor = isDark ? '#e0e0e0' : '#666';
    const gridColor = isDark ? '#444' : '#ddd';

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        stacked: false,
        plugins: {
            legend: { labels: { color: textColor } },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
            },
            title: { display: false } // Titel im Modal nicht doppelt
        },
        scales: {
            x: {
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };

    if (!expandedChart) return null;

    return (
        <div className="modal-overlay" onClick={() => setExpandedChart(null)}>
          <div 
            className="modal-content card" 
            style={{
                width: '95%', 
                height: '90%', 
                maxWidth: 'none', 
                display: 'flex', 
                flexDirection: 'column',
                padding: '20px'
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                    <h2 style={{margin: 0}}>{expandedChart === 'speed' ? 'Geschwindigkeit Detail' : 'Ping Detail'}</h2>
                    
                    <div style={{display: 'flex', gap: '5px'}}>
                        {[50, 100, 200, 500, 0].map(limit => (
                            <button 
                                key={limit}
                                onClick={() => setExpandedChartLimit(limit)}
                                style={{
                                    background: expandedChartLimit === limit ? 'var(--primary-gradient)' : 'transparent',
                                    color: expandedChartLimit === limit ? 'white' : 'var(--text-secondary)',
                                    border: '1px solid ' + (expandedChartLimit === limit ? 'transparent' : 'var(--border-color)'),
                                    padding: '4px 10px',
                                    borderRadius: '15px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {limit === 0 ? 'Alle' : limit}
                            </button>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={() => setExpandedChart(null)} 
                    style={{background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer', color: 'var(--text-color)', lineHeight: 0.8}}
                >
                    &times;
                </button>
            </div>
            <div style={{flex: 1, minHeight: 0, position: 'relative'}}>
                {expandedChart === 'speed' && (
                    <Line 
                        options={commonOptions} 
                        data={chartData.speedData} 
                    />
                )}
                {expandedChart === 'ping' && (
                    <Line 
                        options={commonOptions} 
                        data={chartData.pingData} 
                    />
                )}
            </div>
            <div style={{textAlign: 'center', marginTop: '10px', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
                Tipp: Nutze Mausrad zum Zoomen und Ziehen zum Verschieben.
            </div>
          </div>
        </div>
    );
};

export default ExpandedChartModal;
