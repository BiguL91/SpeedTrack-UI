import React from 'react';
import { isBelowThreshold, formatServerDisplay } from '../utils/dataHelpers';

const HistoryTable = ({
    tests,
    history, // Benötigt, um Details von aggregierten Gruppen nachzuschlagen
    expandedGroupId,
    toggleExpand,
    serverBlacklist,
    expectedDownload,
    expectedUpload,
    tolerance,
    onSelectTest,
    isFullHistory = false
}) => {
    
    // Hilfsfunktion: Prüft, ob Server auf der Blacklist steht
    const isBlacklisted = (serverId) => {
        if (!serverId || !serverBlacklist) return false;
        return String(serverBlacklist).split(',').map(s => s.trim()).includes(String(serverId));
    };

    if (!tests || tests.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Keine Testergebnisse vorhanden. Starte einen Test oder importiere Daten.
            </div>
        );
    }

    return (
        <>
            <div className={`recent-tests-table-header ${isFullHistory ? 'full-history-header' : ''}`}>
                <div className="header-id" style={{ width: isFullHistory ? undefined : '120px', textAlign: 'left' }}>ID</div>
                <div className="header-time">
                    {isFullHistory ? 'Zeitpunkt' : 'Uhrzeit'}
                </div>
                <div className="header-server">Server</div>
                <div className="header-download">Download</div>
                <div className="header-upload">Upload</div>
                <div className="header-ping">Ping</div>
                {isFullHistory && (
                    <>
                        <div className="header-packet-loss">Paketverlust</div>
                        <div className="header-country">Land</div>
                    </>
                )}
            </div>

            <ul className="recent-tests-list">
                {tests.map((test) => {
                    const isGroup = test.isAggregate === 1;
                    const isExpanded = isGroup && expandedGroupId === test.groupId;

                    // Detail-Items finden, falls es eine Gruppe ist
                    const details = isGroup ? history.filter(d => d.groupId === test.groupId && d.isAggregate === 0) : [];

                    return (
                        <React.Fragment key={test.id}>
                            <li
                                className={`recent-tests-row ${isFullHistory ? 'full-history-row' : ''} ${test.isManual ? 'manual-test-row' : 'auto-test-row'}`}
                                onClick={() => onSelectTest(test)}
                                style={{
                                    cursor: 'pointer',
                                    borderLeft: isGroup ? '4px solid #9b59b6' : undefined,
                                    backgroundColor: isBelowThreshold(test, expectedDownload, expectedUpload, tolerance) ? 'rgba(231, 76, 60, 0.1)' : undefined
                                }}
                            >
                                <div
                                    className="row-id"
                                    style={{ 
                                        width: isFullHistory ? undefined : '120px', 
                                        fontWeight: 'bold', 
                                        color: 'var(--text-color)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        cursor: isGroup ? 'pointer' : 'inherit' 
                                    }}
                                    onClick={(e) => {
                                        if (isGroup) {
                                            e.stopPropagation();
                                            toggleExpand(test.groupId);
                                        }
                                    }}
                                >
                                    {isGroup && <span style={{ fontSize: '0.8rem' }}>{isExpanded ? '▼' : '▶'}</span>}
                                    {test.id}
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <span title={test.isManual ? "Manueller Test" : "Automatischer Test"} style={{ fontSize: '0.8rem', cursor: 'help', lineHeight: 1 }}>
                                            {test.isManual ? '👤' : '🤖'}
                                        </span>
                                        {isGroup && <span title="Durchschnittswert" style={{ fontSize: '0.8rem', lineHeight: 1 }}>📦</span>}
                                        {test.excludeFromStats === 1 && <span title="Wird in Statistik ignoriert" style={{ fontSize: '0.8rem', lineHeight: 1 }}>🚫</span>}
                                        {isBlacklisted(test.serverId) &&
                                            <span title="Server auf Blacklist" style={{ fontSize: '0.8rem', lineHeight: 1 }}>⛔</span>
                                        }
                                    </div>
                                </div>

                                <div className="row-time">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {new Date(test.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <span className="row-date">{new Date(test.timestamp).toLocaleDateString()}</span>
                                </div>

                                <div className="row-server" title={test.serverLocation}>
                                    {formatServerDisplay(test)}
                                </div>

                                <div className="row-metric download">
                                    <span className="icon">⬇</span>
                                    <span style={{
                                        color: (parseFloat(expectedDownload) > 0 && test.download < parseFloat(expectedDownload) * (1 - parseFloat(tolerance) / 100)) ? '#e74c3c' : 'inherit'
                                    }}>
                                        {test.download.toFixed(0)}
                                    </span>
                                    <small>MBit/s</small>
                                </div>

                                <div className="row-metric upload">
                                    <span className="icon">⬆</span>
                                    <span style={{
                                        color: (parseFloat(expectedUpload) > 0 && test.upload < parseFloat(expectedUpload) * (1 - parseFloat(tolerance) / 100)) ? '#e74c3c' : 'inherit'
                                    }}>
                                        {test.upload.toFixed(0)}
                                    </span>
                                    <small>MBit/s</small>
                                </div>

                                <div className="row-metric ping">
                                    <span className="icon">⚡</span> {test.ping.toFixed(0)} <small>ms</small>
                                </div>
                                
                                {isFullHistory && (
                                    <>
                                        <div className="row-packet-loss">{test.packetLoss ? test.packetLoss.toFixed(2) : '0.00'}%</div>
                                        <div className="row-country">{test.serverCountry || '-'}</div>
                                    </>
                                )}
                            </li>

                            {/* DETAIL ZEILEN */}
                            {isExpanded && details.map(detail => (
                                <li
                                    key={detail.id}
                                    className={`recent-tests-row ${isFullHistory ? 'full-history-row' : ''} detail-row`}
                                    onClick={() => onSelectTest(detail)}
                                    style={{
                                        cursor: 'pointer',
                                        background: isBelowThreshold(detail, expectedDownload, expectedUpload, tolerance) ? 'rgba(231, 76, 60, 0.1)' : 'rgba(0,0,0,0.02)',
                                        opacity: 0.8,
                                        padding: isFullHistory ? undefined : '8px 15px'
                                    }}
                                >
                                    <div className="row-id" style={{ 
                                        width: isFullHistory ? undefined : '60px', 
                                        paddingLeft: '15px', 
                                        fontSize: '0.8rem', 
                                        color: '#999', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '5px' 
                                    }}>
                                        ↳ {detail.id}
                                        {isBlacklisted(detail.serverId) &&
                                            <span title="Server auf Blacklist" style={{ fontSize: '0.7rem', lineHeight: 1 }}>⛔</span>
                                        }
                                    </div>
                                    
                                    <div className="row-time">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontStyle: 'italic', color: '#999' }}>
                                            {new Date(detail.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>

                                    <div className="row-server" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                        {formatServerDisplay(detail)}
                                    </div>

                                    <div className="row-metric download">
                                        <span className="icon">⬇</span>
                                        <span style={{
                                            color: (parseFloat(expectedDownload) > 0 && detail.download < parseFloat(expectedDownload) * (1 - parseFloat(tolerance) / 100)) ? '#e74c3c' : 'inherit'
                                        }}>
                                            {detail.download.toFixed(0)}
                                        </span>
                                        <small>MBit/s</small>
                                    </div>

                                    <div className="row-metric upload">
                                        <span className="icon">⬆</span>
                                        <span style={{
                                            color: (parseFloat(expectedUpload) > 0 && detail.upload < parseFloat(expectedUpload) * (1 - parseFloat(tolerance) / 100)) ? '#e74c3c' : 'inherit'
                                        }}>
                                            {detail.upload.toFixed(0)}
                                        </span>
                                        <small>MBit/s</small>
                                    </div>

                                    <div className="row-metric ping">
                                        <span className="icon">⚡</span> {detail.ping.toFixed(0)} <small>ms</small>
                                    </div>

                                    {isFullHistory && (
                                        <>
                                            <div className="row-packet-loss">{detail.packetLoss ? detail.packetLoss.toFixed(2) : '0.00'}%</div>
                                            <div className="row-country">{detail.serverCountry}</div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </React.Fragment>
                    );
                })}
            </ul>
        </>
    );
};

export default HistoryTable;
