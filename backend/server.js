const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Globale Variable zur Vermeidung gleichzeitiger Tests
let isTestRunning = false;

// Datenbank-Einrichtung
// Prüfe ob /app/data existiert (Docker Volume), sonst lokales Verzeichnis nutzen
const dbDir = '/app/data';
const dbPath = fs.existsSync(dbDir) 
  ? path.join(dbDir, 'speedtest.db') 
  : path.resolve(__dirname, 'speedtest.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Öffnen der Datenbank:', err.message);
  } else {
    console.log('Verbunden mit der SQLite-Datenbank.');
    createTable();
    createSettingsTable();
  }
});

function createSettingsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error('Fehler beim Erstellen der Settings-Tabelle:', err.message);
    } else {
      // Standardwert setzen, falls nicht vorhanden
      const checkSql = "SELECT value FROM settings WHERE key = 'cron_schedule'";
      db.get(checkSql, [], (err, row) => {
        if (!row) {
          const defaultSchedule = process.env.CRON_SCHEDULE || '0 * * * *'; // Default: Jede Stunde
          db.run("INSERT INTO settings (key, value) VALUES ('cron_schedule', ?)", [defaultSchedule]);
        }
      });
    }
  });
}

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
  if (isTestRunning) {
    console.log(`[${new Date().toISOString()}] Geplanter Test übersprungen: Ein anderer Test läuft bereits.`);
    return;
  }

  isTestRunning = true;
  console.log(`[${new Date().toISOString()}] Starte geplanten Speedtest...`);
  
  exec('speedtest --format=json --accept-license --accept-gdpr', (error, stdout, stderr) => {
    // Flag immer zurücksetzen, egal was passiert
    isTestRunning = false;

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
            console.log(`[${timestamp}] Geplanter Test erfolgreich gespeichert.`);
        }
      });

    } catch (parseError) {
      console.error('Fehler beim Parsen des JSON Outputs:', parseError);
    }
  });
}

// Cronjob Logik
let scheduledTask = null;

function startCronJob(schedule) {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('Alter Cronjob gestoppt.');
  }

  if (cron.validate(schedule)) {
    scheduledTask = cron.schedule(schedule, runScheduledTest);
    console.log(`Neuer Cronjob gestartet mit Zeitplan: ${schedule}`);
  } else {
    console.error(`Ungültiges Cron-Format: ${schedule}`);
  }
}

// Initialer Start des Cronjobs aus der DB
setTimeout(() => {
    db.get("SELECT value FROM settings WHERE key = 'cron_schedule'", [], (err, row) => {
        if (row && row.value) {
            startCronJob(row.value);
        } else {
            // Fallback
            startCronJob('0 * * * *');
        }
    });
}, 1000); // Kurz warten bis DB bereit ist


// API Routen
app.get('/api/settings', (req, res) => {
    db.get("SELECT value FROM settings WHERE key = 'cron_schedule'", [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ cron_schedule: row ? row.value : '0 * * * *' });
    });
});

app.post('/api/settings', (req, res) => {
    const { cron_schedule } = req.body;
    
    if (!cron.validate(cron_schedule)) {
        return res.status(400).json({ error: "Ungültiges Cron-Format" });
    }

    const sql = "INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_schedule', ?)";
    db.run(sql, [cron_schedule], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Cronjob zur Laufzeit aktualisieren!
        startCronJob(cron_schedule);
        
        res.json({ message: "Einstellungen gespeichert", cron_schedule });
    });
});

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

    let csvContent = 'ID,Timestamp,Ping (ms),Download (Mbps),Upload (Mbps),Packet Loss (%),ISP,Server,Server Country\n';
    
    rows.forEach(row => {
      const escape = (text) => text ? "" + text.toString().split("\"").join("\"\"") + "" : "";
      
      csvContent += [
        row.id,
        row.timestamp,
        row.ping,
        row.download,
        row.upload,
        row.packetLoss,
        escape(row.isp),
        escape(row.serverLocation),
        escape(row.serverCountry)
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="speedtest_history.csv"');
    res.send(csvContent);
  });
});

app.post('/api/test', (req, res) => {
    res.status(400).send("Bitte nutze /api/test/stream");
});

// Live-Streaming Endpunkt (SSE)
app.get('/api/test/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (isTestRunning) {
      console.log('Manueller Start blockiert: Test läuft bereits.');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Ein Test läuft bereits im Hintergrund. Bitte warten.' })}\n\n`);
      res.end();
      return;
  }

  isTestRunning = true;
  console.log('Starte Live-Speedtest (Manuell)...');
  
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

    const pingMatch = text.match(/(?:Idle\s+)?Latency:\s+([\d\.]+)\s+ms/i);
    if (pingMatch) {
       const val = parseFloat(pingMatch[1]);
       if (val > 0) {
          finalResult.ping = val;
          res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'ping', value: val })}\n\n`);
       }
    }

    const downloadMatch = text.match(/Download:\s+([\d\.]+)\s+Mbps/i);
    if (downloadMatch) {
       const val = parseFloat(downloadMatch[1]);
       res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'download', value: val })}\n\n`);
    }

    const uploadMatch = text.match(/Upload:\s+([\d\.]+)\s+Mbps/i);
    if (uploadMatch) {
       const val = parseFloat(uploadMatch[1]);
       res.write(`data: ${JSON.stringify({ type: 'progress', phase: 'upload', value: val })}\n\n`);
    }
  });

  speedtest.stderr.on('data', (data) => {
      console.error(`CLI Error: ${data}`);
  });

  speedtest.on('close', (code) => {
    isTestRunning = false; // Lock freigeben
    console.log(`Manueller Speedtest beendet mit Code ${code}`);

    if (code !== 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Speedtest CLI fehlgeschlagen' })}\n\n`);
        res.end();
        return;
    }

    const ispMatch = buffer.match(/ISP:\s+(.+)/);
    if (ispMatch) finalResult.isp = ispMatch[1].trim();
    
    const serverMatch = buffer.match(/Server:\s+(.+)/);
    if (serverMatch) finalResult.serverLocation = serverMatch[1].trim();
    
    const packetLossMatch = buffer.match(/Packet Loss:\s+([\d\.]+)%/);
    if (packetLossMatch) finalResult.packetLoss = parseFloat(packetLossMatch[1]);

    if (finalResult.ping === 0) {
        const allPings = [...buffer.matchAll(/(?:Idle\s+)?Latency:\s+([\d\.]+)\s+ms/gi)];
        if (allPings.length > 0) finalResult.ping = parseFloat(allPings[allPings.length - 1][1]);
    }

    const allDownloads = [...buffer.matchAll(/Download:\s+([\d\.]+)\s+Mbps/g)];
    if (allDownloads.length > 0) finalResult.download = parseFloat(allDownloads[allDownloads.length - 1][1]);

    const allUploads = [...buffer.matchAll(/Upload:\s+([\d\.]+)\s+Mbps/g)];
    if (allUploads.length > 0) finalResult.upload = parseFloat(allUploads[allUploads.length - 1][1]);
    
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
          res.write(`data: ${JSON.stringify({ type: 'done', result: { ...finalResult, timestamp, id: this.lastID } })}\n\n`);
        }
        res.end();
    });
  });
});

// --- PRODUCTION SETUP ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Backend läuft. Frontend läuft im Entwicklungsmodus auf Port 3000.');
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
