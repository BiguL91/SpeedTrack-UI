import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { generateCron, parseCronToState } from '../utils/cronHelpers';

const SettingsModal = ({
    showSettings,
    setShowSettings,
    onSettingsSaved,
    showToast,
    fetchHistory
}) => {
    // UI State
    const [activeTab, setActiveTab] = useState('planning'); // planning, quality, advanced, database
    const [intervalBase, setIntervalBase] = useState('1h');
    const [startTime, setStartTime] = useState('00:00');

    // Settings States
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

    // Load Settings
    const fetchSettings = useCallback(async () => {
        try {
            const response = await axios.get('/api/settings');
            const loadedCron = response.data.cron_schedule;
            
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
            setConfirmStep(null);
            setActiveTab('planning'); // Reset to first tab on open
        }
    }, [showSettings, fetchSettings]);

    // Save Settings
    const saveSettings = async () => {
        try {
            const newCron = generateCron(intervalBase, startTime);
            
            await axios.post('/api/settings', { 
                cron_schedule: newCron,
                retention_period: retentionPeriod,
                expected_download: expectedDownload,
                expected_upload: expectedUpload,
                tolerance: tolerance,
                retry_count: retryCount,
                retry_delay: retryDelay,
                retry_strategy: retryStrategy,
                retry_server_strategy: retryServerStrategy,
                server_blacklist: serverBlacklist
            });
            
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

    // --- DB RESET FLOW ---
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
            fetchHistory();
            setConfirmStep(null);
            setShowSettings(false);
        } catch (err) {
            showToast("Fehler beim Leeren der DB: " + (err.response?.data?.error || err.message), "error");
        }
    };

    if (!showSettings) return null;

    // --- TAB STYLES ---
    const tabBtnStyle = (tabName) => ({
        padding: '10px 15px',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        borderBottom: activeTab === tabName ? '2px solid #3498db' : '2px solid transparent',
        color: activeTab === tabName ? 'var(--text-color)' : 'var(--text-secondary)',
        fontWeight: activeTab === tabName ? 'bold' : 'normal',
        fontSize: '0.95rem',
        transition: 'all 0.2s'
    });

    return (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
            
            {/* --- CONFIRMATION DIALOGS (Override everything else) --- */}
            {confirmStep === 'backup' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
                </div>
            )}

            {confirmStep === 'delete' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h2 style={{color: '#e74c3c'}}>🚨 Endgültig löschen?</h2>
                    <p style={{fontSize: '1rem', marginBottom: '30px', fontWeight: 'bold'}}>
                        Bist du sicher? Dieser Vorgang kann nicht rückgängig gemacht werden. Alle gespeicherten Testergebnisse werden gelöscht.
                    </p>
                    <div className="modal-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                        <button className="modal-button" onClick={() => setConfirmStep(null)}>Abbrechen</button>
                        <button className="modal-button-danger" onClick={handleFinalDelete}>Ja, alles löschen</button>
                    </div>
                </div>
            )}

            {/* --- NORMAL SETTINGS VIEW --- */}
            {!confirmStep && (
                <>
                    <h2 style={{ marginBottom: '15px' }}>⚙️ Einstellungen</h2>

                    {/* TABS HEADER */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px', gap: '5px' }}>
                        <button style={tabBtnStyle('planning')} onClick={() => setActiveTab('planning')}>🕒 Planung</button>
                        <button style={tabBtnStyle('quality')} onClick={() => setActiveTab('quality')}>🛡️ Qualität</button>
                        <button style={tabBtnStyle('advanced')} onClick={() => setActiveTab('advanced')}>⚙️ Erweitert</button>
                        <button style={tabBtnStyle('database')} onClick={() => setActiveTab('database')}>💾 Datenbank</button>
                    </div>

                    {/* TAB CONTENT SCROLLABLE AREA */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                        
                        {/* TAB 1: PLANNING */}
                        {activeTab === 'planning' && (
                            <div className="animate-fade-in">
                                <div className="form-group">
                                    <label>Intervall (Automatischer Test):</label>
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
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        Der Test-Zyklus orientiert sich an dieser Zeit.
                                    </div>

                                    <div style={{ marginTop: '15px', padding: '10px', background: 'var(--metric-bg)', borderRadius: '5px', fontSize: '0.85rem' }}>
                                        <strong>Cron-Vorschau:</strong> <code>{generateCron(intervalBase, startTime)}</code>
                                    </div>
                                </div>

                                <div className="form-group" style={{marginTop: '25px'}}>
                                    <label>Daten-Aufbewahrung (Tage):</label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        value={retentionPeriod}
                                        onChange={(e) => setRetentionPeriod(e.target.value)}
                                        style={{width: '100%', padding: '10px', marginBottom: '0'}}
                                    />
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        Tests älter als X Tage werden automatisch gelöscht. (0 = Nie löschen)
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: QUALITY & RETRY */}
                        {activeTab === 'quality' && (
                            <div className="animate-fade-in">
                                <h3 style={{fontSize: '1rem', marginBottom: '15px', color: 'var(--text-color)'}}>Soll-Werte</h3>
                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                                    <div>
                                        <label>Download (Mbps):</label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={expectedDownload}
                                            onChange={(e) => setExpectedDownload(e.target.value)}
                                            style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                            placeholder="0 = Aus"
                                        />
                                    </div>
                                    <div>
                                        <label>Upload (Mbps):</label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={expectedUpload}
                                            onChange={(e) => setExpectedUpload(e.target.value)}
                                            style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                            placeholder="0 = Aus"
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
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        Erlaubte Abweichung nach unten, bevor ein Test als "Fehlgeschlagen" gilt.
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />
                                
                                <h3 style={{fontSize: '1rem', marginBottom: '15px', color: 'var(--text-color)'}}>Wiederholungs-Logik (bei Fehler)</h3>

                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                                    <div>
                                        <label>Anzahl Versuche:</label>
                                        <input 
                                            type="number" 
                                            min="1"
                                            max="5"
                                            value={retryCount}
                                            onChange={(e) => setRetryCount(e.target.value)}
                                            style={{width: '100%', padding: '10px'}}
                                        />
                                    </div>
                                    <div>
                                        <label>Pause (Sekunden):</label>
                                        <input 
                                            type="number" 
                                            min="5"
                                            max="60"
                                            value={retryDelay}
                                            onChange={(e) => setRetryDelay(e.target.value)}
                                            style={{width: '100%', padding: '10px'}}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: ADVANCED */}
                        {activeTab === 'advanced' && (
                            <div className="animate-fade-in">
                                <div className="form-group">
                                    <label>Berechnungs-Strategie (bei Wiederholungen):</label>
                                    <select 
                                        value={retryStrategy} 
                                        onChange={(e) => setRetryStrategy(e.target.value)}
                                        style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                    >
                                        <option value="AVG">Durchschnitt aller Versuche</option>
                                        <option value="MIN">Minimum (Schlechtester Wert)</option>
                                        <option value="MAX">Maximum (Bester Wert)</option>
                                    </select>
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        Welcher Wert soll als Endergebnis gespeichert werden?
                                    </div>
                                </div>

                                <div className="form-group" style={{marginTop: '20px'}}>
                                    <label>Server-Strategie (bei Wiederholungen):</label>
                                    <select 
                                        value={retryServerStrategy} 
                                        onChange={(e) => setRetryServerStrategy(e.target.value)}
                                        style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                    >
                                        <option value="KEEP">Gleichen Server beibehalten</option>
                                        <option value="NEW">Neuen Server suchen</option>
                                    </select>
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        "Neu suchen" versucht bei schlechten Werten einen anderen Server zu finden.
                                    </div>
                                </div>

                                <div className="form-group" style={{marginTop: '20px'}}>
                                    <label>Server Blacklist (IDs):</label>
                                    <input 
                                        type="text" 
                                        value={serverBlacklist} 
                                        onChange={(e) => setServerBlacklist(e.target.value)}
                                        placeholder="z.B. 1234, 5678"
                                        style={{width: '100%', padding: '10px', marginTop: '5px'}}
                                    />
                                    <div style={{fontSize: '0.8rem', color: '#666', marginTop: '5px'}}>
                                        Kommaseparierte Liste. Diese Server werden bei <b>automatischen</b> Tests ignoriert.
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 4: DATABASE */}
                        {activeTab === 'database' && (
                            <div className="animate-fade-in" style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>⚠️</div>
                                <h3 style={{ marginBottom: '10px' }}>Datenbank Verwaltung</h3>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
                                    Hier kannst du alle gesammelten Testergebnisse unwiderruflich löschen. 
                                    Dies ist nützlich, um Speicherplatz freizugeben oder neu zu beginnen.
                                </p>
                                
                                <button 
                                    className="modal-button-danger" 
                                    style={{ padding: '15px 30px', fontSize: '1rem' }}
                                    onClick={startResetFlow}
                                >
                                    🗑️ Datenbank vollständig leeren
                                </button>
                            </div>
                        )}
                    </div>

                    {/* FOOTER ACTIONS */}
                    <div className="modal-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px'}}>
                        <button className="modal-button" style={{backgroundColor: '#666'}} onClick={() => setShowSettings(false)}>Abbrechen</button>
                        <button className="modal-button" onClick={() => saveSettings()}>Speichern</button>
                    </div>
                </>
            )}
          </div>
        </div>
    );
};

export default SettingsModal;