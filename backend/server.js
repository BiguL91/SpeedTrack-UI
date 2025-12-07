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

// Database Setup
const dbPath = path.resolve(__dirname, 'speedtest.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
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
      console.error('Error creating table:', err.message);
    }
  });
}

// Routes
app.get('/', (req, res) => {
  res.send('SpeedTest Tracker API is running');
});

// Get History
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

// Run Speedtest
app.post('/api/test', (req, res) => {
  console.log('Starting speedtest...');
  // Execute Ookla CLI command
  // Note: --accept-license and --accept-gdpr are often needed for first runs non-interactively
  exec('speedtest --format=json --accept-license --accept-gdpr', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: 'Failed to run speedtest', details: stderr });
    }

    try {
      const result = JSON.parse(stdout);
      
      // Extract relevant data
      // Bandwidth is in bytes/sec. Convert to Mbps: (bytes * 8) / 1,000,000
      const downloadMbps = (result.download.bandwidth * 8) / 1000000;
      const uploadMbps = (result.upload.bandwidth * 8) / 1000000;
      const pingMs = result.ping.latency;
      const packetLoss = result.packetLoss || 0;
      const isp = result.isp;
      const serverLocation = result.server.location;
      const serverCountry = result.server.country;
      const timestamp = new Date().toISOString();

      // Save to DB
      const insertSql = `
        INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [timestamp, pingMs, downloadMbps, uploadMbps, packetLoss, isp, serverLocation, serverCountry];

      db.run(insertSql, params, function(err) {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ error: 'Failed to save results' });
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
      console.error('Error parsing output:', parseError);
      res.status(500).json({ error: 'Failed to parse speedtest output' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});