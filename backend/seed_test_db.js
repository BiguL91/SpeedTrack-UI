const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Datenbank-Pfad (analog zu server.js)
const dbDir = path.resolve(__dirname); // Im aktuellen Verzeichnis
const dbPath = path.join(dbDir, 'speedtest.db');

console.log(`Verbinde zu Datenbank: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
        process.exit(1);
    }
    console.log('Verbunden mit der SQLite-Datenbank.');
    seedData();
});

function seedData() {
    console.log("Starte Seeding...");
    
    // Config
    const daysBack = 14; // Letzte 2 Wochen
    const testsPerDay = 5; // Tests pro Tag
    
    // Toleranzwerte für "Nicht bestanden" Simulation (angenommen: 50 Mbps ist Ziel)
    const targetDownload = 50;
    
    let completed = 0;
    const total = daysBack * testsPerDay;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const stmt = db.prepare(`
            INSERT INTO results (
                timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry, jitter, serverId, isManual, excludeFromStats
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let d = 0; d < daysBack; d++) {
            const date = new Date();
            date.setDate(date.getDate() - d);
            
            for (let t = 0; t < testsPerDay; t++) {
                // Zeit etwas variieren über den Tag
                date.setHours(8 + (t * 3), Math.floor(Math.random() * 60)); // 8, 11, 14, 17, 20 Uhr...

                const timestamp = date.toISOString();
                
                // Simuliere Erfolg/Misserfolg
                // 80% Chance auf "Gut", 20% auf "Schlecht"
                const isBad = Math.random() < 0.2;
                
                let download, upload, ping;
                
                if (isBad) {
                    download = Math.random() * 20; // 0-20 Mbps (Schlecht)
                    upload = Math.random() * 5;
                    ping = 50 + Math.random() * 100; // Hoher Ping
                } else {
                    download = 50 + Math.random() * 50; // 50-100 Mbps (Gut)
                    upload = 10 + Math.random() * 10;
                    ping = 10 + Math.random() * 20; // Guter Ping
                }

                // Ein paar manuelle Tests einstreuen
                const isManual = Math.random() < 0.1 ? 1 : 0;
                const excludeFromStats = 0;

                stmt.run([
                    timestamp,
                    ping.toFixed(2),
                    download.toFixed(2),
                    upload.toFixed(2),
                    0, // packetLoss
                    "Simulated ISP",
                    "Test City",
                    "Test Country",
                    2.5, // jitter
                    "1234", // serverId
                    isManual,
                    excludeFromStats
                ], (err) => {
                    if (err) console.error(err);
                });
                
                completed++;
            }
        }

        stmt.finalize();
        
        db.run("COMMIT", (err) => {
            if (err) {
                console.error("Fehler beim Commit:", err);
            } else {
                console.log(`Erfolgreich ${completed} Test-Datensätze eingefügt!`);
            }
            db.close();
        });
    });
}
