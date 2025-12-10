const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const multer = require('multer');
const { parse } = require('csv-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Upload Konfiguration
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Globale Variable zur Vermeidung gleichzeitiger Tests
let isTestRunning = false;

// --- STATUS BROADCAST SYSTEM (SSE) ---
let statusClients = [];

function broadcastStatus(message, type = 'info', extra = null) {
    // Console log für Server-Log
    console.log(`[Status] ${message}`);
    
    // An verbundene Clients senden
    const payload = JSON.stringify({ 
        message, 
        type, 
        timestamp: new Date().toISOString(),
        ...extra 
    });
    
    statusClients.forEach(client => {
        client.res.write(`data: ${payload}\n\n`);
    });
}

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
    console.log('Verbunden mit der SQLite-Datenbank bei:', dbPath);
    
    // Initialisierung strikt nacheinander ausführen
    db.serialize(() => {
        createTable();
        db.run("CREATE INDEX IF NOT EXISTS idx_timestamp ON results (timestamp)");
        upgradeDatabase(); // Neue Spalten hinzufügen falls nötig
        createSettingsTable();
    });
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
      // Standardwert für retention_period setzen, falls nicht vorhanden (0 = nie löschen)
      const settingsDefaults = [
          { key: 'retention_period', value: '0' },
          { key: 'expected_download', value: '0' }, // 0 = deaktiviert
          { key: 'expected_upload', value: '0' },   // 0 = deaktiviert
          { key: 'tolerance', value: '10' },        // 10%
          { key: 'retry_count', value: '3' },       // 3 Wiederholungen
          { key: 'retry_delay', value: '30' },      // 30 Sekunden Pause
          { key: 'retry_strategy', value: 'AVG' },  // DURCHSCHNITT, MIN, MAX
          { key: 'retry_server_strategy', value: 'NEW' } // BEHALTEN, NEU
      ];

      settingsDefaults.forEach(setting => {
          const checkSql = "SELECT value FROM settings WHERE key = ?";
          db.get(checkSql, [setting.key], (err, row) => {
              if (!row) {
                  db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [setting.key, setting.value]);
              }
          });
      });
    }
  });
}

