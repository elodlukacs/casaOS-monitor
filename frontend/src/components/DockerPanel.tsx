import type { DockerContainer } from '../types';
import Panel from './Panel';
import { theme, gradAt } from '../theme';

const CPU_GRAD: [string, string, string] = [theme.process_start, theme.process_mid, theme.process_end];

function fmtMem(bytes: number) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + 'M';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'K';
  return bytes + 'B';
}

function fmtRate(bps: number) {
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + 'M';
  if (bps >= 1024) return (bps / 1024).toFixed(0) + 'K';
  return bps.toFixed(0) + 'B';
}

// "Up 3 days (healthy)" → "up 3d"; "Up About an hour" → "up 1h"
function shortStatus(c: DockerContainer) {
  if (c.state !== 'running') return c.state;
  if (/unhealthy/i.test(c.status)) return 'unhealthy';
  let s = c.status.replace(/^Up\s+/i, '').replace(/\s*\(.*\)\s*$/, '');
  s = s
    .replace(/^Less than a second$/i, '0s')
    .replace(/^About an? (\w+)$/i, '1 $1')
    .replace(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?$/i, (_, n, u) => n + u[0]);
  return `up ${s}`;
}

function statusColor(c: DockerContainer) {
  if (c.state === 'running') return /unhealthy/i.test(c.status) ? theme.cpu_end : theme.cpu_start;
  if (c.state === 'restarting' || c.state === 'dead') return theme.cpu_end;
  if (c.state === 'paused') return theme.cpu_mid;
  return theme.graph_text;
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
  containers: DockerContainer[] | null | undefined;
}

export default function DockerPanel({ containers }: Props) {
  const running = (containers ?? []).filter(c => c.state === 'running').length;

  return (
    <Panel
      title="docker"
      className="panel-docker"
      borderColor={theme.docker_box}
      bottomRight={
        containers ? (
          <>
            <span style={{ color: theme.proc_misc }}>{running}</span>
            <span style={{ color: theme.graph_text }}> running · {containers.length} total</span>
          </>
        ) : undefined
      }
    >
      {!containers ? (
        <div style={{ color: theme.graph_text, fontSize: 11, lineHeight: '16px' }}>
          docker socket not mounted<br />
          add <span style={{ color: theme.fg }}>/var/run/docker.sock:/var/run/docker.sock:ro</span> to the compose volumes
        </div>
      ) : containers.length === 0 ? (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>no containers</div>
      ) : (
        <table className="proc-table">
          <thead>
            <tr>
              {th('Container', 'left')}
              {th('Status', 'left', 74)}
              {th('Cpu%', 'right', 56)}
              {th('Mem', 'right', 56)}
              {th('Mem%', 'right', 50, 'col-wide')}
              {th('Net▼', 'right', 56, 'col-wide')}
              {th('Net▲', 'right', 56, 'col-wide')}
            </tr>
          </thead>
          <tbody>
            {containers.map(c => {
              const dim = c.state !== 'running';
              const fg = dim ? theme.graph_text : theme.fg;
              return (
                <tr key={c.id}>
                  <td
                    title={`${c.name} · ${c.image}`}
                    style={{ ...cell, color: fg, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {c.name}
                  </td>
                  <td style={{ ...cell, color: statusColor(c) }} title={c.status}>{shortStatus(c)}</td>
                  <td style={{ ...cell, textAlign: 'right', color: dim ? theme.graph_text : gradAt(CPU_GRAD, Math.min(1, c.cpuPercent / 100)) }}>
                    {dim ? '' : c.cpuPercent.toFixed(1)}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', color: dim ? theme.graph_text : theme.hi_fg }}>{dim ? '' : fmtMem(c.memUsage)}</td>
                  <td className="col-wide" style={{ ...cell, textAlign: 'right', color: theme.graph_text }}>{dim ? '' : c.memPercent.toFixed(1)}</td>
                  <td className="col-wide" style={{ ...cell, textAlign: 'right', color: theme.download_end }}>{dim ? '' : fmtRate(c.rxBytesPerSec)}</td>
                  <td className="col-wide" style={{ ...cell, textAlign: 'right', color: theme.upload_end }}>{dim ? '' : fmtRate(c.txBytesPerSec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
