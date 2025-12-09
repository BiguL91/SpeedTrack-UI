import React, { useState, useEffect, useRef } from 'react';

const SystemStatusPanel = () => {
    const [logs, setLogs] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const logEndRef = useRef(null);
    const eventSourceRef = useRef(null);

    useEffect(() => {
        let retryTimeout;

        const connect = () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            const eventSource = new EventSource('/api/status/stream');
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                setIsConnected(true);
                // System Nachricht
                // setLogs(prev => [...prev.slice(-49), { message: "Verbunden mit System-Status", type: "system", timestamp: new Date().toISOString() }]);
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setLogs(prev => {
                        // Max 50 Logs behalten
                        const newLogs = [...prev, data];
                        if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
                        return newLogs;
                    });
                } catch (e) {
                    console.error("Status Parse Error", e);
                }
            };

            eventSource.onerror = (err) => {
                console.log("Status Stream Verbindung verloren, reconnecting...", err);
                setIsConnected(false);
                eventSource.close();
                // Retry nach 5s
                retryTimeout = setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
            clearTimeout(retryTimeout);
        };
    }, []);

    // Auto-Scroll nach unten
    useEffect(() => {
        if (isExpanded && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isExpanded]);

    // Wenn keine Logs da sind, zeige nichts an (außer wir sind disconnected)
    if (logs.length === 0 && isConnected) return null;

    const lastLog = logs.length > 0 ? logs[logs.length - 1] : { message: "Warte auf Status...", type: "info" };

    // Styles für verschiedene Log-Typen
    const getTypeColor = (type) => {
        switch (type) {
            case 'error': return '#e74c3c';
            case 'success': return '#2ecc71';
            case 'warning': return '#f1c40f';
            case 'start': return '#3498db';
            case 'waiting': return '#9b59b6';
            case 'running': return '#e67e22';
            default: return 'var(--text-color)';
        }
    };

    return (
        <div 
            style={{
                position: 'fixed',
                bottom: '10px',
                right: '10px',
                width: isExpanded ? '400px' : 'auto',
                maxWidth: '90vw',
                maxHeight: isExpanded ? '300px' : 'auto',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontSize: '0.85rem',
                transition: 'all 0.3s ease'
            }}
        >
            {/* Header / Minimized View */}
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: isExpanded ? 'var(--bg-color)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
            >
                {/* Status Dot */}
                <div style={{
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: isConnected ? '#2ecc71' : '#e74c3c',
                    boxShadow: isConnected ? '0 0 5px #2ecc71' : 'none',
                    flexShrink: 0
                }} title={isConnected ? "Verbunden" : "Getrennt"}></div>

                {/* Last Message (Visible when minimized) */}
                {!isExpanded && (
                    <div style={{
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        maxWidth: '250px',
                        color: getTypeColor(lastLog.type)
                    }}>
                        {lastLog.message}
                    </div>
                )}
                
                {/* Title (Visible when expanded) */}
                {isExpanded && <strong style={{flex: 1}}>System Log</strong>}

                {/* Expand/Collapse Icon */}
                <span style={{marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                    {isExpanded ? '▼' : '▲'}
                </span>
            </div>

            {/* Expanded Content: Log List */}
            {isExpanded && (
                <div style={{
                    padding: '10px',
                    overflowY: 'auto',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    fontFamily: 'monospace'
                }}>
                    {logs.map((log, index) => (
                        <div key={index} style={{
                            display: 'flex', 
                            gap: '8px', 
                            alignItems: 'flex-start',
                            color: getTypeColor(log.type),
                            fontSize: '0.8rem',
                            paddingBottom: '4px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <span style={{opacity: 0.5, fontSize: '0.7rem', minWidth: '60px'}}>
                                {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                            </span>
                            <span>{log.message}</span>
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
            )}
        </div>
    );
};

export default SystemStatusPanel;