function upgradeDatabase() {
    const columnsToAdd = [
        { name: 'jitter', type: 'REAL' },
        { name: 'serverId', type: 'TEXT' },
        { name: 'serverHost', type: 'TEXT' },
        { name: 'serverPort', type: 'INTEGER' },
        { name: 'serverIp', type: 'TEXT' },
        { name: 'downloadElapsed', type: 'INTEGER' },
        { name: 'uploadElapsed', type: 'INTEGER' },
        { name: 'isVpn', type: 'INTEGER' }, // 0 = false, 1 = true
        { name: 'externalIp', type: 'TEXT' },
        { name: 'resultUrl', type: 'TEXT' },
        { name: 'downloadBytes', type: 'INTEGER' },
        { name: 'uploadBytes', type: 'INTEGER' },
        { name: 'isManual', type: 'INTEGER' }, // 0 = Auto, 1 = Manuell
        { name: 'groupId', type: 'TEXT' },     // UUID für zusammengehörige Tests
        { name: 'isAggregate', type: 'INTEGER' }, // 1 = Berechneter Durchschnittswert
        { name: 'excludeFromStats', type: 'INTEGER' } // 0 = Zählt, 1 = Ignoriert
    ];

    columnsToAdd.forEach(col => {
        const sql = `ALTER TABLE results ADD COLUMN ${col.name} ${col.type}`;
        db.run(sql, (err) => {
            // Fehler ignorieren, wenn Spalte schon existiert (SQLite hat kein "ADD COLUMN IF NOT EXISTS")
            if (err && !err.message.includes('duplicate column name')) {
                console.error(`Fehler beim Hinzufügen von ${col.name}:`, err.message);
            }
        });
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

// --- Datenbank-Bereinigung ---
function cleanupDatabase() {
    db.get("SELECT value FROM settings WHERE key = 'retention_period'", [], (err, row) => {
        if (err) {
            console.error('Fehler beim Abrufen der Aufbewahrungsdauer:', err.message);
            return;
        }

        const retentionDays = parseInt(row ? row.value : '0');

        if (retentionDays > 0) {
            const deleteSql = `DELETE FROM results WHERE timestamp < date('now', '-${retentionDays} days')`;
            db.run(deleteSql, function(deleteErr) {
                if (deleteErr) {
                    console.error('Fehler bei der Datenbankbereinigung:', deleteErr.message);
                } else {
                    console.log(`[${new Date().toISOString()}] Datenbankbereinigung: ${this.changes} Einträge älter als ${retentionDays} Tage gelöscht.`);
                }
            });
        } else {
            console.log(`[${new Date().toISOString()}] Datenbankbereinigung: Keine Einträge gelöscht (Aufbewahrungsdauer ist 0).`);
        }
    });
}

// Täglich um 00:00 Uhr die Datenbank bereinigen
cron.schedule('0 0 * * *', () => {
    console.log(`[${new Date().toISOString()}] Starte geplante Datenbankbereinigung.`);
    cleanupDatabase();
});

// --- Helper Funktionen für Test-Logik ---



const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));



const runSpeedtestPromise = (serverId = null) => {
    return new Promise((resolve, reject) => {
        let cmd = 'speedtest --format=json --accept-license --accept-gdpr';
        if (serverId) {
            cmd += ` -s ${serverId}`;
        }

        // Timeout 240s (4 Minuten)
        exec(cmd, { timeout: 240000 }, (error, stdout, stderr) => {
            if (error) {
                // Prüfen ob es ein Timeout war
                if (error.killed) {
                    return reject(new Error('Speedtest Zeitüberschreitung (240s)'));
                }
                return reject(error);
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
};



const saveResultPromise = (result, options = {}) => {

    return new Promise((resolve, reject) => {

        const downloadMbps = (result.download.bandwidth * 8) / 1000000;

        const uploadMbps = (result.upload.bandwidth * 8) / 1000000;

        const pingMs = result.ping.latency;

        const jitter = result.ping.jitter || 0;

        const packetLoss = result.packetLoss || 0;

        const isp = result.isp;

        const serverLocation = `${result.server.name} - ${result.server.location}`;

        const serverCountry = result.server.country;

        const serverId = result.server.id;

        const serverHost = result.server.host;

        const serverPort = result.server.port;

        const serverIp = result.server.ip;

        

        const downloadElapsed = result.download.elapsed;

        const uploadElapsed = result.upload.elapsed;

        const isVpn = result.interface.isVpn ? 1 : 0;

        const externalIp = result.interface.externalIp || null;

        const resultUrl = result.result.url || null;

        

        const downloadBytes = result.download.bytes || 0;

        const uploadBytes = result.upload.bytes || 0;

        

        const isManual = 0; // Automatisch

        const timestamp = options.timestamp || new Date().toISOString();

        const groupId = options.groupId || null;

        const isAggregate = options.isAggregate ? 1 : 0;



        // Überschreibe Werte falls es ein Aggregat ist (berechnete Werte)

        const finalDownload = options.overrideDownload !== undefined ? options.overrideDownload : downloadMbps;

        const finalUpload = options.overrideUpload !== undefined ? options.overrideUpload : uploadMbps;

        const finalPing = options.overridePing !== undefined ? options.overridePing : pingMs;



        const insertSql = `

            INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry, jitter, serverId, serverHost, serverPort, serverIp, downloadElapsed, uploadElapsed, isVpn, externalIp, resultUrl, downloadBytes, uploadBytes, isManual, groupId, isAggregate)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        `;

        

        const params = [

            timestamp, finalPing, finalDownload, finalUpload, packetLoss, isp, serverLocation, serverCountry, jitter, serverId, serverHost, serverPort, serverIp, downloadElapsed, uploadElapsed, isVpn, externalIp, resultUrl, downloadBytes, uploadBytes, isManual, groupId, isAggregate

        ];



        db.run(insertSql, params, function(err) {

            if (err) reject(err);

            else resolve(this.lastID);

        });

    });

};



// Hilfsfunktion: Besten Server finden (unter Berücksichtigung der Blacklist)
const findBestServer = async (blacklist = []) => {
    return new Promise((resolve, reject) => {
        exec('speedtest -L --format=json --accept-license --accept-gdpr', (err, stdout) => {
             if (err) return reject(err);
             try { 
                 const list = JSON.parse(stdout);
                 if (list && list.servers) {
                     const available = list.servers.filter(s => !blacklist.includes(String(s.id)));
                     resolve(available.length > 0 ? available[0] : null);
                 } else { resolve(null); }
             } catch(e) { reject(e); }
        });
    });
};

// --- Automatischer Hintergrund-Test (Erweitert) ---

async function runScheduledTest() {

  if (isTestRunning) {
    console.log(`[${new Date().toISOString()}] Geplanter Test übersprungen: Ein anderer Test läuft bereits.`);
    // Kein Broadcast hier, um Spam zu vermeiden, oder nur als 'warning'
    return;
  }

  isTestRunning = true;
  broadcastStatus("Starte geplanten automatischen Speedtest...", "start");

  try {
      // 1. Settings laden
      const settings = await new Promise((resolve, reject) => {
          db.all("SELECT * FROM settings", [], (err, rows) => {
              if (err) reject(err);
              else {
                  const s = {};
                  rows.forEach(row => s[row.key] = row.value);
                  resolve(s);
              }
          });
      });

      const expDown = parseFloat(settings.expected_download || 0);
      const expUp = parseFloat(settings.expected_upload || 0);
      const tolerance = parseFloat(settings.tolerance || 10);
      const retryCount = parseInt(settings.retry_count || 3);
      const retryDelay = parseInt(settings.retry_delay || 30);
      const retryStrategy = settings.retry_strategy || 'AVG';
      const retryServerStrategy = settings.retry_server_strategy || 'KEEP';
      const serverBlacklistStr = settings.server_blacklist || '';
      
      const globalBlacklist = serverBlacklistStr.split(',').map(s => s.trim()).filter(s => s);
      let currentBlacklist = [...globalBlacklist];

      // Initialen Server bestimmen (wenn Blacklist aktiv)
      let currentServerId = null;
      if (globalBlacklist.length > 0) {
          broadcastStatus("Prüfe Server-Verfügbarkeit (Blacklist aktiv)...", "info");
          try {
              const bestServer = await findBestServer(currentBlacklist);
              if (bestServer) {
                  currentServerId = bestServer.id;
                  broadcastStatus(`Server gewählt: ${bestServer.name} (${bestServer.id})`, "info");
              } else {
                  console.warn("[Scheduled] Keine Server verfügbar (alle geblacklistet?). Nutze Auto-Select.");
              }
          } catch (e) {
              console.error("Fehler bei Server-Wahl:", e);
          }
      }

      // 2. Ersten Test ausführen
      let attempt1;
      try {
          broadcastStatus("Führe initialen Test aus...", "running");
          attempt1 = await runSpeedtestPromise(currentServerId);
      } catch (e) {
          console.error("Erster Test fehlgeschlagen:", e);
          broadcastStatus(`Test Fehler: ${e.message}`, "error");
          isTestRunning = false;
          return;
      }

      // FIX: Wenn wir keinen Server erzwungen haben (currentServerId war null), und 'KEEP' aktiv ist,
      // müssen wir jetzt den Server fixieren, den Ookla gewählt hat, damit 'KEEP' funktioniert.
      if (retryServerStrategy === 'KEEP' && !currentServerId && attempt1.server && attempt1.server.id) {
          currentServerId = attempt1.server.id;
      }

      const downMbps = (attempt1.download.bandwidth * 8) / 1000000;
      const upMbps = (attempt1.upload.bandwidth * 8) / 1000000;
      
      broadcastStatus(`Ergebnis: ↓ ${downMbps.toFixed(2)} Mbps | ↑ ${upMbps.toFixed(2)} Mbps`, "info");

      // 3. Prüfen ob Retry nötig
      let needsRetry = false;
      if (expDown > 0 && downMbps < (expDown * (1 - tolerance / 100))) needsRetry = true;
      if (expUp > 0 && upMbps < (expUp * (1 - tolerance / 100))) needsRetry = true;

      if (!needsRetry) {
          // Alles OK -> Normal speichern
          await saveResultPromise(attempt1);
          broadcastStatus("Test erfolgreich abgeschlossen. Werte OK.", "success", { action: 'refresh_history' });
      } else {
          // RETRY LOGIK
          broadcastStatus(`Werte unter Toleranz. Starte ${retryCount} Wiederholungen...`, "warning");
          
          const groupId = require('crypto').randomUUID(); 
          await saveResultPromise(attempt1, { groupId });

          const allResults = [attempt1];

          for (let i = 0; i < retryCount; i++) {
              broadcastStatus(`Warte ${retryDelay}s vor Wiederholung ${i+1}/${retryCount}...`, "waiting");
              await sleep(retryDelay * 1000);
              
              // Server-Strategie: Wenn 'NEW', suche neuen Server
              if (retryServerStrategy === 'NEW') {
                  // Füge bisherige Server zur temporären Blacklist hinzu
                  if (attempt1.server && attempt1.server.id) {
                      if (!currentBlacklist.includes(String(attempt1.server.id))) currentBlacklist.push(String(attempt1.server.id));
                  }
                  // Auch die aus den bisherigen Retries
                  allResults.forEach(r => {
                      if (r.server && r.server.id && !currentBlacklist.includes(String(r.server.id))) {
                          currentBlacklist.push(String(r.server.id));
                      }
                  });

                  try {
                      broadcastStatus("Suche alternativen Server...", "info");
                      const nextServer = await findBestServer(currentBlacklist);
                      if (nextServer) {
                          currentServerId = nextServer.id;
                          broadcastStatus(`Server gewechselt: ${nextServer.name} (${currentServerId})`, "info");
                      } else {
                          console.warn("Kein neuer Server gefunden, nutze alten weiter.");
                      }
                  } catch (e) {
                      console.error("Fehler bei Server-Wechsel:", e);
                  }
              }

              try {
                  broadcastStatus(`Starte Wiederholung ${i+1}...`, "running");
                  const retryResult = await runSpeedtestPromise(currentServerId);
                  await saveResultPromise(retryResult, { groupId });
                  allResults.push(retryResult);
                  
                  const rDown = (retryResult.download.bandwidth * 8) / 1000000;
                  broadcastStatus(`Wiederholung ${i+1}: ↓ ${rDown.toFixed(2)} Mbps`, "info");
                  
              } catch (e) {
                  console.error(`Retry ${i+1} fehlgeschlagen:`, e);
                  broadcastStatus(`Wiederholung ${i+1} Fehler: ${e.message}`, "error");
              }
          }

          // Aggregat berechnen
          const downloads = allResults.map(r => (r.download.bandwidth * 8) / 1000000);
          const uploads = allResults.map(r => (r.upload.bandwidth * 8) / 1000000);
          const pings = allResults.map(r => r.ping.latency);

          let finalDown, finalUp, finalPing;

          if (retryStrategy === 'MIN') {
              finalDown = Math.min(...downloads);
              finalUp = Math.min(...uploads);
              finalPing = Math.min(...pings);
          } else if (retryStrategy === 'MAX') {
              finalDown = Math.max(...downloads);
              finalUp = Math.max(...uploads);
              finalPing = Math.max(...pings);
          } else {
              // AVG
              finalDown = downloads.reduce((a,b)=>a+b,0) / downloads.length;
              finalUp = uploads.reduce((a,b)=>a+b,0) / uploads.length;
              finalPing = pings.reduce((a,b)=>a+b,0) / pings.length;
          }

          // Aggregat speichern
          
          // Prüfen, ob verschiedene Server genutzt wurden
          const uniqueServerIds = [...new Set(allResults.map(r => r.server && r.server.id).filter(id => id))];
          let aggregateResultObj = attempt1;

          if (uniqueServerIds.length > 1) {
              // Kopie erstellen, um Metadaten anzupassen
              aggregateResultObj = JSON.parse(JSON.stringify(attempt1)); // Deep clone sicherheitshalber
              if (aggregateResultObj.server) {
                  aggregateResultObj.server.name = "Diverse Server";
                  aggregateResultObj.server.location = `(Genutzte Server: ${uniqueServerIds.length})`;
                  aggregateResultObj.server.country = "Diverse";
                  aggregateResultObj.server.id = null; // Keine spezifische ID
                  aggregateResultObj.server.host = null;
                  aggregateResultObj.server.ip = null;
                  aggregateResultObj.server.port = null;
              }
              
              // Weitere Felder für Aggregat unkenntlich machen oder leeren
              if (aggregateResultObj.download) {
                  aggregateResultObj.download.elapsed = null;
                  aggregateResultObj.download.bytes = 0;
              }
              if (aggregateResultObj.upload) {
                  aggregateResultObj.upload.elapsed = null;
                  aggregateResultObj.upload.bytes = 0;
              }
              if (aggregateResultObj.result) {
                  aggregateResultObj.result.url = null;
              }
              if (aggregateResultObj.interface) {
                  aggregateResultObj.interface.externalIp = null; 
              }
          }

          await saveResultPromise(aggregateResultObj, { 
              groupId, 
              isAggregate: true,
              overrideDownload: finalDown,
              overrideUpload: finalUp,
              overridePing: finalPing,
              timestamp: new Date().toISOString()
          });
          
          broadcastStatus(`Testserie beendet. Aggregat (${retryStrategy}) gespeichert.`, "success", { action: 'refresh_history' });
      }

  } catch (err) {
      console.error("Fehler im Scheduled Test Ablauf:", err);
      broadcastStatus(`Systemfehler: ${err.message}`, "error");
  } finally {
      isTestRunning = false;
  }
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
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const settings = {
            cron_schedule: '0 * * * *',
            retention_period: '0',
            expected_download: '0',
            expected_upload: '0',
            tolerance: '10',
            retry_count: '3',
            retry_delay: '30',
            retry_strategy: 'AVG',
            retry_server_strategy: 'NEW',
            server_blacklist: ''
        };

        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.json(settings);
    });
});

app.post('/api/settings', (req, res) => {
    const { 
        cron_schedule, retention_period, 
        expected_download, expected_upload, tolerance, retry_count, retry_delay, retry_strategy,
        server_blacklist, retry_server_strategy
    } = req.body;
    
    let updates = [];
    let params = [];

    // Helfer
    const addUpdate = (key, value) => {
        if (value !== undefined) {
            updates.push("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            params.push(key);
            params.push(String(value));
        }
    };

    // Validierung & Sammlung
    if (cron_schedule !== undefined) {
        if (!cron.validate(cron_schedule)) return res.status(400).json({ error: "Ungültiges Cron-Format" });
        addUpdate('cron_schedule', cron_schedule);
    }
    
    if (retention_period !== undefined) {
        if (isNaN(parseInt(retention_period)) || parseInt(retention_period) < 0) return res.status(400).json({ error: "Ungültige Aufbewahrungsdauer" });
        addUpdate('retention_period', retention_period);
    }

    if (expected_download !== undefined) addUpdate('expected_download', expected_download);
    if (expected_upload !== undefined) addUpdate('expected_upload', expected_upload);
    if (tolerance !== undefined) addUpdate('tolerance', tolerance);
    
    if (retry_count !== undefined) {
        const count = parseInt(retry_count);
        if (count < 1 || count > 5) return res.status(400).json({ error: "Wiederholungen müssen zwischen 1 und 5 liegen." });
        addUpdate('retry_count', retry_count);
    }

    if (retry_delay !== undefined) {
        const delay = parseInt(retry_delay);
        if (delay < 5 || delay > 60) return res.status(400).json({ error: "Pause muss zwischen 5 und 60 Sekunden liegen." });
        addUpdate('retry_delay', retry_delay);
    }

    if (retry_strategy !== undefined) addUpdate('retry_strategy', retry_strategy);
    if (retry_server_strategy !== undefined) addUpdate('retry_server_strategy', retry_server_strategy);
    if (server_blacklist !== undefined) addUpdate('server_blacklist', server_blacklist);

    if (updates.length === 0) {
        return res.status(400).json({ error: "Keine Einstellungen zum Speichern bereitgestellt." });
    }

    // Transaktion für atomare Updates
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        
        const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        
        // Da stmt.run asynchron ist innerhalb serialize, müssen wir aufpassen.
        // Besser: Loop mit Callbacks oder Promise-Chain. Da SQLite in Node async ist, ist serialize hier nur für die Order.
        // Einfacher: Wir führen die Statements nacheinander aus.
        
        let errorOccurred = false;
        
        // Wir bauen ein rekursives Update oder nutzen Promise.all wenn wir einen Wrapper hätten.
        // Hier einfache Lösung:
        
        updates.forEach((sql, index) => {
             // sql ist hier immer gleich, wir nutzen stmt
             // params ist flach [k1, v1, k2, v2]
             const k = params[index * 2];
             const v = params[index * 2 + 1];
             stmt.run([k, v], (err) => {
                 if (err) errorOccurred = true;
             });
        });

        stmt.finalize(() => {
            if (errorOccurred) {
                db.run("ROLLBACK;");
                res.status(500).json({ error: "DB Fehler beim Speichern" });
            } else {
                db.run("COMMIT;", (commitErr) => {
                    if (commitErr) {
                        res.status(500).json({ error: commitErr.message });
                    } else {
                        // Nebeneffekte
                        if (cron_schedule !== undefined) startCronJob(cron_schedule);
                        if (retention_period !== undefined && parseInt(retention_period) > 0) cleanupDatabase();

                        res.json({ message: "Einstellungen gespeichert" });
                    }
                });
            }
        });
    });
});

app.get('/api/history', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : null;

  let sql = 'SELECT * FROM results ORDER BY timestamp DESC';
  let params = [];

  if (limit) {
      // Achtung: Wenn wir im Frontend filtern wollen, ist LIMIT hier gefährlich,
      // weil wir evtl. die Aggregate laden, aber die zugehörigen Details durch das Limit abgeschnitten werden.
      // Für Dashboard (Limit 50) ist das Risiko gering, aber vorhanden.
      // Besser: Wir laden für Dashboard etwas mehr oder filtern im SQL intelligenter.
      // Aber für "Option A" (Client Side) laden wir einfach alles oder nehmen das Risiko in Kauf.
      // Wir lassen das Limit erst mal drin.
      sql += ' LIMIT ?';
      params.push(limit);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Endpoint um einen Test aus der Statistik auszuschließen (oder wieder aufzunehmen)
app.patch('/api/results/:id/exclude', (req, res) => {
    const { id } = req.params;
    const { exclude } = req.body; // true = ausschließen, false = aufnehmen

    const val = exclude ? 1 : 0;
    
    const sql = "UPDATE results SET excludeFromStats = ? WHERE id = ?";
    db.run(sql, [val, id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Status aktualisiert", changes: this.changes });
    });
});

// Endpoint zum Leeren der Datenbank
app.post('/api/reset-db', (req, res) => {
    const deleteSql = "DELETE FROM results";
    const resetSeqSql = "DELETE FROM sqlite_sequence WHERE name='results'";

    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        db.run(deleteSql, (err) => {
            if (err) {
                db.run("ROLLBACK;");
                res.status(500).json({ error: err.message });
                return;
            }
        });
        db.run(resetSeqSql, (err) => {
            if (err) {
                db.run("ROLLBACK;");
                res.status(500).json({ error: err.message });
                return;
            }
        });
        db.run("COMMIT;", (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: "Datenbank erfolgreich geleert." });
            }
        });
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

    let csvContent = 'ID,Timestamp,Ping (ms),Download (Mbps),Upload (Mbps),Packet Loss (%),ISP,Server,Server Country,Server ID,Group ID,Is Aggregate,Is Manual,Exclude From Stats,Jitter (ms),Server Host,Server Port,Server IP,Download Elapsed (ms),Upload Elapsed (ms),Is VPN,External IP,Result URL,Download Bytes,Upload Bytes\n';
    
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
        escape(row.serverCountry),
        row.serverId || '',
        escape(row.groupId || ''),
        row.isAggregate || 0,
        row.isManual || 0,
        row.excludeFromStats || 0,
        row.jitter || 0,
        escape(row.serverHost),
        row.serverPort || '',
        escape(row.serverIp),
        row.downloadElapsed || '',
        row.uploadElapsed || '',
        row.isVpn || 0,
        escape(row.externalIp),
        escape(row.resultUrl),
        row.downloadBytes || 0,
        row.uploadBytes || 0
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="speedtest_history.csv"');
    res.send(csvContent);
  });
});

