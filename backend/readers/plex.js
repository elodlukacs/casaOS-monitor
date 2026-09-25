// Plex "now playing": who is watching what, and how it is delivered.
// On when PLEX_URL and PLEX_TOKEN are set. The monitor runs on the host
// network, so http://127.0.0.1:32400 reaches a local Plex server.

const PLEX_URL = (process.env.PLEX_URL || '').replace(/\/+$/, '');
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';
const TIMEOUT_MS = 4000;

function configured() {
  return !!(PLEX_URL && PLEX_TOKEN);
}

// How the stream reaches the player:
//   direct play:   file sent as is
//   direct stream: repackaged, video untouched (container or audio change)
//   transcode:     video re-encoded, on the GPU (hw) or the CPU
function delivery(m) {
  const ts = m.TranscodeSession;
  if (!ts) return { mode: 'direct play', hw: false };
  if (ts.videoDecision === 'transcode') {
    return { mode: 'transcode', hw: !!(ts.transcodeHwEncoding || ts.transcodeHwDecoding || ts.transcodeHwFullPipeline) };
  }
  return { mode: 'direct stream', hw: false };
}

function titleOf(m) {
  if (m.type === 'episode') {
    const se = m.parentIndex != null && m.index != null ? ` S${m.parentIndex}·E${m.index}` : '';
    return `${m.grandparentTitle || ''}${se} ${m.title || ''}`.trim();
  }
  if (m.type === 'track') return [m.grandparentTitle, m.title].filter(Boolean).join(' – ');
  return m.year ? `${m.title} (${m.year})` : m.title || '?';
}

async function getPlexSessions() {
  if (!configured()) return undefined;
  const res = await fetch(`${PLEX_URL}/status/sessions`, {
    headers: { 'X-Plex-Token': PLEX_TOKEN, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error('Plex rejected the token (401)');
  if (!res.ok) throw new Error(`Plex HTTP ${res.status}`);
  const data = await res.json();
  const items = (data.MediaContainer && data.MediaContainer.Metadata) || [];
  return items.map(m => {
    const media = (m.Media && m.Media[0]) || {};
    const d = delivery(m);
    return {
      user: (m.User && m.User.title) || '?',
      title: titleOf(m),
      type: m.type || '',
      player: (m.Player && (m.Player.title || m.Player.product)) || '?',
      state: (m.Player && m.Player.state) || '', // playing | paused | buffering
      local: m.Session ? m.Session.location === 'lan' : null,
      mode: d.mode,
      hw: d.hw,
      resolution: media.videoResolution || null, // "1080", "4k", "sd"
      bandwidthKbps: (m.Session && m.Session.bandwidth) || null,
      progress: m.duration ? Math.min(1, (m.viewOffset || 0) / m.duration) : null,
    };
  });
}

module.exports = { getPlexSessions, plexConfigured: configured };
