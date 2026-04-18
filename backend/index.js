const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { getCpuUsage } = require('./readers/cpu');
const { getMemoryInfo } = require('./readers/memory');
const { getNetworkInfo } = require('./readers/network');
const { getDiskInfo } = require('./readers/disk');
const { getProcesses } = require('./readers/processes');
const { getTemperatures } = require('./readers/temperature');

process.title = 'casaos-monitor';

const PROC_PATH = process.env.PROC_PATH || '/proc';
const PORT = process.env.PORT || 3030;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
}

function getHostname() {
  try {
    return fs.readFileSync(`${PROC_PATH}/sys/kernel/hostname`, 'utf8').trim();
  } catch {
    return os.hostname();
  }
}

function getUptime() {
  try {
    const seconds = parseFloat(fs.readFileSync(`${PROC_PATH}/uptime`, 'utf8').split(' ')[0]);
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  } catch {
    return 'unknown';
  }
}

function getCpuModel() {
  try {
    const c = fs.readFileSync(`${PROC_PATH}/cpuinfo`, 'utf8');
    const m = c.match(/model name\s*:\s*(.+)/);
    return m ? m[1].trim() : 'CPU';
  } catch { return 'CPU'; }
}

function getLoadAvg() {
  try {
    const parts = fs.readFileSync(`${PROC_PATH}/loadavg`, 'utf8').trim().split(/\s+/);
    return { one: parseFloat(parts[0]), five: parseFloat(parts[1]), fifteen: parseFloat(parts[2]) };
  } catch { return { one: 0, five: 0, fifteen: 0 }; }
}

function collectMetrics() {
  try {
    return {
      timestamp: Date.now(),
      hostname: getHostname(),
      uptime: getUptime(),
      cpu: getCpuUsage(),
      memory: getMemoryInfo(),
      network: getNetworkInfo(),
      disk: getDiskInfo(),
      temperature: getTemperatures(),
      processes: getProcesses(),
      cpuModel: getCpuModel(),
      loadAvg: getLoadAvg(),
    };
  } catch (e) {
    console.error('metrics error:', e.message);
    return null;
  }
}

collectMetrics();

wss.on('connection', (ws) => {
  console.log('client connected');
  let intervalMs = 1000;
  let timer = null;

  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      const metrics = collectMetrics();
      if (metrics) ws.send(JSON.stringify(metrics));
    }, intervalMs);
  }

  startTimer();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'setInterval') {
        intervalMs = Math.max(100, Math.min(1000, Number(msg.ms) || 1000));
        startTimer();
      }
    } catch {}
  });

  ws.on('close', () => {
    clearInterval(timer);
    console.log('client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`casaos-monitor on :${PORT}  proc=${PROC_PATH}`);
});
