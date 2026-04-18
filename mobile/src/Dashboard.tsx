import { useState, useEffect, useRef } from 'react';
import type { Metrics } from './types';

interface Props {
  metrics: Metrics;
  onDisconnect: () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function heatColor(v: number) {
  if (v >= 80) return '#fa1e1e';
  if (v >= 60) return '#f2e266';
  return '#50f095';
}
function tempColor(c: number) {
  if (c >= 80) return '#fa1e1e';
  if (c >= 65) return '#f2e266';
  return '#50f095';
}
function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB/s`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB/s`;
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB/s`;
  return `${b} B/s`;
}
function fmtSize(b: number) {
  if (b >= 1_099_511_627_776) return `${(b / 1_099_511_627_776).toFixed(1)} TB`;
  if (b >= 1_073_741_824)     return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)         return `${(b / 1_048_576).toFixed(0)} MB`;
  return `${b} B`;
}

// ── primitives ────────────────────────────────────────────────────────────────

const card: React.CSSProperties  = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, padding: 20 };
const cardC: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '10px 12px' };
const lbl:  React.CSSProperties  = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' } as React.CSSProperties;
const lblC: React.CSSProperties  = { fontSize: 9,  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' } as React.CSSProperties;

function Bar({ value, color, thin }: { value: number; color: string; thin?: boolean }) {
  const h = thin ? 3 : 6;
  return (
    <div style={{ width: '100%', height: h, borderRadius: h, background: '#2a2a2a', marginTop: thin ? 3 : 5, flexShrink: 0 }}>
      <div style={{ height: h, borderRadius: h, width: `${Math.min(value, 100)}%`, background: color, transition: 'width 0.5s ease' }} />
    </div>
  );
}

// ── portrait cards ────────────────────────────────────────────────────────────

function BigCard({ label, value, unit, color, sub }: { label: string; value: string; unit?: string; color: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={lbl}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 8 }}>
        <span style={{ fontSize: '3.2rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: '1.1rem', fontWeight: 700, color, opacity: 0.75, marginBottom: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ ...lbl, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MemoryCard({ metrics }: { metrics: Metrics }) {
  const pct = metrics.memory.usedPercent, color = heatColor(pct);
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={lbl}>Memory</div>
        <span style={{ fontSize: '2.2rem', fontWeight: 900, color, lineHeight: 1 }}>{Math.round(pct)}%</span>
      </div>
      <Bar value={pct} color={color} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={lbl}>{(metrics.memory.used / 1_073_741_824).toFixed(1)} GB used</span>
        <span style={lbl}>{(metrics.memory.total / 1_073_741_824).toFixed(1)} GB total</span>
      </div>
    </div>
  );
}

function NetworkCard({ metrics }: { metrics: Metrics }) {
  const iface = metrics.network[0];
  if (!iface) return null;
  const rx = iface.rxBytesPerSec, tx = iface.txBytesPerSec, ref = 125_000_000;
  return (
    <div style={card}>
      <div style={lbl}>Network · {iface.iface}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <div>
          <div style={lbl}>↓ Download</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#50f095', lineHeight: 1, marginTop: 4 }}>{fmtBytes(rx)}</div>
          <Bar value={Math.min((rx / ref) * 100, 100)} color="#50f095" />
        </div>
        <div>
          <div style={lbl}>↑ Upload</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#556cb1', lineHeight: 1, marginTop: 4 }}>{fmtBytes(tx)}</div>
          <Bar value={Math.min((tx / ref) * 100, 100)} color="#556cb1" />
        </div>
      </div>
    </div>
  );
}

function StorageCard({ metrics }: { metrics: Metrics }) {
  const drives = (metrics.storage ?? []).filter(s => s.total > 1024 * 1024 * 1024);
  if (!drives.length) return null;
  return (
    <div style={card}>
      <div style={lbl}>Storage</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        {drives.map(d => {
          const color = heatColor(d.usedPercent);
          return (
            <div key={d.mountpoint}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>{d.label}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color }}>{Math.round(d.usedPercent)}%</span>
              </div>
              <Bar value={d.usedPercent} color={color} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span style={lbl}>{fmtSize(d.used)} used</span>
                <span style={lbl}>{fmtSize(d.total)} total</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessesCard({ metrics }: { metrics: Metrics }) {
  const top3 = [...metrics.processes].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div style={card}>
      <div style={lbl}>Top Processes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {top3.map((p, i) => {
          const color = heatColor(p.cpuPercent);
          return (
            <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, width: 20, flexShrink: 0 }}>{medals[i]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <Bar value={Math.min(p.cpuPercent, 100)} color={color} thin />
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color, width: 44, textAlign: 'right', flexShrink: 0 }}>{p.cpuPercent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── landscape compact cards (fill their flex container height) ────────────────

// Generic filled card wrapper
function FilledCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...cardC, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...style }}>
      {children}
    </div>
  );
}

// Top-row stat card: label + huge number + bar + sub, densely packed
function MiniStatCard({ label, value, unit, color, sub, barPct }: {
  label: string; value: string; unit?: string; color: string; sub?: string; barPct: number;
}) {
  return (
    <FilledCard>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={lblC}>{label}</span>
        {sub && <span style={{ ...lblC, color: '#666' }}>{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 2 }}>
        <span style={{ fontSize: '2.3rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: '0.95rem', fontWeight: 700, color, opacity: 0.75, marginBottom: 2 }}>{unit}</span>}
      </div>
      <Bar value={barPct} color={color} thin />
    </FilledCard>
  );
}

function MemoryCardC({ metrics }: { metrics: Metrics }) {
  const pct = metrics.memory.usedPercent, color = heatColor(pct);
  const used = (metrics.memory.used / 1_073_741_824).toFixed(1);
  const total = (metrics.memory.total / 1_073_741_824).toFixed(1);
  return (
    <MiniStatCard
      label="Memory"
      value={`${Math.round(pct)}%`}
      color={color}
      sub={`${used}/${total} GB`}
      barPct={pct}
    />
  );
}

function NetworkCardC({ metrics }: { metrics: Metrics }) {
  const iface = metrics.network[0];
  if (!iface) return null;
  const rx = iface.rxBytesPerSec, tx = iface.txBytesPerSec, ref = 125_000_000;
  return (
    <FilledCard>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={lblC}>Network</span>
        <span style={{ ...lblC, color: '#666' }}>{iface.iface}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 13, color: '#50f095', fontWeight: 900 }}>↓</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#50f095', fontVariantNumeric: 'tabular-nums' }}>{fmtBytes(rx)}</span>
      </div>
      <Bar value={Math.min((rx / ref) * 100, 100)} color="#50f095" thin />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 13, color: '#556cb1', fontWeight: 900 }}>↑</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#556cb1', fontVariantNumeric: 'tabular-nums' }}>{fmtBytes(tx)}</span>
      </div>
      <Bar value={Math.min((tx / ref) * 100, 100)} color="#556cb1" thin />
    </FilledCard>
  );
}

function StorageCardC({ metrics }: { metrics: Metrics }) {
  const drives = (metrics.storage ?? []).filter(s => s.total > 1024 * 1024 * 1024);
  return (
    <FilledCard>
      <div style={lblC}>Storage</div>
      {drives.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, color: '#333' }}>restart backend to load</span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
          {drives.map(d => {
            const color = heatColor(d.usedPercent);
            return (
              <div key={d.mountpoint}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ccc' }}>{d.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color }}>
                    {Math.round(d.usedPercent)}% · {fmtSize(d.used)}/{fmtSize(d.total)}
                  </span>
                </div>
                <Bar value={d.usedPercent} color={color} thin />
              </div>
            );
          })}
        </div>
      )}
    </FilledCard>
  );
}

function ProcessesCardC({ metrics }: { metrics: Metrics }) {
  const top3 = [...metrics.processes].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <FilledCard style={{ flex: 1 }}>
      <div style={lblC}>Top Processes</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {top3.map((p, i) => {
          const color = heatColor(p.cpuPercent);
          return (
            <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, width: 18, flexShrink: 0 }}>{medals[i]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <Bar value={Math.min(p.cpuPercent, 100)} color={color} thin />
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color, width: 38, textAlign: 'right', flexShrink: 0 }}>{p.cpuPercent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </FilledCard>
  );
}

// ── hooks ─────────────────────────────────────────────────────────────────────

function useIsLandscape() {
  const [ls, setLs] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const fn = (e: MediaQueryListEvent) => setLs(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return ls;
}

function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    type Nav = Navigator & { wakeLock?: { request(t: string): Promise<WakeLockSentinel> } };
    async function acquire() {
      try { lockRef.current = await (navigator as Nav).wakeLock?.request('screen') ?? null; } catch {}
    }
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { lockRef.current?.release(); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Dashboard({ metrics, onDisconnect }: Props) {
  const [now, setNow] = useState(() => new Date());
  const landscape = useIsLandscape();
  useWakeLock();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const totalCpu = metrics.cpu.find(c => c.name === 'cpu');
  const cpuPct   = totalCpu?.usage ?? 0;
  const temp     = metrics.temperature?.cpu ?? null;
  const timeStr  = now.toLocaleTimeString('en-GB', { hour12: false });

  if (landscape) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        background: '#111', overflow: 'hidden',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}>
        {/* Compact header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: '#ee79d3' }}>CasaOS</span>
            <span style={{ fontSize: 10, color: '#444' }}>{metrics.hostname}</span>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#50f095', boxShadow: '0 0 5px #50f095' }} />
            <span style={{ fontSize: 10, color: '#50f095' }}>live</span>
            <span style={{ fontSize: 10, color: '#2a2a2a' }}>·</span>
            <span style={{ fontSize: 10, color: '#333' }}>{metrics.uptime}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#555', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
            <button onClick={onDisconnect} style={{ background: '#222', color: '#666', border: '1px solid #333', borderRadius: 7, padding: '2px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* 4+2 grid: 4 stat cards on top, 2 wide cards below */}
        <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 1.5fr', gap: 7, padding: 7, minHeight: 0 }}>

          {/* Row 1: CPU | Temp | Memory | Network */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, minHeight: 0 }}>
            <MiniStatCard
              label="CPU"
              value={`${Math.round(cpuPct)}%`}
              color={heatColor(cpuPct)}
              sub={`Load ${(metrics.loadAvg?.one ?? 0).toFixed(2)}`}
              barPct={cpuPct}
            />
            <MiniStatCard
              label="Temp"
              value={temp !== null ? Math.round(temp).toString() : '—'}
              unit={temp !== null ? '°C' : undefined}
              color={temp !== null ? tempColor(temp) : '#444'}
              sub={temp !== null ? 'junction' : 'n/a'}
              barPct={temp !== null ? Math.min((temp / 100) * 100, 100) : 0}
            />
            <MemoryCardC metrics={metrics} />
            <NetworkCardC metrics={metrics} />
          </div>

          {/* Row 2: Storage | Processes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, minHeight: 0 }}>
            <StorageCardC metrics={metrics} />
            <ProcessesCardC metrics={metrics} />
          </div>
        </div>
      </div>
    );
  }

  // ── portrait ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#111' }} className="safe-top safe-bottom">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1e1e1e' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#ee79d3' }}>CasaOS</div>
          <div style={{ fontSize: 11, color: '#444' }}>{metrics.hostname}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#555', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
          <button onClick={onDisconnect} style={{ background: '#2a2a2a', color: '#888', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 4px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#50f095', boxShadow: '0 0 6px #50f095' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#50f095' }}>Live</span>
        <span style={{ fontSize: 11, color: '#333' }}>· uptime {metrics.uptime}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BigCard label="CPU" value={`${Math.round(cpuPct)}%`} color={heatColor(cpuPct)} sub={`Load ${(metrics.loadAvg?.one ?? 0).toFixed(2)}`} />
          <BigCard
            label="Temp"
            value={temp !== null ? Math.round(temp).toString() : '—'}
            unit={temp !== null ? '°C' : undefined}
            color={temp !== null ? tempColor(temp) : '#444'}
            sub={temp !== null ? 'CPU junction' : 'unavailable'}
          />
        </div>
        <MemoryCard metrics={metrics} />
        <StorageCard metrics={metrics} />
        <NetworkCard metrics={metrics} />
        <ProcessesCard metrics={metrics} />
      </div>
    </div>
  );
}
