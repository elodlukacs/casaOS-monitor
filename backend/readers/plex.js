// Plex Media Server "now playing" via /status/sessions, plus item counts per
// library from /library/sections. Auth is either
// PLEX_TOKEN, or the monitor's address in Settings → Network → "List of IP
// addresses and networks that are allowed without auth".
const BASE = (process.env.PLEX_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.PLEX_TOKEN || '';
const TIMEOUT_MS = 4000;
// Library counts change rarely and cost a request or two per library.
const LIBRARY_INTERVAL = 5 * 60 * 1000;
const LIBRARY_RETRY = 30 * 1000;

// Per library type: the top-level item plus the child types worth counting.
// Plex metadata type ids: 1 movie, 2 show, 3 season, 4 episode, 8 artist,
// 9 album, 10 track, 13 photo.
const COUNTS = {
  movie: [['movies', null]],
  show: [['shows', null], ['episodes', 4]],
  artist: [['artists', null], ['albums', 9], ['tracks', 10]],
  photo: [['photos', 13]],
};

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

async function api(path) {
  const headers = { Accept: 'application/json' };
  if (TOKEN) headers['X-Plex-Token'] = TOKEN;
  const res = await fetch(BASE + path, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401) throw new Error('HTTP 401: not authorised (set PLEX_TOKEN or allow this network without auth)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Item count without fetching items: a zero-size page still reports totalSize.
async function count(key, type) {
  const q = `X-Plex-Container-Start=0&X-Plex-Container-Size=0${type ? `&type=${type}` : ''}`;
  const body = await api(`/library/sections/${key}/all?${q}`);
  return body.MediaContainer?.totalSize ?? body.MediaContainer?.size ?? 0;
}

let libraries = [];
let librariesAt = 0;

async function refreshLibraries() {
  const body = await api('/library/sections');
  libraries = await Promise.all(
    (body.MediaContainer?.Directory || []).map(async d => {
      const kinds = COUNTS[d.type] || [['items', null]];
      const counts = await Promise.all(kinds.map(async ([label, type]) => ({ label, n: await count(d.key, type) })));
      return { key: String(d.key), title: d.title, type: d.type, counts };
    }),
  );
}

async function getSessions() {
  const now = Date.now();
  if (now - librariesAt >= LIBRARY_INTERVAL) {
    librariesAt = now;
    // Off the sessions path: counts can lag a poll, now-playing shouldn't.
    // On failure the previous counts stay and it retries sooner.
    refreshLibraries().catch(e => {
      librariesAt = Date.now() - LIBRARY_INTERVAL + LIBRARY_RETRY;
      console.error('plex libraries error:', e.cause?.code || e.message);
    });
  }

  const body = await api('/status/sessions');

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
  return { sessions, libraries, error: null };
}

module.exports = { getSessions, plexConfigured: configured };
