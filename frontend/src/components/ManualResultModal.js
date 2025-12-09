import React from 'react';

const ManualResultModal = ({
    result,
    onClose,
    onExclude
}) => {
    if (!result) return null;

    return (
        <div className="modal-overlay">
          <div className="modal-content card" style={{textAlign: 'center'}}>
            <h2>✅ Test abgeschlossen</h2>
            <p style={{marginBottom: '20px'}}>Hier sind deine Ergebnisse:</p>
            
            <div style={{display: 'flex', justifyContent: 'space-around', marginBottom: '30px'}}>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Download</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#35a2eb'}}>{result.download.toFixed(1)} <small>Mbps</small></div>
                </div>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Upload</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#ff6384'}}>{result.upload.toFixed(1)} <small>Mbps</small></div>
                </div>
                <div>
                    <div style={{fontSize: '0.9rem', color: '#666'}}>Ping</div>
                    <div style={{fontSize: '1.4rem', fontWeight: 'bold'}}>{result.ping.toFixed(0)} <small>ms</small></div>
                </div>
            </div>

            <p style={{fontSize: '1rem', fontWeight: 'bold', marginBottom: '20px'}}>
                Soll dieses Ergebnis in die Statistik aufgenommen werden?
            </p>

            <div className="modal-actions" style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
                <button 
                    className="modal-button" 
                    style={{backgroundColor: '#666'}} 
                    onClick={() => onExclude(result.id, true)}
                >
                    🚫 Nein, ignorieren
                </button>
                <button 
                    className="modal-button" 
                    style={{background: 'var(--primary-gradient)'}} 
                    onClick={onClose} // Default ist "Aufnehmen" (Status ist DB default 0)
                >
                    ✅ Ja, aufnehmen
                </button>
            </div>
          </div>
        </div>
    );
};

export default ManualResultModal;
