import React from 'react';

const TestDetailModal = ({
    test,
    onClose,
    onToggleExclude,
    onToggleBlacklist,
    serverBlacklist
}) => {
    if (!test) return null;

    // Helper für Liste der Blacklist IDs
    const blacklistIds = serverBlacklist ? serverBlacklist.split(',').map(s => s.trim()) : [];

    return (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h2 style={{margin: 0}}>📊 Test Details</h2>
                <button 
                    onClick={onClose} 
                    style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-color)'}}
                >
                    &times;
                </button>
            </div>
            
            <div className="detail-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', textAlign: 'left'}}>
                
                <div className="detail-item full-width" style={{gridColumn: '1 / -1', background: 'var(--metric-bg)', padding: '15px', borderRadius: '10px'}}>
                    <strong style={{display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Zeitpunkt</strong>
                    <span style={{fontSize: '1.1rem', fontWeight: 'bold'}}>
                        {new Date(test.timestamp).toLocaleString()}
                    </span>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Download</strong>
                    <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#35a2eb'}}>{test.download.toFixed(2)} Mbps</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Upload</strong>
                    <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#ff6384'}}>{test.upload.toFixed(2)} Mbps</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Ping</strong>
                    <div style={{fontSize: '1.1rem'}}>{test.ping.toFixed(1)} ms</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Jitter</strong>
                    <div style={{fontSize: '1.1rem'}}>{test.jitter ? test.jitter.toFixed(1) + ' ms' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Paketverlust</strong>
                    <div style={{fontSize: '1.1rem'}}>{test.packetLoss ? test.packetLoss.toFixed(2) : '0.00'}%</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>ISP</strong>
                    <div style={{fontSize: '1rem'}}>{test.isp}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Download Zeit</strong>
                    <div style={{fontSize: '1rem'}}>{test.downloadElapsed ? (test.downloadElapsed / 1000).toFixed(2) + ' s' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Upload Zeit</strong>
                    <div style={{fontSize: '1rem'}}>{test.uploadElapsed ? (test.uploadElapsed / 1000).toFixed(2) + ' s' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Daten (Down)</strong>
                    <div style={{fontSize: '1rem'}}>{test.downloadBytes ? (test.downloadBytes / 1024 / 1024).toFixed(1) + ' MB' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Daten (Up)</strong>
                    <div style={{fontSize: '1rem'}}>{test.uploadBytes ? (test.uploadBytes / 1024 / 1024).toFixed(1) + ' MB' : '-'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>VPN aktiv?</strong>
                    <div style={{fontSize: '1rem'}}>{test.isVpn ? 'Ja 🔒' : 'Nein'}</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Externe IP</strong>
                    <div style={{fontSize: '1rem'}}>{test.externalIp || '-'}</div>
                </div>

                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Ergebnis Link</strong>
                    {test.resultUrl ? (
                        <a href={test.resultUrl} target="_blank" rel="noopener noreferrer" style={{color: '#667eea', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold', display: 'block', wordBreak: 'break-all'}}>
                            {test.resultUrl.split('/').pop()} ↗
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
                    <div>{test.serverLocation} ({test.serverCountry})</div>
                </div>

                <div className="detail-item">
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Server ID</strong>
                    <div>{test.serverId || '-'}</div>
                </div>

                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Host</strong>
                    <div style={{fontFamily: 'monospace'}}>{test.serverHost ? `${test.serverHost}:${test.serverPort}` : '-'}</div>
                </div>
                
                <div className="detail-item full-width" style={{gridColumn: '1 / -1'}}>
                    <strong style={{color: 'var(--text-secondary)', fontSize: '0.8rem'}}>Server IP</strong>
                    <div style={{fontFamily: 'monospace'}}>{test.serverIp || '-'}</div>
                </div>
                
                <div className="detail-group" style={{gridColumn: '1 / -1', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center'}}>
                    {(!test.groupId || test.isAggregate === 1) && (
                        <button 
                            className="modal-button"
                            style={{
                                background: test.excludeFromStats === 1 ? 'var(--primary-gradient)' : '#666',
                                color: 'white',
                                width: '100%'
                            }}
                            onClick={() => onToggleExclude(test.id, test.excludeFromStats !== 1)}
                        >
                            {test.excludeFromStats === 1 
                                ? '✅ Wieder in Statistik aufnehmen' 
                                : '🚫 Aus Statistik ausschließen'
                            }
                        </button>
                    )}

                    {test.serverId && (
                        <button 
                            className="modal-button"
                            style={{
                                background: blacklistIds.includes(String(test.serverId)) ? '#2ecc71' : '#e74c3c', 
                                color: 'white',
                                width: '100%',
                                marginTop: (!test.groupId || test.isAggregate === 1) ? '10px' : '0' 
                            }}
                            onClick={() => onToggleBlacklist(test.serverId)}
                        >
                            {blacklistIds.includes(String(test.serverId))
                                ? '✅ Von Blacklist entfernen' 
                                : '🚫 Server dauerhaft ignorieren'
                            }
                        </button>
                    )}
                </div>
            </div>
          </div>
        </div>
    );
};

export default TestDetailModal;
