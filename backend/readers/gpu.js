const fs = require('fs');
const path = require('path');

const SYS_PATH = process.env.SYS_PATH || '/sys';
const PROC_PATH = process.env.PROC_PATH || '/proc';
const DRM = `${SYS_PATH}/class/drm`;

// Media transcoders whose GPU use is worth showing (Plex, Jellyfin/Emby
// ffmpeg, HandBrake). Matched against /proc/[pid]/comm.
const TRANSCODER = /transcod|ffmpeg|handbrake/i;

function readNum(file) {
  try {
    const v = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function firstExisting(files) {
  return files.find(f => fs.existsSync(f)) || null;
}

// The first GPU with something to read: Intel (i915) exposes GT clocks and
// RC6 residency, AMD exposes a busy percentage. Found once.
let card;
function findCard() {
  let names = [];
  try {
    names = fs.readdirSync(DRM).filter(n => /^card\d+$/.test(n)).sort();
  } catch {}
  for (const n of names) {
    const dir = path.join(DRM, n);
    let driver = null;
    try {
      driver = path.basename(fs.readlinkSync(path.join(dir, 'device/driver')));
    } catch {}
    if (fs.existsSync(path.join(dir, 'gt_act_freq_mhz'))) {
      return {
        name: n,
        driver: driver || 'i915',
        act: path.join(dir, 'gt_act_freq_mhz'),
        max: firstExisting([path.join(dir, 'gt_RP0_freq_mhz'), path.join(dir, 'gt_max_freq_mhz')]),
        min: firstExisting([path.join(dir, 'gt_RPn_freq_mhz'), path.join(dir, 'gt_min_freq_mhz')]),
        rc6: firstExisting([path.join(dir, 'gt/gt0/rc6_residency_ms'), path.join(dir, 'power/rc6_residency_ms')]),
      };
    }
    const busy = path.join(dir, 'device/gpu_busy_percent');
    if (fs.existsSync(busy)) return { name: n, driver: driver || 'amdgpu', busy };
  }
  return null;
}

// Per-client GPU engine time from /proc/[pid]/fdinfo (kernel DRM usage
// stats: i915 since 5.19, amdgpu since 5.14). Only transcoder processes are
// looked at, which keeps this to a handful of files.
function transcoderEngines() {
  const clients = new Map(); // client key -> { engine: ns / capacity }
  let transcoders = 0;
  let onGpu = 0;
  let stats = false;
  let pids = [];
  try {
    pids = fs.readdirSync(PROC_PATH).filter(f => /^\d+$/.test(f));
  } catch {}
  for (const pid of pids) {
    let comm;
    try {
      comm = fs.readFileSync(`${PROC_PATH}/${pid}/comm`, 'utf8').trim();
    } catch {
      continue;
    }
    if (!TRANSCODER.test(comm)) continue;
    transcoders++;
    let fds = [];
    try {
      fds = fs.readdirSync(`${PROC_PATH}/${pid}/fdinfo`);
    } catch {}
    let usesGpu = false;
    for (const fd of fds) {
      let text;
      try {
        text = fs.readFileSync(`${PROC_PATH}/${pid}/fdinfo/${fd}`, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes('drm-driver:')) continue;
      usesGpu = true;
      const id = (text.match(/^drm-client-id:\s*(\d+)/m) || [])[1];
      const pdev = (text.match(/^drm-pdev:\s*(\S+)/m) || [])[1] || '';
      const key = `${pdev}/${id ?? `${pid}:${fd}`}`;
      if (clients.has(key)) continue; // several fds can share one client
      const engines = {};
      for (const m of text.matchAll(/^drm-engine-([\w-]+):\s*(\d+)\s*ns/gm)) {
        const cap = Number((text.match(new RegExp(`^drm-engine-capacity-${m[1]}:\\s*(\\d+)`, 'm')) || [])[1]) || 1;
        engines[m[1]] = Number(m[2]) / cap;
        stats = true;
      }
      clients.set(key, engines);
    }
    if (usesGpu) onGpu++;
  }
  return { clients, transcoders, onGpu, stats };
}

let prev = null; // { t, rc6, clients }

function getGpu() {
  if (card === undefined) card = findCard();
  if (!card) return null;
  const t = Date.now();
  const e = transcoderEngines();
  const out = {
    card: card.name,
    driver: card.driver,
    freqMhz: card.act ? readNum(card.act) : null,
    maxMhz: card.max ? readNum(card.max) : null,
    minMhz: card.min ? readNum(card.min) : null,
    busyPercent: card.busy ? readNum(card.busy) : null,
    awakePercent: null, // i915: share of time out of the RC6 sleep state
    engines: null,      // % busy per engine class, summed over transcoders
    transcoders: e.transcoders,
    transcodersOnGpu: e.onGpu,
    engineStats: e.stats, // false: kernel has no per-client DRM usage stats
  };
  const rc6 = card.rc6 ? readNum(card.rc6) : null;

  if (prev && t > prev.t) {
    const dtMs = t - prev.t;
    if (rc6 !== null && prev.rc6 !== null) {
      out.awakePercent = Math.max(0, Math.min(100, 100 - ((rc6 - prev.rc6) / dtMs) * 100));
    }
    if (e.stats) {
      const busy = {};
      for (const [key, engines] of e.clients) {
        const before = prev.clients.get(key);
        if (!before) continue; // new client: no baseline yet
        for (const [name, ns] of Object.entries(engines)) {
          const d = ns - (before[name] || 0);
          if (d > 0) busy[name] = (busy[name] || 0) + d;
        }
      }
      out.engines = {};
      for (const name of new Set([...e.clients.values()].flatMap(Object.keys))) {
        out.engines[name] = Math.min(100, ((busy[name] || 0) / (dtMs * 1e6)) * 100);
      }
    }
  }
  prev = { t, rc6, clients: e.clients };
  return out;
}

module.exports = { getGpu };
