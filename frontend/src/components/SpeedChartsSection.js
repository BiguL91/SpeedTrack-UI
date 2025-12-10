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
import { Line, Bar } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import { isBelowThreshold } from '../utils/dataHelpers';

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

const SpeedChartsSection = ({
    history,
    theme,
    expectedDownload,
    expectedUpload,
    tolerance,
    chartDataLimit,
    setChartDataLimit,
    setExpandedChart
}) => {

    // Helper: Prüft ob ein Test unter der Toleranz liegt (für Bar Chart Farben)
    // Wir nehmen hier eine vereinfachte Logik oder übergeben tolerance als Prop.
    // Da wir tolerance hier nicht haben, lassen wir die Einfärbung im Bar Chart erst mal generisch rot/grün basierend auf success/fail Flag wenn vorhanden, 
    // oder wir müssen die 'isBelowThreshold' Logik hier duplizieren oder als Prop reinreichen.
    // Ich entscheide mich dafür, die Logik hier lokal zu haben, aber wir brauchen die 'tolerance' Prop.
    // Ich füge 'tolerance' oben hinzu.
    
    // --- Chart Daten Logik ---
    const chartData = useMemo(() => {
        // Filtere Retry-Versuche raus, zeige nur Aggregate oder Einzeltests
        // UND filtere ignorierte Tests raus
        const filteredHistory = history.filter(t => (t.isAggregate === 1 || !t.groupId) && t.excludeFromStats !== 1);
        
        const limit = chartDataLimit;
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
    }, [history, chartDataLimit, expectedDownload, expectedUpload]);


    // --- Balkendiagramm Daten Logik ---
    const testsPerDayData = useMemo(() => {
         const dataMap = {}; 
         // Sortiere chronologisch
         const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
   
         sortedHistory.forEach(test => {
             // Filtere ignorierte Tests
             if (test.excludeFromStats === 1) return;
             
             // Filtere Einzeltests raus, die Teil einer Gruppe sind (wir wollen nur das Aggregat zählen)
             if (test.groupId && test.isAggregate !== 1) return;
   
                          const dateKey = new Date(test.timestamp).toLocaleDateString();
                          if (!dataMap[dateKey]) dataMap[dateKey] = { pass: 0, fail: 0 };
                          
                          if (isBelowThreshold(test, expectedDownload, expectedUpload, tolerance)) {
                              dataMap[dateKey].fail++;
                          } else {
                              dataMap[dateKey].pass++;
                          }
                      });
                
                      const labels = Object.keys(dataMap);
                      const passData = labels.map(date => dataMap[date].pass);
                      const failData = labels.map(date => dataMap[date].fail);
                
                      return {
                          labels,
                          datasets: [
                              {
                                  label: 'Bestanden',
                                  data: passData,
                                  backgroundColor: 'rgba(46, 204, 113, 0.7)',
                                  stack: 'Stack 0',
                              },
                              {
                                  label: 'Nicht Bestanden',
                                  data: failData,
                                  backgroundColor: 'rgba(231, 76, 60, 0.7)',
                                  stack: 'Stack 0',
                              }
                          ]
                      };
                 }, [history, expectedDownload, expectedUpload, tolerance]);
    // --- Optionen ---
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
            }
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

    const speedOptions = {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Geschwindigkeit (Mbps)', color: textColor } }
    };

    const pingOptions = {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Ping (ms)', color: textColor } }
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { color: textColor } },
            title: { display: false },
        },
        scales: {
            x: { stacked: true, ticks: { color: textColor }, grid: { display: false } },
            y: { 
                stacked: true, 
                beginAtZero: true, 
                grace: '5%',
                ticks: { stepSize: 1, color: textColor }, 
                grid: { color: gridColor } 
            }
        }
    };

    if (history.length === 0) return null;

    return (
        <>
            <div className="charts-row">
                {/* GESCHWINDIGKEITS-DIAGRAMM */}
                <div 
                    className="card chart-container" 
                    style={{display: 'flex', flexDirection: 'column', position: 'relative', cursor: 'pointer'}}
                    onClick={() => setExpandedChart('speed')}
                    title="Klicken zum Vergrößern"
                >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                        <h3 style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-color)'}}>Geschwindigkeit</h3>
                        <div style={{display: 'flex', gap: '5px'}} onClick={(e) => e.stopPropagation()}>
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
                    <div style={{flex: 1, minHeight: 0, position: 'relative'}}>
                        <Line options={speedOptions} data={chartData.speedData} />
                    </div>
                </div>

                {/* PING-DIAGRAMM */}
                <div 
                    className="card chart-container" 
                    style={{display: 'flex', flexDirection: 'column', position: 'relative', cursor: 'pointer'}}
                    onClick={() => setExpandedChart('ping')}
                    title="Klicken zum Vergrößern"
                >
                    <div style={{marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <h3 style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-color)'}}>Ping</h3>
                    </div>
                    <div style={{flex: 1, minHeight: 0, position: 'relative'}}>
                        <Line options={pingOptions} data={chartData.pingData} />
                    </div>
                </div>
            </div>

            {/* BALKENDIAGRAMM */}
            <div className="card chart-container" style={{display: 'flex', flexDirection: 'column', position: 'relative', marginTop: '20px'}}>
                <div style={{marginBottom: '15px'}}>
                        <h3 style={{margin: 0, fontSize: '1.1rem', color: 'var(--text-color)'}}>Tests pro Tag</h3>
                </div>
                <div style={{flex: 1, minHeight: 0, position: 'relative'}}>
                    <Bar options={barOptions} data={testsPerDayData} />
                </div>
            </div>
        </>
    );
};

export default SpeedChartsSection;
