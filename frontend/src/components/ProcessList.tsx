import { useMemo, useState } from 'react';
import type { Process } from '../types';
import Panel from './Panel';
import { theme, gradAt } from '../theme';

function fmtMem(bytes: number) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + 'M';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'K';
  return bytes + 'B';
}

const PROC_GRAD: [string, string, string] = [theme.process_start, theme.process_mid, theme.process_end];

type SortKey = 'pid' | 'name' | 'cpu' | 'mem';

interface Props {
  processes: Process[];
  totalMem: number;
}

const cellStyle: React.CSSProperties = {
  padding: '1px 6px 1px 0',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  whiteSpace: 'nowrap',
  lineHeight: '16px',
};

export default function ProcessList({ processes, totalMem }: Props) {
  const [sort, setSort] = useState<SortKey>('cpu');
  const [selected, setSelected] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const arr = [...processes];
    arr.sort((a, b) => {
      switch (sort) {
        case 'pid': return a.pid - b.pid;
        case 'name': return a.name.localeCompare(b.name);
        case 'mem': return b.memBytes - a.memBytes;
        case 'cpu':
        default: return b.cpuPercent - a.cpuPercent;
      }
    });
    return arr;
  }, [processes, sort]);

  const arrow = (k: SortKey) => (sort === k ? ' ▼' : '');
  const headerCell = (k: SortKey, label: string, align: 'left' | 'right' | 'center' = 'left', width?: number): React.CSSProperties => ({
    ...cellStyle,
    textAlign: align,
    fontWeight: 'normal',
    color: sort === k ? theme.title : theme.graph_text,
    cursor: 'pointer',
    userSelect: 'none',
    width,
  });

  return (
    <Panel
      title="proc"
      num="4"
      borderColor={theme.proc_box}
      bottomRight={
        <>
          <span style={{ color: theme.graph_text }}>sorted by </span>
          <span style={{ color: theme.proc_misc }}>{sort}</span>
        </>
      }
      style={{ height: '100%' }}
    >
      <div style={{ overflowY: 'auto', maxHeight: 560 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.div_line}` }}>
              <th onClick={() => setSort('pid')}  style={headerCell('pid',  'Pid',     'left',   64)}>Pid{arrow('pid')}</th>
              <th onClick={() => setSort('name')} style={headerCell('name', 'Program', 'left')}>Program{arrow('name')}</th>
              <th onClick={() => setSort('cpu')}  style={headerCell('cpu',  'Cpu%',    'right',  62)}>Cpu%{arrow('cpu')}</th>
              <th onClick={() => setSort('mem')}  style={headerCell('mem',  'Mem',     'right',  60)}>Mem{arrow('mem')}</th>
              <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 'normal', color: theme.graph_text, width: 54 }}>Mem%</th>
              <th style={{ ...cellStyle, textAlign: 'center', fontWeight: 'normal', color: theme.graph_text, width: 22 }}>S</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const memPct = totalMem > 0 ? (p.memBytes / totalMem) * 100 : 0;
              const cpuColor = gradAt(PROC_GRAD, Math.min(1, p.cpuPercent / 100));
              const isSel = selected === p.pid;
              return (
                <tr
                  key={p.pid}
                  onClick={() => setSelected(isSel ? null : p.pid)}
                  style={{
                    backgroundColor: isSel ? theme.selected_bg : 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#252525'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td style={{ ...cellStyle, color: theme.graph_text }}>{p.pid}</td>
                  <td
                    style={{
                      ...cellStyle,
                      color: isSel ? theme.selected_fg : theme.fg,
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: cpuColor }}>
                    {p.cpuPercent.toFixed(1)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: theme.hi_fg }}>
                    {fmtMem(p.memBytes)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', color: theme.graph_text }}>
                    {memPct.toFixed(1)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center', color: theme.graph_text }}>
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
