const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cron = require('node-cron');
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

// --- Automatischer Hintergrund-Test ---
function runScheduledTest() {
  console.log(`[${new Date().toISOString()}] Starte geplanten Speedtest...`);
  
  // Wir nutzen JSON Output für den Hintergrund-Task (zuverlässiger als Text Parsing)
  exec('speedtest --format=json --accept-license --accept-gdpr', (error, stdout, stderr) => {
    if (error) {
      console.error(`Geplanter Test fehlgeschlagen: ${error}`);
      return;
    }

    try {
      const result = JSON.parse(stdout);
      
      const downloadMbps = (result.download.bandwidth * 8) / 1000000;
      const uploadMbps = (result.upload.bandwidth * 8) / 1000000;
      const pingMs = result.ping.latency;
      const packetLoss = result.packetLoss || 0;
      const isp = result.isp;
      const serverLocation = result.server.location;
      const serverCountry = result.server.country;
      const timestamp = new Date().toISOString();

      const insertSql = `
        INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [timestamp, pingMs, downloadMbps, uploadMbps, packetLoss, isp, serverLocation, serverCountry];

      db.run(insertSql, params, (err) => {
        if (err) {
            console.error('Fehler beim Speichern des geplanten Tests:', err.message);
        } else {
            console.log(`[${timestamp}] Geplanter Test erfolgreich gespeichert: DL:${downloadMbps.toFixed(2)} UL:${uploadMbps.toFixed(2)} Ping:${pingMs.toFixed(0)}`);
        }
      });

    } catch (parseError) {
      console.error('Fehler beim Parsen des JSON Outputs:', parseError);
    }
  });
}

// Cronjob Initialisierung
const schedule = process.env.CRON_SCHEDULE || '0 * * * *';
if (cron.validate(schedule)) {
    cron.schedule(schedule, runScheduledTest);
    console.log(`Cronjob aktiviert mit Zeitplan: ${schedule}`);
} else {
    console.error(`Ungültiges Cron-Format: ${schedule}`);
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

// CSV Export Endpoint
app.get('/api/export', (req, res) => {
  const sql = 'SELECT * FROM results ORDER BY timestamp DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }

    // CSV Header
    let csvContent = 'ID,Timestamp,Ping (ms),Download (Mbps),Upload (Mbps),Packet Loss (%),ISP,Server,Server Country\n';
    
    // CSV Rows
    rows.forEach(row => {
      // Anführungszeichen escapen und Felder in Anführungszeichen setzen, falls Kommas enthalten sind
      const escape = (text) => text ? `"${text.replace(/