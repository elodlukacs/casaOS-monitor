// qBittorrent WebUI API (v2). No login: the monitor's address has to be on
// qBittorrent's auth bypass list (Options → WebUI → "Bypass authentication
// for clients in whitelisted IP subnets"). With host networking, requests to
// a bridge-networked qBittorrent arrive from the Docker gateway (172.x.0.1),
// so whitelist 172.16.0.0/12.
const BASE = (process.env.QBIT_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = 4000;
// Keep a torrent listed this long after its traffic stops, so rows don't
// blink in and out while a peer connection stalls for a second or two.
const LINGER_MS = 10000;
const ETA_INFINITE = 8640000; // qBittorrent's "unknown" eta

function configured() {
  return BASE !== '';
}

async function api(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 403) throw new Error('HTTP 403: not authorised (add this host to the WebUI auth bypass whitelist)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// hash -> { torrent, lastActive }
const seen = new Map();

async function getTorrents() {
  const now = Date.now();
  const [transfer, active] = await Promise.all([
    api('/api/v2/transfer/info'),
    api('/api/v2/torrents/info?filter=active'),
  ]);

  const current = new Set();
  for (const t of active) {
    if (!(t.dlspeed > 0 || t.upspeed > 0)) continue;
    current.add(t.hash);
    seen.set(t.hash, {
      lastActive: now,
      torrent: {
        hash: t.hash,
        name: t.name,
        state: t.state,
        progress: t.progress,
        size: t.size,
        dlSpeed: t.dlspeed,
        upSpeed: t.upspeed,
        eta: t.eta >= ETA_INFINITE ? null : t.eta,
        seeds: t.num_seeds,
        peers: t.num_leechs,
        ratio: t.ratio,
      },
    });
  }
  for (const [hash, s] of seen) {
    if (current.has(hash)) continue;
    if (now - s.lastActive > LINGER_MS) seen.delete(hash);
    else s.torrent = { ...s.torrent, dlSpeed: 0, upSpeed: 0, eta: null };
  }

  const torrents = [...seen.values()].map(s => s.torrent);
  torrents.sort((a, b) => b.dlSpeed + b.upSpeed - (a.dlSpeed + a.upSpeed) || a.name.localeCompare(b.name));
  return {
    dlSpeed: transfer.dl_info_speed || 0,
    upSpeed: transfer.up_info_speed || 0,
    // bytes transferred since qBittorrent started
    dlTotal: transfer.dl_info_data || 0,
    upTotal: transfer.up_info_data || 0,
    torrents,
    error: null,
  };
}

module.exports = { getTorrents, qbitConfigured: configured };
