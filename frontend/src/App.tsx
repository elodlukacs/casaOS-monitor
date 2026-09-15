import { useState, useEffect, useRef } from 'react';
import type { Metrics } from './types';
import CpuPanel from './components/CpuPanel';
import MemoryPanel from './components/MemoryPanel';
import NetworkPanel from './components/NetworkPanel';
import ProcessList from './components/ProcessList';
import { theme } from './theme';

const HISTORY = 900; // samples kept per graph; the graph shows as many as fit
const INTERVALS = [100, 200, 500, 1000, 2000];
const DEFAULT_INTERVAL = 1000;
const INTERVAL_KEY = 'monitor.intervalMs';
const RECONNECT_MS = 2000;
const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3030'
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

interface History {
  cpu: number[];
  rx: number[];
  tx: number[];
}

function push(arr: number[], v: number) {
  const base = arr.length >= HISTORY ? arr.slice(arr.length - HISTORY + 1) : arr;
  return base.concat(v);
}

function loadInterval() {
  try {
    const v = Number(localStorage.getItem(INTERVAL_KEY));
    return INTERVALS.includes(v) ? v : DEFAULT_INTERVAL;
  } catch {
    return DEFAULT_INTERVAL;
  }
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
  const [intervalMs, setIntervalMs] = useState(loadInterval);
  const [history, setHistory] = useState<History>({ cpu: [], rx: [], tx: [] });
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
      };
      ws.onmessage = e => {
        if (disposed) return;
        const data: Metrics = JSON.parse(e.data);
        setMetrics(data);
        const total = data.cpu.find(c => c.name === 'cpu');
        const iface = data.network[0];
        setHistory(h => ({
          cpu: total ? push(h.cpu, total.usage) : h.cpu,
          rx: iface ? push(h.rx, iface.rxBytesPerSec) : h.rx,
          tx: iface ? push(h.tx, iface.txBytesPerSec) : h.tx,
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
    try {
      localStorage.setItem(INTERVAL_KEY, String(intervalMs));
    } catch {}
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'setInterval', ms: intervalMs }));
    }
  }, [intervalMs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '+' || e.key === '=') setIntervalMs(p => stepInterval(p, -1));
      else if (e.key === '-') setIntervalMs(p => stepInterval(p, 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
        </div>

        <div style={{ color: connected ? theme.cpu_start : theme.cpu_end }}>
          {connected ? '● live' : '○ reconnecting…'}
        </div>
      </header>

      <CpuPanel
        cores={metrics.cpu}
        history={history.cpu}
        temperature={metrics.temperature}
        uptime={metrics.uptime}
        cpuModel={metrics.cpuModel ?? 'CPU'}
        loadAvg={metrics.loadAvg ?? { one: 0, five: 0, fifteen: 0 }}
      />

      <div className="main-grid">
        <MemoryPanel memory={metrics.memory} disk={metrics.disk} storage={metrics.storage ?? []} />
        <NetworkPanel network={metrics.network} rxHistory={history.rx} txHistory={history.tx} />
        <ProcessList processes={metrics.processes} totalMem={metrics.memory.total} />
      </div>
    </div>
  );
}
