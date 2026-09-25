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
const { getContainers, dockerAvailable } = require('./readers/docker');
const { getCpuFreq } = require('./readers/cpufreq');
const { getCooling } = require('./readers/cooling');
const { verifyClient, tokenRequired } = require('./access');

process.title = 'casaos-monitor';

const PROC_PATH = process.env.PROC_PATH || '/proc';
const PORT = process.env.PORT || 3030;

const MIN_INTERVAL = 100;
const MAX_INTERVAL = 10000;
const DEFAULT_INTERVAL = 1000;
const IDLE_INTERVAL = 1000;      // sampling cadence with no clients (keeps history warm)
// Per-process CPU% is derived from 10ms scheduler ticks, so windows shorter
// than ~1s are pure noise. Storage needs a statfs() per mount and rarely changes.
const PROCESS_INTERVAL = 1000;
const STORAGE_INTERVAL = 5000;
const DOCKER_INTERVAL = 2000;
const COOLING_INTERVAL = 1000;   // fan RPM moves slowly; no need to walk hwmon at 10Hz
// Some sensors are read by sending the device a command (nvme, iwlwifi,
// drivetemp on SATA disks); once a second is plenty and spares the hardware.
const TEMP_INTERVAL = 1000;
// Ping every client this often; one that hasn't answered the previous ping
// (a phone that went to sleep, a dropped Wi-Fi link) is dropped.
const HEARTBEAT_MS = 15000;
// Skip frames for a client whose unsent backlog is over this, instead of
// queueing without bound for one that stopped reading.
const MAX_BUFFERED = 1024 * 1024;
const HISTORY_STEP_MS = 1000;
const HISTORY_SPAN_MS = 60 * 60 * 1000; // one hour of 1s points, sent on connect

const app = express();
const server = http.createServer(app);
// Clients only send tiny control messages; ws would accept up to 100 MiB.
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, verifyClient });

// For the Docker HEALTHCHECK: healthy while the sampler keeps producing frames.
app.get('/healthz', (req, res) => {
  const age = lastSample ? Date.now() - lastSample.timestamp : Infinity;
  res.status(age < 10000 ? 200 : 503).json({ ok: age < 10000, ageMs: Number.isFinite(age) ? age : null });
});

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
// windows and bogus 0% readings. The sampler keeps running at 1s with no
// clients so the history buffer is complete when someone opens the page.
// ---------------------------------------------------------------------------
let processes = [];
let processesAt = 0;
let storage = [];
let storageAt = 0;
const dockerConfigured = dockerAvailable();
let docker = dockerConfigured ? [] : null; // null = no Docker API configured or reachable
let dockerError = null; // last error text, logged once per change
let dockerAt = 0;
let dockerBusy = false;
let cooling = null;
let coolingAt = 0;
let temperature = null;
let temperatureAt = 0;
let lastSample = null;

const history = []; // { t, cpu, temp, rx, tx } at HISTORY_STEP_MS
let historyAt = 0;

if (!dockerConfigured) {
  console.log('no Docker API configured; container panel disabled (set DOCKER_HOST, see docker-compose.yml)');
}

function refreshDocker() {
  if (dockerBusy || !dockerConfigured) return;
  dockerBusy = true;
  getContainers()
    .then(list => {
      if (!list) return;
      docker = list;
      if (dockerError) console.log('docker API reachable again');
      dockerError = null;
    })
    .catch(e => {
      // Unreachable (proxy down, wrong DOCKER_HOST): report null so the panel
      // says so instead of showing an empty list. Keeps retrying.
      docker = null;
      if (e.message !== dockerError) console.error('docker error:', e.message);
      dockerError = e.message;
    })
    .finally(() => { dockerBusy = false; });
}

