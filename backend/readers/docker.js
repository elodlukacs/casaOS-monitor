const http = require('http');
const fs = require('fs');

// Talks to the Docker Engine API over the unix socket, no SDK needed.
// Mount /var/run/docker.sock into the container (read-only is fine for GETs).
const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const TIMEOUT_MS = 4000;

function available() {
  try {
    return fs.statSync(SOCKET).isSocket();
  } catch {
    return false;
  }
}

function api(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: SOCKET, path, method: 'GET', headers: { Host: 'docker' } },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`docker ${path} -> HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`docker ${path} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

// previous cumulative counters per container, for rate/percent deltas
let prev = new Map();

// Same formula as `docker stats`: container cpu delta over host cpu delta,
// scaled by online cpus, so a container can exceed 100% on multi-core boxes.
function cpuPercent(s, p) {
  const total = s.cpu_stats?.cpu_usage?.total_usage ?? 0;
  const system = s.cpu_stats?.system_cpu_usage ?? 0;
  const online = s.cpu_stats?.online_cpus || (s.cpu_stats?.cpu_usage?.percpu_usage || []).length || 1;
  if (!p) return { pct: 0, total, system };
  const cpuDelta = total - p.cpuTotal;
  const sysDelta = system - p.systemCpu;
  const pct = cpuDelta > 0 && sysDelta > 0 ? (cpuDelta / sysDelta) * online * 100 : 0;
  return { pct, total, system };
}

// `docker stats` subtracts page cache so the number means resident usage.
function memoryUsage(s) {
  const st = s.memory_stats?.stats || {};
  const cache = st.inactive_file ?? st.total_inactive_file ?? st.cache ?? 0;
  const usage = Math.max(0, (s.memory_stats?.usage || 0) - cache);
  const limit = s.memory_stats?.limit || 0;
  return { usage, limit, pct: limit > 0 ? (usage / limit) * 100 : 0 };
}

async function getContainers() {
  if (!available()) return null;
  const list = await api('/containers/json?all=1');
  const now = Date.now();
  const next = new Map();

  const results = await Promise.all(
    list.map(async c => {
      const name = (c.Names && c.Names[0] ? c.Names[0] : c.Id.slice(0, 12)).replace(/^\//, '');
      const base = {
        id: c.Id.slice(0, 12),
        name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        cpuPercent: 0,
        memUsage: 0,
        memLimit: 0,
        memPercent: 0,
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
      };
      if (c.State !== 'running') return base;

      let s;
      try {
        // one-shot avoids the daemon sleeping a second to take two samples
        s = await api(`/containers/${c.Id}/stats?stream=false&one-shot=true`);
      } catch {
        return base;
      }

      const p = prev.get(c.Id);
      const cpu = cpuPercent(s, p);
      const mem = memoryUsage(s);
      let rx = 0;
      let tx = 0;
      for (const n of Object.values(s.networks || {})) {
        rx += n.rx_bytes || 0;
        tx += n.tx_bytes || 0;
      }
      next.set(c.Id, { cpuTotal: cpu.total, systemCpu: cpu.system, rx, tx, t: now });

      base.cpuPercent = cpu.pct;
      base.memUsage = mem.usage;
      base.memLimit = mem.limit;
      base.memPercent = mem.pct;
      if (p) {
        const dt = (now - p.t) / 1000;
        if (dt > 0) {
          base.rxBytesPerSec = Math.max(0, (rx - p.rx) / dt);
          base.txBytesPerSec = Math.max(0, (tx - p.tx) / dt);
        }
      }
      return base;
    }),
  );

  prev = next;
  results.sort((a, b) => {
    const ra = a.state === 'running' ? 1 : 0;
    const rb = b.state === 'running' ? 1 : 0;
    return rb - ra || b.cpuPercent - a.cpuPercent || a.name.localeCompare(b.name);
  });
  return results;
}

module.exports = { getContainers, dockerAvailable: available };