// CSV Import Endpoint
app.post('/api/import', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen." });
    }

    const results = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', (data) => results.push(data))
        .on('error', (err) => {
            console.error("CSV Parse Fehler:", err);
            res.status(500).json({ error: "Fehler beim Lesen der CSV Datei." });
            fs.unlinkSync(filePath); // Cleanup
        })
        .on('end', () => {
            // DB Import in Transaktion
            db.serialize(() => {
                db.run("BEGIN TRANSACTION;");
                
                const stmt = db.prepare(`
                    INSERT OR REPLACE INTO results (
                        id, timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry, serverId, groupId, isAggregate, isManual, excludeFromStats,
                        jitter, serverHost, serverPort, serverIp, downloadElapsed, uploadElapsed, isVpn, externalIp, resultUrl, downloadBytes, uploadBytes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                let errorOccurred = false;

                results.forEach(row => {
                    if (errorOccurred) return;

                    // Mapping CSV Header -> DB Columns
                    const id = row['ID'];
                    const timestamp = row['Timestamp'];
                    const ping = parseFloat(row['Ping (ms)']) || 0;
                    const download = parseFloat(row['Download (Mbps)']) || 0;
                    const upload = parseFloat(row['Upload (Mbps)']) || 0;
                    const packetLoss = parseFloat(row['Packet Loss (%)']) || 0;
                    const isp = row['ISP'];
                    const server = row['Server'];
                    const country = row['Server Country'];
                    const serverId = row['Server ID'] || null;
                    const groupId = row['Group ID'] || null;
                    const isAggregate = parseInt(row['Is Aggregate']) || 0;
                    const isManual = parseInt(row['Is Manual']) || 0;
                    const excludeFromStats = parseInt(row['Exclude From Stats']) || 0;
                    
                    const jitter = parseFloat(row['Jitter (ms)']) || 0;
                    const serverHost = row['Server Host'] || null;
                    const serverPort = parseInt(row['Server Port']) || null;
                    const serverIp = row['Server IP'] || null;
                    const downloadElapsed = parseInt(row['Download Elapsed (ms)']) || null;
                    const uploadElapsed = parseInt(row['Upload Elapsed (ms)']) || null;
                    const isVpn = parseInt(row['Is VPN']) || 0;
                    const externalIp = row['External IP'] || null;
                    const resultUrl = row['Result URL'] || null;
                    const downloadBytes = parseInt(row['Download Bytes']) || 0;
                    const uploadBytes = parseInt(row['Upload Bytes']) || 0;

                    if (id && timestamp) {
                        stmt.run([
                            id, timestamp, ping, download, upload, packetLoss, isp, server, country, serverId, groupId, isAggregate, isManual, excludeFromStats,
                            jitter, serverHost, serverPort, serverIp, downloadElapsed, uploadElapsed, isVpn, externalIp, resultUrl, downloadBytes, uploadBytes
                        ], (err) => {
                            if (err) {
                                console.error("Import Insert Error:", err);
                                errorOccurred = true;
                            }
                        });
                    }
                });

                stmt.finalize();

                if (errorOccurred) {
                    db.run("ROLLBACK;");
                    res.status(500).json({ error: "Fehler beim Importieren der Daten in die Datenbank." });
                } else {
                    db.run("COMMIT;", (err) => {
                        if (err) {
                            res.status(500).json({ error: "Fehler beim Commit der Transaktion." });
                        } else {
                            res.json({ message: `${results.length} Einträge erfolgreich importiert.` });
                        }
                    });
                }
                
                // Aufräumen
                fs.unlinkSync(filePath);
            });
        });
});

// STATUS STREAM ENDPUNKT
app.get('/api/status/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const client = { id: Date.now(), res };
    statusClients.push(client);

    // Initiale Nachricht
    res.write(`data: ${JSON.stringify({ message: "Verbunden mit Status-Stream", type: "info" })}\n\n`);

    req.on('close', () => {
        statusClients = statusClients.filter(c => c.id !== client.id);
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

  // Sicherheits-Timeout (4 Minuten), falls der Prozess hängt
  const safetyTimeout = setTimeout(() => {
      if (!speedtest.killed) {
          console.error('Manueller Speedtest: Zeitüberschreitung (Safety Kill).');
          speedtest.kill();
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Zeitüberschreitung: Test wurde abgebrochen (4 Min Limit).' })}\n\n`);
          // Stream wird durch 'close' Event sauber beendet
      }
  }, 240000);

  let buffer = '';
  
  let finalResult = {
    ping: 0,
    jitter: 0,
    download: 0,
    upload: 0,
    packetLoss: 0,
    isp: 'Unbekannt',
    serverLocation: 'Unbekannt',
    serverCountry: '',
    serverId: null,
    serverHost: null,
    serverPort: null,
    serverIp: null
  };

  // Fehler beim Starten des Prozesses abfangen (z.B. Befehl nicht gefunden)
  speedtest.on('error', (err) => {
      console.error('Fehler beim Starten von Speedtest:', err);
      clearTimeout(safetyTimeout);
      isTestRunning = false;
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Fehler beim Starten des Tests: ' + err.message })}\n\n`);
      res.end();
  });

  speedtest.stdout.on('data', (data) => {
    const text = data.toString();
    buffer += text;

    // Versuche Jitter zu finden (Format oft: "Latency: 14.33 ms (0.55 ms jitter)")
    const jitterMatch = text.match(/([\d\.]+)\s+ms\s+jitter/i);
    if (jitterMatch) {
        finalResult.jitter = parseFloat(jitterMatch[1]);
    }

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
    clearTimeout(safetyTimeout); // Timeout entfernen
    isTestRunning = false; // Lock freigeben
    console.log(`Manueller Speedtest beendet mit Code ${code}`);

    if (code !== 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Speedtest CLI fehlgeschlagen' })}\n\n`);
        res.end();
        return;
    }

    const ispMatch = buffer.match(/ISP:\s+(.+)/);
    if (ispMatch) finalResult.isp = ispMatch[1].trim();
    
    // Robusteres Parsing für Server und ID
    // Suche erst nach der Zeile "Server: ..."
    const serverLineMatch = buffer.match(/Server:\s+(.+)/);
    if (serverLineMatch) {
        let fullServerText = serverLineMatch[1].trim();
        
        // Versuche ID zu extrahieren: (id = 12345) oder (id: 12345)
        const idMatch = fullServerText.match(/\(id\s*[=:]\s*(\d+)\)/i);
        if (idMatch) {
            finalResult.serverId = idMatch[1];
            // Entferne die ID aus dem Location-Namen für saubere Speicherung
            finalResult.serverLocation = fullServerText.replace(idMatch[0], '').trim();
        } else {
            finalResult.serverLocation = fullServerText;
        }
    }
    
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
    const isManual = 1; // Manuell

    const insertSql = `
        INSERT INTO results (timestamp, ping, download, upload, packetLoss, isp, serverLocation, serverCountry, jitter, serverId, serverHost, serverPort, serverIp, downloadElapsed, uploadElapsed, isVpn, externalIp, resultUrl, downloadBytes, uploadBytes, isManual)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        timestamp, 
        finalResult.ping || 0, 
        finalResult.download || 0, 
        finalResult.upload || 0, 
        finalResult.packetLoss || 0, 
        finalResult.isp, 
        finalResult.serverLocation, 
        'Unbekannt',
        finalResult.jitter,
        finalResult.serverId,
        finalResult.serverHost,
        finalResult.serverPort,
        finalResult.serverIp,
        null, // downloadElapsed (fehlt bei manuell)
        null, // uploadElapsed (fehlt bei manuell)
        0,    // isVpn (schwer zu ermitteln bei manuell)
        null, // externalIp (fehlt bei manuell)
        null, // resultUrl (fehlt bei manuell)
        0,    // downloadBytes
        0,    // uploadBytes
        isManual
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

// --- PRODUKTIV-SETUP ---
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
