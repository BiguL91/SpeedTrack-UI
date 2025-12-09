import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { generateCron, parseCronToState } from '../utils/cronHelpers';

const SettingsModal = ({
    showSettings,
    setShowSettings,
    onSettingsSaved, // Callback um App.js über Änderungen zu informieren (z.B. neuer Cron Schedule)
    showToast,
    fetchHistory
}) => {
    // UI State für den Settings-Dialog
    const [intervalBase, setIntervalBase] = useState('1h');
    const [startTime, setStartTime] = useState('00:00');

    // Settings States
    const [cronSchedule, setCronSchedule] = useState(''); // Lokaler State für Anzeige/Berechnung
    const [retentionPeriod, setRetentionPeriod] = useState('0');
    const [expectedDownload, setExpectedDownload] = useState('0');
    const [expectedUpload, setExpectedUpload] = useState('0');
    const [tolerance, setTolerance] = useState('10');
    const [retryCount, setRetryCount] = useState('3');
    const [retryDelay, setRetryDelay] = useState('30');
    const [retryStrategy, setRetryStrategy] = useState('AVG');
    const [retryServerStrategy, setRetryServerStrategy] = useState('NEW');
    const [serverBlacklist, setServerBlacklist] = useState('');

    // Confirm Flow State: null -> 'backup' -> 'delete'
    const [confirmStep, setConfirmStep] = useState(null);

    // Lade Settings beim Öffnen
    const fetchSettings = useCallback(async () => {
        try {
            const response = await axios.get('/api/settings');
            const loadedCron = response.data.cron_schedule;
            
            setCronSchedule(loadedCron);
            const { interval, time } = parseCronToState(loadedCron);
            setIntervalBase(interval);
            setStartTime(time);
            
            setRetentionPeriod(response.data.retention_period);
            setExpectedDownload(response.data.expected_download);
            setExpectedUpload(response.data.expected_upload);
            setTolerance(response.data.tolerance);
            setRetryCount(response.data.retry_count);
            setRetryDelay(response.data.retry_delay);
            setRetryStrategy(response.data.retry_strategy);
            setRetryServerStrategy(response.data.retry_server_strategy || 'KEEP');
            setServerBlacklist(response.data.server_blacklist || '');
        } catch (err) {
            console.error("Fehler beim Laden der Einstellungen", err);
            showToast("Fehler beim Laden der Einstellungen", "error");
        }
    }, [showToast]);

    useEffect(() => {
        if (showSettings) {
            fetchSettings();
            setConfirmStep(null); // Reset confirm step
        }
    }, [showSettings, fetchSettings]);

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
                retry_strategy: retryStrategy,
                retry_server_strategy: retryServerStrategy,
                server_blacklist: serverBlacklist
            });
            
            // App.js informieren
            if (onSettingsSaved) {
                onSettingsSaved(newCron, {
                    expectedDownload,
                    expectedUpload,
                    tolerance
                });
            }
            
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

    if (!showSettings) return null;

    return (
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
                                <label>Strategie (Ergebnisberechnung):</label>
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

                        <div style={{marginTop: '15px'}}>
                                <label>Server bei Wiederholung:</label>
                                <select 
                                    value={retryServerStrategy} 
                                    onChange={(e) => setRetryServerStrategy(e.target.value)}
                                    style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                >
                                    <option value="KEEP">Gleichen Server nutzen</option>
                                    <option value="NEW">Neuen Server suchen (Standard)</option>
                                </select>
                                <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                                    Bei "Neu suchen" wird versucht, temporär einen anderen Server zu nutzen.
                                </div>
                        </div>

                        <div style={{marginTop: '15px'}}>
                                <label>Server Blacklist (IDs, kommasepariert):</label>
                                <input 
                                    type="text" 
                                    value={serverBlacklist} 
                                    onChange={(e) => setServerBlacklist(e.target.value)}
                                    placeholder="z.B. 1234, 5678"
                                />
                                <div style={{fontSize: '0.8rem', color: '#666', marginTop: '0'}}>
                                    Diese Server werden bei automatischen Tests ignoriert (nicht bei manuellen Tests).
                                </div>
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
    );
};

export default SettingsModal;
