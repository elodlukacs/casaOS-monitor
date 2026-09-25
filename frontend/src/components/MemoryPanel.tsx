import type { MemoryInfo, DiskInfo, StorageInfo } from '../types';
import Panel from './Panel';
import UsageBar from './UsageBar';
import { theme } from '../theme';
import { THRESHOLDS, level, levelColor } from '../thresholds';

function fmtBytes(bytes: number) {
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + 'T';
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

// /proc/diskstats I/O is per whole disk; mounts are partitions. sda2 → sda,
// nvme0n1p2 → nvme0n1, mmcblk0p1 → mmcblk0.
function parentDisk(device?: string) {
  if (!device) return undefined;
  if (/^(nvme\d+n\d+|mmcblk\d+)p\d+$/.test(device)) return device.replace(/p\d+$/, '');
  if (/^(sd|vd|hd|xvd)[a-z]+\d+$/.test(device)) return device.replace(/\d+$/, '');
  return device;
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

const MIN_MOUNT_SIZE = 1024 * 1024 * 1024;

// Widest fmtSpeed output plus the arrow is 9 characters ("↓123.4M/s").
const ioField: React.CSSProperties = { display: 'inline-block', minWidth: '9ch', textAlign: 'right' };

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, color: theme.graph_text, margin: '10px 0 4px', letterSpacing: '0.08em' }}>
      {children}
    </div>
  );
}

export default function MemoryPanel({ memory, disk, storage }: Props) {
  const pct = (v: number) => (memory.total > 0 ? (v / memory.total) * 100 : 0);
  // older backends sent MemAvailable as `free`; fall back so nothing shows 0
  const available = memory.available ?? memory.free;
  const usedColor = levelColor(level(memory.usedPercent, THRESHOLDS.memUsed));
  const swapColor = levelColor(level(memory.swap.usedPercent, THRESHOLDS.swapUsed));

  const drives = (storage ?? []).filter(s => s.total > MIN_MOUNT_SIZE);
  const ioByDisk = new Map<string, DiskInfo>();
  for (const d of disk ?? []) ioByDisk.set(d.device, d);

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
      <UsageBar label="Used"      value={memory.usedPercent} total={fmtBytes(memory.used)}   gradient={USED}   labelWidth={72} valueColor={usedColor} />
      <UsageBar label="Available" value={pct(available)}     total={fmtBytes(available)}     gradient={AVAIL}  labelWidth={72} />
      <UsageBar label="Cached"    value={pct(memory.cached)} total={fmtBytes(memory.cached)} gradient={CACHED} labelWidth={72} />
      <UsageBar label="Free"      value={pct(memory.free)}   total={fmtBytes(memory.free)}   gradient={FREE}   labelWidth={72} />

      {memory.swap.total > 0 && (
        <>
          <SectionLabel>─ swap ─</SectionLabel>
          <UsageBar label="Swap" value={memory.swap.usedPercent} total={fmtBytes(memory.swap.used)} gradient={USED} labelWidth={72} valueColor={swapColor} />
        </>
      )}

      {drives.length > 0 && (
        <>
          <SectionLabel>─ disks ─</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drives.map(d => {
              const io = ioByDisk.get(parentDisk(d.device) ?? '');
              const busy = io?.busyPercent ?? 0;
              const fullColor = levelColor(level(d.usedPercent, THRESHOLDS.diskUsage));
              const busyColor = levelColor(level(busy, THRESHOLDS.diskBusy));
              return (
                <div key={d.mountpoint}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 8,
                      fontSize: 11,
                      lineHeight: '15px',
                    }}
                  >
                    <span
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={d.mountpoint}
                    >
                      <span style={{ color: fullColor ?? theme.fg, fontWeight: fullColor ? 700 : 400 }}>{d.label}</span>
                      {d.mountpoint !== '/' && d.label !== d.mountpoint && (
                        <span style={{ color: theme.graph_text }}> {d.mountpoint}</span>
                      )}
                    </span>
                    <span style={{ color: fullColor ?? theme.hi_fg, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {fmtBytes(d.used)}<span style={{ color: theme.inactive_fg }}>/</span>{fmtBytes(d.total)}
                    </span>
                  </div>
                  <UsageBar value={d.usedPercent} gradient={USED} valueColor={fullColor} />
                  {/* Always rendered when the disk has I/O data: hiding it on
                      idle samples made every row below jump up and down.
                      Idle values are dimmed instead, and each field has a
                      fixed width so changing digits don't shift the row. */}
                  {io && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 10,
                        fontSize: 10,
                        lineHeight: '13px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ ...ioField, color: io.readBytesPerSec > 0 ? theme.cached_mid : theme.graph_text }}>
                        ↓{fmtSpeed(io.readBytesPerSec)}
                      </span>
                      <span style={{ ...ioField, color: io.writeBytesPerSec > 0 ? theme.used_mid : theme.graph_text }}>
                        ↑{fmtSpeed(io.writeBytesPerSec)}
                      </span>
                      <span style={{ color: theme.graph_text }}>
                        busy{' '}
                        <span
                          style={{
                            display: 'inline-block',
                            minWidth: '4ch',
                            textAlign: 'right',
                            color: busyColor ?? (busy > 0 ? theme.fg : theme.graph_text),
                            fontWeight: busyColor ? 700 : 400,
                          }}
                        >
                          {busy.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}
