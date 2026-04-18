import type { Process } from '../types';
import Panel from './Panel';

function fmtMem(bytes: number) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + 'M';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'K';
  return bytes + 'B';
}

function cpuColor(pct: number) {
  if (pct > 50) return '#d45454';
  if (pct > 15) return '#dcd179';
  return '#80d0a3';
}

interface Props {
  processes: Process[];
  totalMem: number;
}

const cellStyle: React.CSSProperties = {
  padding: '2px 6px 2px 0',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  whiteSpace: 'nowrap',
};

export default function ProcessList({ processes, totalMem }: Props) {
  return (
    <Panel num="⁴" title="proc" borderColor="#884d84" style={{ height: '100%' }}>
      <div style={{ overflowY: 'auto', maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#606060', borderBottom: '1px solid #2a2a2a' }}>
              <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 'normal', width: 56 }}>pid</th>
              <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 'normal' }}>name</th>
              <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 'normal', width: 56 }}>cpu%</th>
              <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 'normal', width: 56 }}>mem</th>
              <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 'normal', width: 56 }}>mem%</th>
              <th style={{ ...cellStyle, textAlign: 'center', fontWeight: 'normal', width: 24 }}>s</th>
            </tr>
          </thead>
          <tbody>
            {processes.map(p => {
              const memPct = totalMem > 0 ? (p.memBytes / totalMem) * 100 : 0;
              return (
                <tr
                  key={p.pid}
                  style={{ borderTop: '1px solid #1e1e1e' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#252525')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                >
                  <td style={{ ...cellStyle, color: '#404040' }}>{p.pid}</td>
                  <td
                    style={{
                      ...cellStyle,
                      color: '#cccccc',
                      maxWidth: 180,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: cpuColor(p.cpuPercent) }}>
                    {p.cpuPercent.toFixed(1)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: '#606060' }}>
                    {fmtMem(p.memBytes)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: '#505050' }}>
                    {memPct.toFixed(1)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center', color: '#404040' }}>
                    {p.state}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
