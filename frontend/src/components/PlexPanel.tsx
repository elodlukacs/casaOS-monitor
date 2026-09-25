import type { PlexInfo, PlexSession } from '../types';
import Panel from './Panel';
import { theme } from '../theme';

function fmtMbps(kbps: number) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

function fmtRes(r: string | null) {
  if (!r) return null;
  return /^\d+$/.test(r) ? `${r}p` : r.toUpperCase();
}

// Direct play costs the server nothing; direct stream a little CPU;
// a transcode on the GPU is fine, on the CPU it is what makes a NAS struggle.
function modeStyle(s: PlexSession): { text: string; color: string; title: string } {
  if (s.mode === 'direct play') return { text: 'direct play', color: theme.cpu_start, title: 'File sent as is' };
  if (s.mode === 'direct stream') {
    return { text: 'direct stream', color: theme.cached_mid, title: 'Repackaged or audio converted; video untouched' };
  }
  return s.hw
    ? { text: 'transcode (hw)', color: theme.cpu_mid, title: 'Video re-encoded on the GPU (Quick Sync)' }
    : { text: 'transcode (cpu)', color: theme.cpu_end, title: 'Video re-encoded on the CPU: heavy' };
}

function Session({ s }: { s: PlexSession }) {
  const mode = modeStyle(s);
  const paused = s.state === 'paused';
  const meta = [
    s.player,
    fmtRes(s.resolution),
    s.bandwidthKbps ? fmtMbps(s.bandwidthKbps) : null,
    s.local === false ? 'remote' : null,
    paused ? 'paused' : s.state === 'buffering' ? 'buffering' : null,
  ].filter(Boolean);

  return (
    <div style={{ fontSize: 11, lineHeight: '15px', opacity: paused ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <span style={{ color: theme.plex_accent, fontWeight: 700, flexShrink: 0 }}>{s.user}</span>
        <span
          style={{ color: theme.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          title={s.title}
        >
          {s.title}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={{ color: theme.graph_text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {meta.join(' · ')}
        </span>
        <span style={{ color: mode.color, whiteSpace: 'nowrap', flexShrink: 0 }} title={mode.title}>
          {mode.text}
        </span>
      </div>
      {s.progress !== null && (
        <div style={{ height: 2, background: theme.meter_bg, marginTop: 3 }}>
          <div style={{ height: '100%', width: `${s.progress * 100}%`, background: theme.plex_accent }} />
        </div>
      )}
    </div>
  );
}

export default function PlexPanel({ plex }: { plex: PlexInfo }) {
  const { sessions, error } = plex;
  const kbps = sessions.reduce((a, s) => a + (s.bandwidthKbps ?? 0), 0);
  const transcodes = sessions.filter(s => s.mode === 'transcode').length;

  return (
    <Panel
      title="plex"
      className="panel-plex"
      borderColor={theme.plex_box}
      bottomRight={
        sessions.length > 0 ? (
          <>
            <span style={{ color: theme.plex_accent }}>{sessions.length}</span>
            <span style={{ color: theme.graph_text }}>
              {' '}streaming{transcodes > 0 ? ` · ${transcodes} transcoding` : ''}
              {kbps > 0 ? ` · ${fmtMbps(kbps)}` : ''}
            </span>
          </>
        ) : undefined
      }
    >
      {error ? (
        <div style={{ color: theme.cpu_end, fontSize: 11, lineHeight: '16px' }}>
          {error}
          <br />
          <span style={{ color: theme.graph_text }}>check PLEX_URL and PLEX_TOKEN (see README)</span>
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>nobody is watching</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map((s, i) => (
            <Session key={`${s.user}-${s.title}-${i}`} s={s} />
          ))}
        </div>
      )}
    </Panel>
  );
}
