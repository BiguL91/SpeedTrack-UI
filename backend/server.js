const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Datenbank-Einrichtung
const dbPath = path.resolve(__dirname, 'speedtest.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err.message);
  } else {
    console.log('Verbunden mit der SQLite-Datenbank.');
    createTable();
  }
});

function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      ping REAL,
      download REAL,
      upload REAL,
      packetLoss REAL,
      isp TEXT,
      serverLocation TEXT,
      serverCountry TEXT
    )
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error('Fehler beim Erstellen der Tabelle:', err.message);
    }
  });
}

// Routen
app.get('/', (req, res) => {
  res.send('SpeedTest Tracker API is running');
});

// Verlauf abrufen
app.get('/api/history', (req, res) => {
  const sql = 'SELECT * FROM results ORDER BY timestamp DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Speedtest ausführen
app.post('/api/test', (req, res) => {
  console.log('Starte Speedtest...');
  // Führe Ookla CLI-Befehl aus
  // Hinweis: --accept-license und --accept-gdpr sind oft für den ersten nicht-interaktiven Lauf erforderlich
  exec('speedtest --format=json --accept-license --accept-gdpr', (error, stdout, stderr) => {
    if (error) {
      console.error(`Ausführungsfehler: ${error}`);
      return res.status(500).json({ error: 'Speedtest konnte nicht ausgeführt werden', details: stderr });
    }

    try {
      const result = JSON.parse(stdout);
      
      // Relevante Daten extrahieren
      // Bandbreite ist in Bytes/Sekunde. Umrechnung in Mbps: (Bytes * 8) / 1.000.000
      const downloadMbps = (result.download.bandwidth * 8) / 1000000;
      const uploadMbps = (result.upload.bandwidth * 8) / 1000000;
      const pingMs = result.ping.latency;
      const packetLoss = result.packetLoss || 0;
      const isp = result.isp;
      const serverLocation = result.server.location;
      const serverCountry = result.server.country;
      const timestamp = new Date().toISOString();

      // In Datenbank speichern
      const insertSql = `
        INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [timestamp, pingMs, downloadMbps, uploadMbps, packetLoss, isp, serverLocation, serverCountry];

      db.run(insertSql, params, function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ error: 'Fehler beim Speichern der Ergebnisse' });
        }
        
        res.json({
          id: this.lastID,
          timestamp,
          ping: pingMs,
          download: downloadMbps,
          upload: uploadMbps,
          packetLoss,
          isp,
          serverLocation,
          serverCountry
        });
      });

    } catch (parseError) {
      console.error('Fehler beim Parsen der Ausgabe:', parseError);
      res.status(500).json({ error: 'Fehler beim Verarbeiten der Speedtest-Ausgabe' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
