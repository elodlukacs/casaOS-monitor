import { useState, useEffect } from 'react';
import type { Metrics } from './types';

interface Props {
  metrics: Metrics;
  onDisconnect: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${Math.round(n)}%`;
}

function fmtBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB/s`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB/s`;
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB/s`;
  return `${b} B/s`;
}


function heatColor(pct: number): string {
  if (pct >= 80) return '#fa1e1e';
  if (pct >= 60) return '#f2e266';
  return '#50f095';
}

function tempColor(c: number): string {
  if (c >= 80) return '#fa1e1e';
  if (c >= 65) return '#f2e266';
  return '#50f095';
}

// ── sub-components ────────────────────────────────────────────────────────────

function BigCard({ label, value, unit, color, sub }: {
  label: string;
  value: string;
  unit?: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col justify-between" style={{ background: '#1a1a1a', border: `1px solid #2a2a2a` }}>
      <span className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#555' }}>
        {label}
      </span>
      <div className="flex items-end gap-1">
        <span className="font-black leading-none" style={{ fontSize: '3.5rem', color, lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span className="font-semibold mb-1" style={{ fontSize: '1.2rem', color, opacity: 0.75 }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <span className="mt-2 text-xs font-medium" style={{ color: '#555' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full rounded-full h-1.5 mt-3" style={{ background: '#2a2a2a' }}>
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%`, background: color }}
      />
    </div>
  );
}

function NetworkCard({ metrics }: { metrics: Metrics }) {
  const iface = metrics.network[0];
  if (!iface) return null;

  const rx = iface.rxBytesPerSec;
  const tx = iface.txBytesPerSec;
  const maxSpeed = 125_000_000; // 1 Gbps reference
  const rxPct = Math.min((rx / maxSpeed) * 100, 100);
  const txPct = Math.min((tx / maxSpeed) * 100, 100);

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
        Network · {iface.iface}
      </span>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: '#555' }}>↓ Download</div>
          <div className="font-black" style={{ fontSize: '1.6rem', color: '#50f095', lineHeight: 1 }}>
            {fmtBytes(rx)}
          </div>
          <Bar value={rxPct} color="#50f095" />
        </div>
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: '#555' }}>↑ Upload</div>
          <div className="font-black" style={{ fontSize: '1.6rem', color: '#556cb1', lineHeight: 1 }}>
            {fmtBytes(tx)}
          </div>
          <Bar value={txPct} color="#556cb1" />
        </div>
      </div>
    </div>
  );
}

function fmtSize(b: number): string {
  if (b >= 1_099_511_627_776) return `${(b / 1_099_511_627_776).toFixed(1)} TB`;
  if (b >= 1_073_741_824)     return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)         return `${(b / 1_048_576).toFixed(0)} MB`;
  return `${b} B`;
}

function StorageCard({ metrics }: { metrics: Metrics }) {
  const drives = (metrics.storage ?? []).filter(s => s.total > 100 * 1024 * 1024 * 1024);
  if (drives.length === 0) return null;

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
        Storage
      </span>
      <div className="mt-4 flex flex-col gap-4">
        {drives.map(drive => {
          const color = heatColor(drive.usedPercent);
          return (
            <div key={drive.mountpoint}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold" style={{ color: '#ccc' }}>
                  {drive.label}
                </span>
                <span className="font-black text-sm" style={{ color }}>
                  {Math.round(drive.usedPercent)}%
                </span>
              </div>
              <Bar value={drive.usedPercent} color={color} />
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: '#444' }}>
                  {fmtSize(drive.used)} used
                </span>
                <span className="text-xs" style={{ color: '#444' }}>
                  {fmtSize(drive.total)} total
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessesCard({ metrics }: { metrics: Metrics }) {
  const top3 = [...metrics.processes]
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, 3);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="rounded-2xl p-5" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
        Top Processes
      </span>
      <div className="mt-4 flex flex-col gap-3">
        {top3.map((proc, i) => {
          const cpu = proc.cpuPercent;
          const color = heatColor(cpu);
          return (
            <div key={proc.pid} className="flex items-center gap-3">
              <span className="text-base w-6 flex-shrink-0">{medals[i]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate text-sm" style={{ color: '#ddd' }}>
                  {proc.name}
                </div>
                <div className="w-full rounded-full h-1 mt-1" style={{ background: '#2a2a2a' }}>
                  <div
                    className="h-1 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(cpu, 100)}%`, background: color }}
                  />
                </div>
              </div>
              <span className="font-black text-sm flex-shrink-0 w-12 text-right" style={{ color }}>
                {cpu.toFixed(1)}%
              </span>
            </div>
          );
        })}
        {top3.length === 0 && (
          <div className="text-sm" style={{ color: '#444' }}>No processes</div>
        )}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Dashboard({ metrics, onDisconnect }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const totalCpu = metrics.cpu.find(c => c.name === 'cpu');
  const cpuPct   = totalCpu?.usage ?? 0;
  const temp     = metrics.temperature?.cpu ?? null;
  const memPct   = metrics.memory.usedPercent;

  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

  return (
    <div
      className="flex flex-col safe-top safe-bottom"
      style={{ minHeight: '100vh', background: '#111' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #1e1e1e' }}
      >
        <div>
          <div className="font-black text-base tracking-tight" style={{ color: '#ee79d3' }}>
            CasaOS
          </div>
          <div className="text-xs font-medium" style={{ color: '#444' }}>
            {metrics.hostname}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold tabular-nums" style={{ color: '#555' }}>
            {timeStr}
          </div>
          <button
            onClick={onDisconnect}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold active:opacity-60"
            style={{ background: '#2a2a2a', color: '#888' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Connected dot */}
      <div className="flex items-center gap-2 px-5 pt-3 pb-1 flex-shrink-0">
        <div className="w-2 h-2 rounded-full" style={{ background: '#50f095', boxShadow: '0 0 6px #50f095' }} />
        <span className="text-xs font-medium" style={{ color: '#50f095' }}>Live</span>
        <span className="text-xs ml-1" style={{ color: '#333' }}>· uptime {metrics.uptime}</span>
      </div>

      {/* Scrollable cards */}
      <div className="flex-1 px-4 pt-3 pb-6 flex flex-col gap-3">
        {/* CPU + Temp — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <BigCard
            label="CPU"
            value={pct(cpuPct)}
            color={heatColor(cpuPct)}
            sub={`Load ${(metrics.loadAvg?.one ?? 0).toFixed(2)}`}
          />
          {temp !== null ? (
            <BigCard
              label="Temp"
              value={Math.round(temp).toString()}
              unit="°C"
              color={tempColor(temp)}
              sub="CPU junction"
            />
          ) : (
            <BigCard
              label="Temp"
              value="—"
              color="#444"
              sub="unavailable"
            />
          )}
        </div>

        {/* Memory — full width */}
        <div className="rounded-2xl p-5" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <div className="flex items-end justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#555' }}>
              Memory
            </span>
            <span className="font-black" style={{ fontSize: '2.4rem', color: heatColor(memPct), lineHeight: 1 }}>
              {pct(memPct)}
            </span>
          </div>
          <Bar value={memPct} color={heatColor(memPct)} />
          <div className="flex justify-between mt-2">
            <span className="text-xs" style={{ color: '#444' }}>
              {(metrics.memory.used / 1_073_741_824).toFixed(1)} GB used
            </span>
            <span className="text-xs" style={{ color: '#444' }}>
              {(metrics.memory.total / 1_073_741_824).toFixed(1)} GB total
            </span>
          </div>
        </div>

        {/* Storage */}
        <StorageCard metrics={metrics} />

        {/* Network */}
        <NetworkCard metrics={metrics} />

        {/* Top 3 Processes */}
        <ProcessesCard metrics={metrics} />
      </div>
    </div>
  );
}
