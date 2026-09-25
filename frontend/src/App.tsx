import { useState, useEffect, useRef, useMemo } from 'react';
import type { Metrics, ServerMessage, Point } from './types';
import CpuPanel from './components/CpuPanel';
import MemoryPanel from './components/MemoryPanel';
import NetworkPanel from './components/NetworkPanel';
import TempPanel from './components/TempPanel';
import DockerPanel from './components/DockerPanel';
import ProcessList from './components/ProcessList';
import { theme } from './theme';
import { collectAlerts, levelColor, worst } from './thresholds';

const INTERVALS = [100, 200, 500, 1000, 2000];
const DEFAULT_INTERVAL = 1000;
const WINDOWS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '1h', ms: 3_600_000 },
];
const DEFAULT_WINDOW = 300_000;
const MAX_WINDOW_MS = 3_600_000;
const MAX_POINTS = 40_000; // per series; 100ms updates for an hour is 36k
const INTERVAL_KEY = 'monitor.intervalMs';
const WINDOW_KEY = 'monitor.windowMs';
const RECONNECT_MS = 2000;
const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3030'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

interface History {
  cpu: Point[];
  temp: Point[];
  rx: Point[];
  tx: Point[];
}
const EMPTY_HISTORY: History = { cpu: [], temp: [], rx: [], tx: [] };

// Append a sample and drop anything older than the largest window.
function push(arr: Point[], t: number, v: number): Point[] {
  const cutoff = t - MAX_WINDOW_MS - 5000;
  let start = 0;
  while (start < arr.length && arr[start].t < cutoff) start++;
  if (arr.length - start >= MAX_POINTS) start = arr.length - MAX_POINTS + 1;
  const out = arr.slice(start);
  out.push({ t, v });
  return out;
}

