import type { MemoryInfo } from '../types';
import Panel from './Panel';
import UsageBar from './UsageBar';

function fmtGiB(bytes: number) {
  const gib = bytes / 1073741824;
  if (gib >= 0.1) return gib.toFixed(1) + ' GiB';
  return (bytes / 1048576).toFixed(0) + ' MiB';
}

interface Props {
  memory: MemoryInfo;
}

export default function MemoryPanel({ memory }: Props) {
  const available = memory.free + memory.buffers + memory.cached;
  const availPct = memory.total > 0 ? (available / memory.total) * 100 : 0;
  const cachedPct = memory.total > 0 ? (memory.cached / memory.total) * 100 : 0;

  return (
    <Panel num="²" title="mem" borderColor="#21875b">
      <div style={{ fontSize: 11, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#606060' }}>Total:</span>
        <span style={{ color: '#cccccc' }}>{fmtGiB(memory.total)}</span>
      </div>

      <UsageBar
        label="Used"
        value={memory.usedPercent}
        total={fmtGiB(memory.used)}
        color="#ff4769"
      />
      <UsageBar
        label="Avail"
        value={availPct}
        total={fmtGiB(available)}
        color="#ffb814"
      />
      <UsageBar
        label="Cached"
        value={cachedPct}
        total={fmtGiB(memory.cached)}
        color="#26c5ff"
      />
      <UsageBar
        label="Swap"
        value={memory.swap.usedPercent}
        total={fmtGiB(memory.swap.used)}
        color="#ff4769"
      />
    </Panel>
  );
}