function sample(full) {
  const now = Date.now();
  if (full) {
    if (now - processesAt >= PROCESS_INTERVAL) {
      processes = safe(getProcesses, processes);
      processesAt = now;
    }
    if (now - storageAt >= STORAGE_INTERVAL) {
      storage = safe(getStorageInfo, storage);
      storageAt = now;
    }
    if (now - dockerAt >= DOCKER_INTERVAL) {
      dockerAt = now;
      refreshDocker();
    }
    if (now - coolingAt >= COOLING_INTERVAL) {
      cooling = safe(getCooling, cooling);
      coolingAt = now;
    }
  }

  const cpu = safe(getCpuUsage, []);
  const network = safe(getNetworkInfo, []);
  if (now - temperatureAt >= TEMP_INTERVAL) {
    temperature = safe(getTemperatures, temperature);
    temperatureAt = now;
  }

  lastSample = {
    type: 'metrics',
    timestamp: now,
    hostname,
    uptime: safe(getUptime, 'unknown'),
    cpuModel,
    loadAvg: safe(getLoadAvg, EMPTY_LOAD),
    cpu,
    cpuFreq: safe(getCpuFreq, null),
    memory: safe(getMemoryInfo, EMPTY_MEMORY),
    network,
    disk: safe(getDiskInfo, []),
    storage,
    temperature,
    cooling,
    processes,
    docker,
  };

  if (now - historyAt >= HISTORY_STEP_MS) {
    historyAt = now;
    const total = cpu.find(c => c.name === 'cpu');
    history.push({
      t: now,
      cpu: total ? total.usage : 0,
      temp: temperature ? temperature.cpu : null,
      rx: network[0] ? network[0].rxBytesPerSec : 0,
      tx: network[0] ? network[0].txBytesPerSec : 0,
    });
    const cutoff = now - HISTORY_SPAN_MS;
    while (history.length && history[0].t < cutoff) history.shift();
  }

  return lastSample;
}

const clients = new Map(); // ws -> { intervalMs, lastSent }
let timer = null;
let timerMs = 0;

function clampInterval(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Math.round(n)));
}

function tick() {
  const payload = JSON.stringify(sample(clients.size > 0));
  if (clients.size === 0) return;
  const now = Date.now();
  for (const [ws, c] of clients) {
    if (ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED) continue;
    // Send when this client's own interval has elapsed (with half-tick slack
    // so timer jitter doesn't skip a beat).
    if (now - c.lastSent >= c.intervalMs - timerMs / 2) {
      c.lastSent = now;
      ws.send(payload);
    }
  }
}

function reschedule() {
  let ms = IDLE_INTERVAL;
  for (const c of clients.values()) ms = Math.min(ms, c.intervalMs);
  if (timer && ms === timerMs) return;
  clearInterval(timer);
  timerMs = ms;
  timer = setInterval(tick, ms);
}

// Prime the delta readers and start the idle sampler.
sample(false);
reschedule();

// Browsers and the Android WebView answer pings on their own; no client code needed.
setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.alive) {
      ws.terminate(); // fires 'close', which removes it
      continue;
    }
    c.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('connection', (ws) => {
  const client = { intervalMs: DEFAULT_INTERVAL, lastSent: 0, alive: true };
  ws.on('pong', () => { client.alive = true; });
  clients.set(ws, client);
  console.log(`client connected (${clients.size} total)`);
  reschedule();

  // A frame right away so the UI doesn't sit on "loading".
  const fresh = lastSample && Date.now() - lastSample.timestamp < Math.max(timerMs, 1000);
  ws.send(JSON.stringify(fresh ? lastSample : sample(true)));
  client.lastSent = Date.now();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'setInterval') {
        client.intervalMs = clampInterval(msg.ms);
        reschedule();
      } else if (msg.type === 'getHistory') {
        // Opt-in: clients that only understand metrics frames (the mobile
        // app) never see this message.
        // rx/tx in the points belong to the main interface (network[0]).
        const iface = lastSample && lastSample.network[0] ? lastSample.network[0].iface : null;
        ws.send(JSON.stringify({ type: 'history', stepMs: HISTORY_STEP_MS, iface, points: history }));
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
  if (tokenRequired) console.log('MONITOR_TOKEN set: clients must connect with ?token=… (the mobile app cannot)');
});
