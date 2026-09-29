import type { PlexInfo, PlexSession } from '../types';
import Panel from './Panel';
import UsageBar from './UsageBar';
import { theme } from '../theme';

const pad = (n: number) => String(n).padStart(2, '0');

// ms → "4:05" or "1:02:03"
function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function fmtKbps(kbps: number) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

// "The Office · S03E05 · Initiation", "Artist – Song", "Movie (2010)"
function fmtTitle(s: PlexSession) {
  if (s.type === 'episode') {
    const se = s.season !== null && s.episode !== null ? `S${pad(s.season)}E${pad(s.episode)}` : null;
    return [s.parent, se, s.title].filter(Boolean).join(' · ');
  }
  if (s.type === 'track' && s.parent) return `${s.parent} – ${s.title}`;
  return s.year ? `${s.title} (${s.year})` : s.title;
}

const STATE_ICON: Record<string, string> = { playing: '▶', paused: '❚❚', buffering: '…' };

const line: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 11,
  lineHeight: '15px',
  whiteSpace: 'nowrap',
};
const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };

interface Props {
  plex: PlexInfo;
}

export default function PlexPanel({ plex }: Props) {
  const transcoding = plex.sessions.filter(s => s.decision === 'transcode').length;

  return (
    <Panel
      title="plex"
      className="panel-plex"
      borderColor={theme.plex_box}
      bottomRight={
        plex.sessions.length > 0 ? (
          <>
            <span style={{ color: theme.plex }}>{plex.sessions.length}</span>
            <span style={{ color: theme.graph_text }}> streaming</span>
            {transcoding > 0 && <span style={{ color: theme.graph_text }}> · {transcoding} transcoding</span>}
          </>
        ) : undefined
      }
    >
      {plex.error ? (
        <div style={{ color: theme.graph_text, fontSize: 11, lineHeight: '16px' }}>
          Plex unreachable: <span style={{ color: theme.cpu_end }}>{plex.error}</span>
        </div>
      ) : plex.sessions.length === 0 ? (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>nothing playing</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plex.sessions.map(s => {
            const playing = s.state === 'playing';
            const title = fmtTitle(s);
            const pct = s.duration > 0 ? (s.offset / s.duration) * 100 : 0;
            return (
              <div key={s.id}>
                <div style={line}>
                  <span style={{ ...ellipsis, color: playing ? theme.fg : theme.hi_fg }} title={title}>
                    <span style={{ color: playing ? theme.plex : theme.graph_text }}>{STATE_ICON[s.state] ?? '▶'}</span>{' '}
                    {title}
                  </span>
                  <span style={{ color: theme.title, flexShrink: 0 }}>{s.user}</span>
                </div>
                <UsageBar
                  value={pct}
                  color={playing ? theme.plex : theme.graph_text}
                  display={s.duration > 0 ? `${fmtTime(s.offset)} / ${fmtTime(s.duration)}` : fmtTime(s.offset)}
                  valueWidth={112}
                />
                <div style={{ ...line, color: theme.graph_text }}>
                  <span style={ellipsis} title={s.player}>
                    {s.player}
                    {!s.local && ' · remote'}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    <span style={{ color: s.decision === 'transcode' ? theme.available_mid : theme.graph_text }}>{s.decision}</span>
                    {s.bandwidthKbps !== null && ` · ${fmtKbps(s.bandwidthKbps)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