function loadChoice(key: string, allowed: number[], fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveChoice(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {}
}

function stepInterval(ms: number, dir: -1 | 1) {
  const i = INTERVALS.indexOf(ms);
  const from = i === -1 ? INTERVALS.indexOf(DEFAULT_INTERVAL) : i;
  return INTERVALS[Math.max(0, Math.min(INTERVALS.length - 1, from + dir))];
}

function fmtInterval(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${ms / 1000}s`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

export default function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [intervalMs, setIntervalMs] = useState(() => loadChoice(INTERVAL_KEY, INTERVALS, DEFAULT_INTERVAL));
  const [windowMs, setWindowMs] = useState(() => loadChoice(WINDOW_KEY, WINDOWS.map(w => w.ms), DEFAULT_WINDOW));
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [now, setNow] = useState(() => new Date());
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // One socket for the lifetime of the component. `disposed` stops the close
  // handler from scheduling a reconnect after unmount; without it a second
  // live socket leaked (StrictMode's double mount made that the norm in dev).
  useEffect(() => {
    let disposed = false;
    let reconnect: number | undefined;

    function connect() {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'setInterval', ms: intervalRef.current }));
        ws.send(JSON.stringify({ type: 'getHistory' }));
      };
      ws.onmessage = e => {
        if (disposed) return;
        const msg: ServerMessage = JSON.parse(e.data);
        if (msg.type === 'history') {
          // Server keeps an hour at 1s; it replaces whatever we had so a
          // reconnect never leaves a hole in the graphs.
          const cpu: Point[] = [];
          const temp: Point[] = [];
          const rx: Point[] = [];
          const tx: Point[] = [];
          for (const p of msg.points) {
            cpu.push({ t: p.t, v: p.cpu });
            if (p.temp !== null) temp.push({ t: p.t, v: p.temp });
            rx.push({ t: p.t, v: p.rx });
            tx.push({ t: p.t, v: p.tx });
          }
          setHistory({ cpu, temp, rx, tx });
          return;
        }
        const data = msg;
        setMetrics(data);
        const t = data.timestamp;
        const total = data.cpu.find(c => c.name === 'cpu');
        const iface = data.network[0];
        const temp = data.temperature?.cpu;
        setHistory(h => ({
          cpu: total ? push(h.cpu, t, total.usage) : h.cpu,
          rx: iface ? push(h.rx, t, iface.rxBytesPerSec) : h.rx,
          tx: iface ? push(h.tx, t, iface.txBytesPerSec) : h.tx,
          temp: temp !== undefined ? push(h.temp, t, temp) : h.temp,
        }));
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        reconnect = window.setTimeout(connect, RECONNECT_MS);
      };
    }

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnect);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Push the chosen interval to the server whenever it changes.
  useEffect(() => {
    saveChoice(INTERVAL_KEY, intervalMs);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'setInterval', ms: intervalMs }));
    }
  }, [intervalMs]);

  useEffect(() => saveChoice(WINDOW_KEY, windowMs), [windowMs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '+' || e.key === '=') setIntervalMs(p => stepInterval(p, -1));
      else if (e.key === '-') setIntervalMs(p => stepInterval(p, 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const alerts = useMemo(() => (metrics ? collectAlerts(metrics) : []), [metrics]);

  if (!metrics) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.graph_text,
          letterSpacing: '0.1em',
        }}
      >
        {connected ? 'loading…' : 'connecting…'}
      </div>
    );
  }

  const alertColor = levelColor(worst(alerts.map(a => a.level)));

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span style={{ color: theme.proc_misc, fontWeight: 700 }}>btop++ </span>
          <span style={{ color: theme.hi_fg }}>on </span>
          <span style={{ color: theme.title, fontWeight: 700 }}>{metrics.hostname}</span>
        </div>

        <div className="header-controls">
          <span style={{ color: theme.fg }}>{fmtTime(now)}</span>
          <span style={{ color: theme.graph_text }}>update</span>
          <div className="interval-group" title="keyboard: + faster, - slower">
            {INTERVALS.map(ms => (
              <button
                key={ms}
                type="button"
                className={'interval-btn' + (ms === intervalMs ? ' active' : '')}
                onClick={() => setIntervalMs(ms)}
              >
                {fmtInterval(ms)}
              </button>
            ))}
          </div>
          <span style={{ color: theme.graph_text }}>window</span>
          <div className="interval-group" title="time span shown in the graphs">
            {WINDOWS.map(w => (
              <button
                key={w.ms}
                type="button"
                className={'interval-btn' + (w.ms === windowMs ? ' active' : '')}
                onClick={() => setWindowMs(w.ms)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {alerts.length > 0 && (
            <span
              title={alerts.map(a => a.text).join('\n')}
              style={{ color: alertColor, fontWeight: 700, cursor: 'help' }}
            >
              ⚠ {alerts[0].text}
              {alerts.length > 1 && <span style={{ fontWeight: 400 }}> +{alerts.length - 1}</span>}
            </span>
          )}
          <span style={{ color: connected ? theme.cpu_start : theme.cpu_end }}>
            {connected ? '● live' : '○ reconnecting…'}
          </span>
        </div>
      </header>

      <CpuPanel
        cores={metrics.cpu}
        freq={metrics.cpuFreq ?? null}
        history={history.cpu}
        windowMs={windowMs}
        uptime={metrics.uptime}
        cpuModel={metrics.cpuModel ?? 'CPU'}
        loadAvg={metrics.loadAvg ?? { one: 0, five: 0, fifteen: 0 }}
      />

      <div className="main-grid">
        <MemoryPanel memory={metrics.memory} disk={metrics.disk} storage={metrics.storage ?? []} />
        <div className="mid-col">
          <NetworkPanel network={metrics.network} rxHistory={history.rx} txHistory={history.tx} windowMs={windowMs} />
          <TempPanel temperature={metrics.temperature} cooling={metrics.cooling ?? null} history={history.temp} windowMs={windowMs} />
        </div>
        <div className="right-col">
          {metrics.docker !== undefined && <DockerPanel containers={metrics.docker} />}
          <ProcessList processes={metrics.processes} totalMem={metrics.memory.total} />
        </div>
      </div>
    </div>
  );
}
