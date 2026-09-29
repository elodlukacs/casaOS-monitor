// Plex Media Server "now playing" via /status/sessions. Auth is either
// PLEX_TOKEN, or the monitor's address in Settings → Network → "List of IP
// addresses and networks that are allowed without auth".
const BASE = (process.env.PLEX_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.PLEX_TOKEN || '';
const TIMEOUT_MS = 4000;

function configured() {
  return BASE !== '';
}

// Clients report their position only every ~10s. Between reports, advance a
// playing session by wall time so the progress bar moves smoothly.
// session id -> { reported, at }
let positions = new Map();

function decision(m) {
  const t = m.TranscodeSession;
  if (!t) return 'direct play';
  if (t.videoDecision === 'transcode' || t.audioDecision === 'transcode') return 'transcode';
  return 'direct stream';
}

async function getSessions() {
  const headers = { Accept: 'application/json' };
  if (TOKEN) headers['X-Plex-Token'] = TOKEN;
  const res = await fetch(`${BASE}/status/sessions`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401) throw new Error('HTTP 401: not authorised (set PLEX_TOKEN or allow this network without auth)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();

  const now = Date.now();
  const next = new Map();
  const sessions = (body.MediaContainer?.Metadata || []).map(m => {
    const id = String(m.Session?.id || m.sessionKey);
    const state = m.Player?.state || 'playing';
    const reported = m.viewOffset || 0;
    const duration = m.duration || 0;
    const p = positions.get(id);
    const at = p && p.reported === reported ? p.at : now;
    next.set(id, { reported, at });
    const offset = state === 'playing' ? reported + (now - at) : reported;

    return {
      id,
      type: m.type,                                   // movie | episode | track | clip
      title: m.title || '',
      parent: m.grandparentTitle || null,             // show for episodes, artist for tracks
      season: m.type === 'episode' ? m.parentIndex ?? null : null,
      episode: m.type === 'episode' ? m.index ?? null : null,
      year: m.year ?? null,
      duration,
      offset: duration > 0 ? Math.min(offset, duration) : offset,
      state,                                          // playing | paused | buffering
      user: m.User?.title || '',
      player: m.Player?.title || m.Player?.product || '',
      local: m.Session?.location ? m.Session.location === 'lan' : !!m.Player?.local,
      bandwidthKbps: m.Session?.bandwidth ?? null,
      decision: decision(m),
    };
  });
  positions = next;

  sessions.sort((a, b) => a.user.localeCompare(b.user) || a.id.localeCompare(b.id));
  return { sessions, error: null };
}

module.exports = { getSessions, plexConfigured: configured };
