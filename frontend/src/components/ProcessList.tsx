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
const DEFAULT_DESC: Record<SortKey, boolean> = { pid: false, name: false, cpu: true, mem: true };
const COMPARE: Record<SortKey, (a: Process, b: Process) => number> = {
  pid: (a, b) => a.pid - b.pid,
  name: (a, b) => a.name.localeCompare(b.name),
  cpu: (a, b) => a.cpuPercent - b.cpuPercent,
  mem: (a, b) => a.memBytes - b.memBytes,
};

interface Props {
  processes: Process[];
  totalMem: number;
}

const cell: React.CSSProperties = {
  padding: '2px 8px 2px 0',
  fontSize: 11,
  whiteSpace: 'nowrap',
  lineHeight: '17px',
};

export default function ProcessList({ processes, totalMem }: Props) {
  const [sort, setSort] = useState<SortKey>('cpu');
  const [desc, setDesc] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const arr = [...processes];
    const sign = desc ? -1 : 1;
    arr.sort((a, b) => sign * COMPARE[sort](a, b));
    return arr;
  }, [processes, sort, desc]);

  const onSort = (k: SortKey) => {
    if (k === sort) {
      setDesc(d => !d);
    } else {
      setSort(k);
      setDesc(DEFAULT_DESC[k]);
    }
  };

  const th = (k: SortKey, label: string, align: 'left' | 'right', width?: number) => (
    <th
      onClick={() => onSort(k)}
      style={{ ...cell, textAlign: align, color: sort === k ? theme.title : theme.graph_text, width }}
    >
      {label}{sort === k ? (desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <Panel
      title="proc"
      num="4"
      className="panel-proc"
      borderColor={theme.proc_box}
      bottomRight={
        <>
          <span style={{ color: theme.graph_text }}>{processes.length} shown · sorted by </span>
          <span style={{ color: theme.proc_misc }}>{sort}</span>
        </>
      }
    >
      <table className="proc-table">
        <thead>
          <tr>
            {th('pid', 'Pid', 'left', 60)}
            {th('name', 'Program', 'left')}
            {th('cpu', 'Cpu%', 'right', 60)}
            {th('mem', 'Mem', 'right', 60)}
            <th style={{ ...cell, textAlign: 'right', color: theme.graph_text, width: 52, cursor: 'default' }}>Mem%</th>
            <th style={{ ...cell, textAlign: 'center', color: theme.graph_text, width: 20, cursor: 'default' }}>S</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const memPct = totalMem > 0 ? (p.memBytes / totalMem) * 100 : 0;
            const isSel = selected === p.pid;
            return (
              <tr
                key={p.pid}
                onClick={() => setSelected(isSel ? null : p.pid)}
                style={{ backgroundColor: isSel ? theme.selected_bg : undefined }}
              >
                <td style={{ ...cell, color: theme.graph_text }}>{p.pid}</td>
                <td
                  style={{
                    ...cell,
                    color: isSel ? theme.selected_fg : theme.fg,
                    maxWidth: 0, // let the column shrink so ellipsis works
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={p.name}
                >
                  {p.name}
                </td>
                <td style={{ ...cell, textAlign: 'right', color: gradAt(PROC_GRAD, Math.min(1, p.cpuPercent / 100)) }}>
                  {p.cpuPercent.toFixed(1)}
                </td>
                <td style={{ ...cell, textAlign: 'right', color: theme.hi_fg }}>{fmtMem(p.memBytes)}</td>
                <td style={{ ...cell, textAlign: 'right', color: theme.graph_text }}>{memPct.toFixed(1)}</td>
                <td style={{ ...cell, textAlign: 'center', color: theme.graph_text }}>{p.state}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
