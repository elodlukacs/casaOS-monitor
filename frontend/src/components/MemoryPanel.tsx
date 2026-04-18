import type { MemoryInfo, DiskInfo, StorageInfo } from '../types';
import Panel from './Panel';
import UsageBar from './UsageBar';
import { theme } from '../theme';

function fmtBytes(bytes: number) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'G';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + 'M';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + 'K';
  return bytes + 'B';
}

function fmtSpeed(bps: number) {
  if (bps >= 1073741824) return (bps / 1073741824).toFixed(1) + 'G/s';
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + 'M/s';
  if (bps >= 1024) return (bps / 1024).toFixed(0) + 'K/s';
  return bps.toFixed(0) + 'B/s';
}

interface Props {
  memory: MemoryInfo;
  disk: DiskInfo[];
  storage: StorageInfo[];
}

const USED: [string, string, string] = [theme.used_start, theme.used_mid, theme.used_end];
const AVAIL: [string, string, string] = [theme.available_start, theme.available_mid, theme.available_end];
const CACHED: [string, string, string] = [theme.cached_start, theme.cached_mid, theme.cached_end];
const FREE: [string, string, string] = [theme.free_start, theme.free_mid, theme.free_end];

// Match mobile: filter out tiny/pseudo mounts
const MIN_MOUNT_SIZE = 1024 * 1024 * 1024;

export default function MemoryPanel({ memory, disk, storage }: Props) {
  const available = memory.free + memory.buffers + memory.cached;
  const availPct = memory.total > 0 ? (available / memory.total) * 100 : 0;
  const cachedPct = memory.total > 0 ? (memory.cached / memory.total) * 100 : 0;
  const freePct = memory.total > 0 ? (memory.free / memory.total) * 100 : 0;

  const drives = (storage ?? []).filter(s => s.total > MIN_MOUNT_SIZE);
  // index disk I/O by label (mount basename) for per-mount overlay
  const ioByDevice = new Map<string, DiskInfo>();
  for (const d of disk ?? []) ioByDevice.set(d.device, d);

  return (
    <Panel
      title="mem"
      num="2"
      borderColor={theme.mem_box}
      bottomRight={
        <>
          <span style={{ color: theme.graph_text }}>total </span>
          <span style={{ color: theme.fg }}>{fmtBytes(memory.total)}</span>
        </>
      }
    >
      <UsageBar label="Used"      value={memory.usedPercent} total={fmtBytes(memory.used)}   gradient={USED}   />
      <UsageBar label="Available" value={availPct}           total={fmtBytes(available)}      gradient={AVAIL}  />
      <UsageBar label="Cached"    value={cachedPct}          total={fmtBytes(memory.cached)}  gradient={CACHED} />
      <UsageBar label="Free"      value={freePct}            total={fmtBytes(memory.free)}    gradient={FREE}   />

      {memory.swap.total > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: theme.graph_text, marginBottom: 2, letterSpacing: '0.08em' }}>
            ─ swap ─
          </div>
          <UsageBar label="Swap" value={memory.swap.usedPercent} total={fmtBytes(memory.swap.used)} gradient={USED} />
        </div>
      )}

      {drives.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${theme.div_line}` }}>
          <div style={{ fontSize: 10, color: theme.graph_text, marginBottom: 4, letterSpacing: '0.08em' }}>
            ─ disks ─
          </div>
          {drives.map(d => {
            const io = ioByDevice.get(d.label);
            return (
              <div key={d.mountpoint} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    lineHeight: '14px',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span
                    style={{
                      color: theme.fg,
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={d.mountpoint}
                  >
                    {d.label}
                  </span>
                  <span style={{ color: theme.graph_text }}>
                    {fmtBytes(d.used)}<span style={{ color: theme.inactive_fg }}>/</span>{fmtBytes(d.total)}
                  </span>
                </div>
                <UsageBar
                  label={d.mountpoint.length > 12 ? '…' + d.mountpoint.slice(-11) : d.mountpoint}
                  value={d.usedPercent}
                  gradient={USED}
                />
                {io && (io.readBytesPerSec > 0 || io.writeBytesPerSec > 0) && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 10,
                      fontSize: 10,
                      lineHeight: '14px',
                      fontFamily: "'JetBrains Mono', monospace",
                      marginTop: 1,
                    }}
                  >
                    <span style={{ color: theme.cached_mid }}>↓{fmtSpeed(io.readBytesPerSec)}</span>
                    <span style={{ color: theme.used_mid }}>↑{fmtSpeed(io.writeBytesPerSec)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
