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
const { getStorageInfo } = require('./readers/storage');
const { getProcesses } = require('./readers/processes');
const { getTemperatures } = require('./readers/temperature');

process.title = 'casaos-monitor';

const PROC_PATH = process.env.PROC_PATH || '/proc';
const PORT = process.env.PORT || 3030;

const MIN_INTERVAL = 100;
const MAX_INTERVAL = 10000;
const DEFAULT_INTERVAL = 1000;
// Per-process CPU% is derived from 10ms scheduler ticks, so windows shorter
// than ~1s are pure noise. Storage needs a statfs() per mount and rarely changes.
const PROCESS_INTERVAL = 1000;
const STORAGE_INTERVAL = 5000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    console.error(`${fn.name || 'reader'} error:`, e.message);
    return fallback;
  }
}

function getHostname() {
  try {
    return fs.readFileSync(`${PROC_PATH}/sys/kernel/hostname`, 'utf8').trim();
  } catch {
    return os.hostname();
  }
}

function getUptime() {
  const seconds = parseFloat(fs.readFileSync(`${PROC_PATH}/uptime`, 'utf8').split(' ')[0]);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function getCpuModel() {
  const c = fs.readFileSync(`${PROC_PATH}/cpuinfo`, 'utf8');
  const m = c.match(/model name\s*:\s*(.+)/);
  return m ? m[1].trim() : 'CPU';
}

function getLoadAvg() {
  const parts = fs.readFileSync(`${PROC_PATH}/loadavg`, 'utf8').trim().split(/\s+/);
  return { one: parseFloat(parts[0]), five: parseFloat(parts[1]), fifteen: parseFloat(parts[2]) };
}

const EMPTY_MEMORY = {
  total: 0, used: 0, free: 0, available: 0, buffers: 0, cached: 0, usedPercent: 0,
  swap: { total: 0, used: 0, free: 0, usedPercent: 0 },
};
const EMPTY_LOAD = { one: 0, five: 0, fifteen: 0 };

// Static facts: read once.
const hostname = safe(getHostname, os.hostname());
const cpuModel = safe(getCpuModel, 'CPU');

// ---------------------------------------------------------------------------
// One global sampler. Every delta-based reader (cpu, net, disk, processes)
// keeps "previous" state, so it must be driven by exactly one clock; with a
// timer per client two clients reading back-to-back produce zero-length
// windows and bogus 0% readings.
// ---------------------------------------------------------------------------
let processes = [];
let processesAt = 0;
let storage = [];
let storageAt = 0;
let lastSample = null;

function sample() {
  const now = Date.now();
  if (now - processesAt >= PROCESS_INTERVAL) {
    processes = safe(getProcesses, processes);
    processesAt = now;
  }
  if (now - storageAt >= STORAGE_INTERVAL) {
    storage = safe(getStorageInfo, storage);
    storageAt = now;
  }
  lastSample = {
    timestamp: now,
    hostname,
    uptime: safe(getUptime, 'unknown'),
    cpuModel,
    loadAvg: safe(getLoadAvg, EMPTY_LOAD),
    cpu: safe(getCpuUsage, []),
    memory: safe(getMemoryInfo, EMPTY_MEMORY),
    network: safe(getNetworkInfo, []),
    disk: safe(getDiskInfo, []),
    storage,
    temperature: safe(getTemperatures, null),
    processes,
  };
  return lastSample;
}

// Prime the delta readers so the first real sample has a baseline.
sample();

const clients = new Map(); // ws -> { intervalMs, lastSent }
let timer = null;
let timerMs = 0;

function clampInterval(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Math.round(n)));
}

function tick() {
  const payload = JSON.stringify(sample());
  const now = Date.now();
  for (const [ws, c] of clients) {
    if (ws.readyState !== ws.OPEN) continue;
    // Send when this client's own interval has elapsed (with half-tick slack
    // so timer jitter doesn't skip a beat).
    if (now - c.lastSent >= c.intervalMs - timerMs / 2) {
      c.lastSent = now;
      ws.send(payload);
    }
  }
}

function reschedule() {
  let ms = Infinity;
  for (const c of clients.values()) ms = Math.min(ms, c.intervalMs);
  if (!Number.isFinite(ms)) {
    clearInterval(timer);
    timer = null;
    timerMs = 0;
    return;
  }
  if (timer && ms === timerMs) return;
  clearInterval(timer);
  timerMs = ms;
  timer = setInterval(tick, ms);
}

wss.on('connection', (ws) => {
  const client = { intervalMs: DEFAULT_INTERVAL, lastSent: 0 };
  clients.set(ws, client);
  console.log(`client connected (${clients.size} total)`);
  reschedule();

  // First frame right away so the UI doesn't sit on "loading" for a full interval.
  const fresh = lastSample && Date.now() - lastSample.timestamp < Math.max(timerMs, 1000);
  ws.send(JSON.stringify(fresh ? lastSample : sample()));
  client.lastSent = Date.now();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'setInterval') {
        client.intervalMs = clampInterval(msg.ms);
        reschedule();
      }
    } catch {}
  });

  ws.on('error', (e) => console.error('ws error:', e.message));
  ws.on('close', () => {
    clients.delete(ws);
    reschedule();
    console.log(`client disconnected (${clients.size} total)`);
  });
});

server.listen(PORT, () => {
  console.log(`casaos-monitor on :${PORT}  proc=${PROC_PATH}`);
});
