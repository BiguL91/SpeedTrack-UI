const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
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

// Alter Endpunkt (Fallback)
app.post('/api/test', (req, res) => {
    // ... alter code falls nötig, aber wir nutzen jetzt stream ...
    res.status(400).send("Bitte nutze /api/test/stream");
});

// NEUER Live-Streaming Endpunkt (SSE)
app.get('/api/test/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  console.log('Starte Live-Speedtest...');
  
  // Wir nutzen spawn für Streaming-Output
  const speedtest = spawn('speedtest', ['--accept-license', '--accept-gdpr', '--progress=yes']);

  let buffer = '';
  
  let finalResult = {
    ping: 0,
    download: 0,
    upload: 0,
    packetLoss: 0,
    isp: 'Unbekannt',
    serverLocation: 'Unbekannt',
    serverCountry: ''
  };

  speedtest.stdout.on('data', (data) => {
    const text = data.toString();
    buffer += text;

    // --- Live Parsing ---
    
    // Ping: "Latency: 13.00 ms" oder "Idle Latency: 24.58 ms"
    // Regex sucht nach Optional "Idle " gefolgt von "Latency:"
    const pingMatch = text.match(/(?:Idle\s+)?Latency:\s+([\d\.]+)\s+ms/i);
    if (pingMatch) {
       const val = parseFloat(pingMatch[1]);
       if (val > 0) {
          finalResult.ping = val;
          res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'ping', value: val })}\n\n`);
       }
    }

    // Download: "Download:    45.34 Mbps"
    const downloadMatch = text.match(/Download:\s+([\d\.]+)\s+Mbps/i);
    if (downloadMatch) {
       const val = parseFloat(downloadMatch[1]);
       res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'download', value: val })}\n\n`);
    }

    // Upload: "Upload:    12.00 Mbps"
    const uploadMatch = text.match(/Upload:\s+([\d\.]+)\s+Mbps/i);
    if (uploadMatch) {
       const val = parseFloat(uploadMatch[1]);
       res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'upload', value: val })}\n\n`);
    }
  });

  speedtest.stderr.on('data', (data) => {
      // Fehler im Stream ignorieren wir für den User, loggen sie aber
      console.error(`CLI Error: ${data}`);
  });

  speedtest.on('close', (code) => {
    console.log(`Speedtest beendet mit Code ${code}`);

    if (code !== 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Speedtest CLI fehlgeschlagen' })}\n\n`);
        res.end();
        return;
    }

    // --- Finales Parsing aus dem Gesamt-Buffer ---
    
    // ISP
    const ispMatch = buffer.match(/ISP:\s+(.+)/);
    if (ispMatch) finalResult.isp = ispMatch[1].trim();
    
    // Server
    const serverMatch = buffer.match(/Server:\s+(.+)/);
    if (serverMatch) finalResult.serverLocation = serverMatch[1].trim();
    
    // Packet Loss
    const packetLossMatch = buffer.match(/Packet Loss:\s+([\d\.]+)%/);
    if (packetLossMatch) finalResult.packetLoss = parseFloat(packetLossMatch[1]);

    // Finale Werte sicherstellen (das letzte gefundene im Buffer ist das Endergebnis)
    
    // Ping Fallback falls Live-Parsing 0 war
    if (finalResult.ping === 0) {
        const allPings = [...buffer.matchAll(/(?:Idle\s+)?Latency:\s+([\d\.]+)\s+ms/gi)];
        if (allPings.length > 0) finalResult.ping = parseFloat(allPings[allPings.length - 1][1]);
    }

    const allDownloads = [...buffer.matchAll(/Download:\s+([\d\.]+)\s+Mbps/g)];
    if (allDownloads.length > 0) finalResult.download = parseFloat(allDownloads[allDownloads.length - 1][1]);

    const allUploads = [...buffer.matchAll(/Upload:\s+([\d\.]+)\s+Mbps/g)];
    if (allUploads.length > 0) finalResult.upload = parseFloat(allUploads[allUploads.length - 1][1]);
    
    // DB Speichern
    const timestamp = new Date().toISOString();
    const insertSql = `
        INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        timestamp, 
        finalResult.ping || 0, 
        finalResult.download || 0, 
        finalResult.upload || 0, 
        finalResult.packetLoss || 0, 
        finalResult.isp, 
        finalResult.serverLocation, 
        'Unbekannt'
    ];
    
    db.run(insertSql, params, function(err) {
        if (err) {
          console.error(err.message);
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'DB Speicherfehler' })}\n\n`);
        } else {
          // Erfolg! Sende das finale Objekt an Frontend
          res.write(`data: ${JSON.stringify({ type: 'done', result: { ...finalResult, timestamp, id: this.lastID } })}\n\n`);
        }
        res.end();
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
