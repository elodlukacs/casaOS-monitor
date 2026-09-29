import type { QbitInfo, Torrent } from '../types';
import Panel from './Panel';
import { theme } from '../theme';

function fmtRate(bps: number) {
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + 'M';
  if (bps >= 1024) return (bps / 1024).toFixed(0) + 'K';
  return bps.toFixed(0) + 'B';
}

function fmtSize(bytes: number) {
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + 'T';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + 'M';
  return (bytes / 1024).toFixed(0) + 'K';
}

// 45 → "45s", 750 → "12m", 7200 → "2h", 200000 → "2d"
function fmtEta(t: Torrent) {
  if (t.progress >= 1) return 'seed';
  if (t.eta === null) return '∞';
  if (t.eta < 60) return `${t.eta}s`;
  if (t.eta < 3600) return `${Math.floor(t.eta / 60)}m`;
  if (t.eta < 86400) return `${Math.floor(t.eta / 3600)}h`;
  return `${Math.floor(t.eta / 86400)}d`;
}

const cell: React.CSSProperties = {
  padding: '2px 8px 2px 0',
  fontSize: 11,
  whiteSpace: 'nowrap',
  lineHeight: '17px',
};
const th = (label: string, align: 'left' | 'right', width?: number, className?: string) => (
  <th className={className} style={{ ...cell, textAlign: align, color: theme.graph_text, width, cursor: 'default' }}>{label}</th>
);

interface Props {
  qbit: QbitInfo;
}

export default function TorrentPanel({ qbit }: Props) {
  return (
    <Panel
      title="torrents"
      className="panel-torrent"
      borderColor={theme.torrent_box}
      bottomRight={
        <>
          <span style={{ color: theme.download_end }}>▼{fmtRate(qbit.dlSpeed)}</span>
          <span style={{ color: theme.graph_text }}> · </span>
          <span style={{ color: theme.upload_end }}>▲{fmtRate(qbit.upSpeed)}</span>
        </>
      }
    >
      {qbit.error ? (
        <div style={{ color: theme.graph_text, fontSize: 11, lineHeight: '16px' }}>
          qBittorrent unreachable: <span style={{ color: theme.cpu_end }}>{qbit.error}</span>
        </div>
      ) : qbit.torrents.length === 0 ? (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>no active transfers</div>
      ) : (
        <table className="proc-table">
          <thead>
            <tr>
              {th('Torrent', 'left')}
              {th('Done', 'right', 44)}
              {th('▼', 'right', 52)}
              {th('▲', 'right', 52)}
              {th('Eta', 'right', 36)}
            </tr>
          </thead>
          <tbody>
            {qbit.torrents.map(t => {
              const idle = t.dlSpeed === 0 && t.upSpeed === 0;
              return (
                // Size and peers live in the tooltip: the column is narrow and
                // the name is what you scan for.
                <tr key={t.hash} title={`${t.name}\n${t.state} · ${fmtSize(t.size)} · ${t.seeds} seeds / ${t.peers} peers · ratio ${t.ratio.toFixed(2)}`}>
                  <td
                    style={{ ...cell, color: idle ? theme.graph_text : theme.fg, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {t.name}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: t.progress >= 1 ? theme.cpu_start : theme.hi_fg }}>
                    {Math.floor(t.progress * 100)}%
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: t.dlSpeed > 0 ? theme.download_end : theme.graph_text }}>{fmtRate(t.dlSpeed)}</td>
                  <td style={{ ...cell, textAlign: 'right', color: t.upSpeed > 0 ? theme.upload_end : theme.graph_text }}>{fmtRate(t.upSpeed)}</td>
                  <td style={{ ...cell, textAlign: 'right', color: theme.graph_text }}>{fmtEta(t)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
