import { useState, useEffect, useRef, useMemo } from 'react';
import type { Metrics, ServerMessage, Point } from './types';
import CpuPanel from './components/CpuPanel';
import MemoryPanel from './components/MemoryPanel';
import NetworkPanel from './components/NetworkPanel';
import type { NetSeries } from './components/NetworkPanel';
import TempPanel from './components/TempPanel';
import DockerPanel from './components/DockerPanel';
import ProcessList from './components/ProcessList';
import { theme } from './theme';
import { collectAlerts, levelColor, worst } from './thresholds';

const INTERVALS = [100, 200, 500, 1000, 2000];
const DEFAULT_INTERVAL = 1000;
// While the tab is in the background nobody is looking at 10 frames a second.
const HIDDEN_INTERVAL = 5000;
const WINDOWS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '1h', ms: 3_600_000 },
];
const DEFAULT_WINDOW = 300_000;
const MAX_WINDOW_MS = 3_600_000;
const MAX_POINTS = 40_000; // per series; 100ms updates for an hour is 36k
const TRIM_EVERY = 1024;   // stale points are cut in batches, not one per sample
const INTERVAL_KEY = 'monitor.intervalMs';
const WINDOW_KEY = 'monitor.windowMs';
const IFACE_KEY = 'monitor.netIface';
const TOKEN_KEY = 'monitor.token';
const RECONNECT_MS = 2000;

// MONITOR_TOKEN on the server: open the page once as /?token=<value>. The
// token is remembered in this browser and removed from the address bar so it
// doesn't end up in bookmarks or screenshots. /?token= (empty) forgets it.
function takeToken(): string | null {
  try {
    const url = new URL(location.href);
    const t = url.searchParams.get('token');
    if (t !== null) {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
      url.searchParams.delete('token');
      history.replaceState(null, '', url.toString());
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
const TOKEN = takeToken();
const WS_URL =
  (import.meta.env.DEV ? 'ws://localhost:3030' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`) +
  (TOKEN ? `/?token=${encodeURIComponent(TOKEN)}` : '');

// Graph series live in a ref and are appended in place; copying four arrays
// of up to 36k points on every 100ms frame was most of the page's work.
// A render is triggered by the metrics state update that follows each append.
interface Series {
  cpu: Point[];
  temp: Point[];
  net: Map<string, NetSeries>;
}

function append(arr: Point[], t: number, v: number) {
  arr.push({ t, v });
  if (arr.length % TRIM_EVERY !== 0 && arr.length <= MAX_POINTS + TRIM_EVERY) return;
  const cutoff = t - MAX_WINDOW_MS - 5000;
  let start = 0;
  while (start < arr.length && arr[start].t < cutoff) start++;
  start = Math.max(start, arr.length - MAX_POINTS);
  if (start > 0) arr.splice(0, start);
}

function netSeries(s: Series, iface: string) {
  let n = s.net.get(iface);
  if (!n) {
    n = { rx: [], tx: [] };
    s.net.set(iface, n);
  }
  return n;
}

function loadChoice(key: string, allowed: number[], fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveChoice(key: string, v: number | string) {
  try {
    localStorage.setItem(key, String(v));
  } catch {}
}

function loadString(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
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

// Own component so the once-a-second tick doesn't re-render every panel.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span style={{ color: theme.fg }}>{now.toLocaleTimeString('en-GB', { hour12: false })}</span>;
}

export default function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [failedConnects, setFailedConnects] = useState(0); // before the first frame
  const [intervalMs, setIntervalMs] = useState(() => loadChoice(INTERVAL_KEY, INTERVALS, DEFAULT_INTERVAL));
  const [windowMs, setWindowMs] = useState(() => loadChoice(WINDOW_KEY, WINDOWS.map(w => w.ms), DEFAULT_WINDOW));
  const [netIface, setNetIface] = useState<string | null>(() => loadString(IFACE_KEY));
  const [, setHistoryVersion] = useState(0); // bumped when a history message replaces the series
  const series = useRef<Series>({ cpu: [], temp: [], net: new Map() });
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  const sendInterval = (ws: WebSocket) => {
    const ms = document.hidden ? HIDDEN_INTERVAL : intervalRef.current;
    ws.send(JSON.stringify({ type: 'setInterval', ms }));
  };

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
      let opened = false;

      ws.onopen = () => {
        if (disposed) return;
        opened = true;
        setConnected(true);
        setFailedConnects(0);
        sendInterval(ws);
        ws.send(JSON.stringify({ type: 'getHistory' }));
      };
      ws.onmessage = e => {
        if (disposed) return;
        const msg: ServerMessage = JSON.parse(e.data);
        const s = series.current;
        if (msg.type === 'history') {
          // Server keeps an hour at 1s; it replaces whatever we had so a
          // reconnect never leaves a hole in the graphs. Its rx/tx are for
          // the main interface only; others fill in from live frames.
          s.cpu = [];
          s.temp = [];
          const rx: Point[] = [];
          const tx: Point[] = [];
          for (const p of msg.points) {
            s.cpu.push({ t: p.t, v: p.cpu });
            if (p.temp !== null) s.temp.push({ t: p.t, v: p.temp });
            rx.push({ t: p.t, v: p.rx });
            tx.push({ t: p.t, v: p.tx });
          }
          if (msg.iface) s.net.set(msg.iface, { rx, tx });
          setHistoryVersion(v => v + 1);
          return;
        }
        const data = msg;
        const t = data.timestamp;
        const total = data.cpu.find(c => c.name === 'cpu');
        if (total) append(s.cpu, t, total.usage);
        const temp = data.temperature?.cpu;
        if (temp !== undefined) append(s.temp, t, temp);
        for (const n of data.network) {
          const ns = netSeries(s, n.iface);
          append(ns.rx, t, n.rxBytesPerSec);
          append(ns.tx, t, n.txBytesPerSec);
        }
        setMetrics(data);
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        // The browser hides why a handshake failed (401/403 look like a dead server).
        if (!opened) setFailedConnects(n => n + 1);
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

  // Push the chosen interval to the server whenever it changes, and slow
  // down while the tab is hidden.
  useEffect(() => {
    saveChoice(INTERVAL_KEY, intervalMs);
    const push = () => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) sendInterval(ws);
    };
    push();
    document.addEventListener('visibilitychange', push);
    return () => document.removeEventListener('visibilitychange', push);
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
        <div style={{ textAlign: 'center', lineHeight: '20px' }}>
          {connected ? 'loading…' : 'connecting…'}
          {!connected && failedConnects >= 3 && (
            <div style={{ fontSize: 11, letterSpacing: 0, marginTop: 8 }}>
              the server is not answering or refused the connection
              <br />
              if MONITOR_TOKEN is set on the server, open this page as /?token=&lt;value&gt;
            </div>
          )}
        </div>
      </div>
    );
  }

  const alertColor = levelColor(worst(alerts.map(a => a.level)));
  // The picked interface while it exists, else the server's main one (listed first).
  const shownIface = metrics.network.find(n => n.iface === netIface) ?? metrics.network[0];
  const pickIface = (iface: string) => {
    // Picking the main interface clears the choice, so it follows the server again.
    const next = iface === metrics.network[0]?.iface ? null : iface;
    setNetIface(next);
    try {
      if (next) localStorage.setItem(IFACE_KEY, next);
      else localStorage.removeItem(IFACE_KEY);
    } catch {}
  };
  const s = series.current;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <span style={{ color: theme.proc_misc, fontWeight: 700 }}>btop++ </span>
          <span style={{ color: theme.hi_fg }}>on </span>
          <span style={{ color: theme.title, fontWeight: 700 }}>{metrics.hostname}</span>
        </div>

        <div className="header-controls">
          <Clock />
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
        history={s.cpu}
        windowMs={windowMs}
        uptime={metrics.uptime}
        cpuModel={metrics.cpuModel ?? 'CPU'}
        loadAvg={metrics.loadAvg ?? { one: 0, five: 0, fifteen: 0 }}
      />

      <div className="main-grid">
        <MemoryPanel memory={metrics.memory} disk={metrics.disk} storage={metrics.storage ?? []} />
        <div className="mid-col">
          <NetworkPanel
            network={metrics.network}
            shown={shownIface}
            primary={metrics.network[0]?.iface}
            history={shownIface ? s.net.get(shownIface.iface) : undefined}
            onPick={pickIface}
            windowMs={windowMs}
          />
          <TempPanel temperature={metrics.temperature} cooling={metrics.cooling ?? null} history={s.temp} windowMs={windowMs} />
        </div>
        <div className="right-col">
          {metrics.docker !== undefined && <DockerPanel containers={metrics.docker} />}
          <ProcessList processes={metrics.processes} totalMem={metrics.memory.total} />
        </div>
      </div>
    </div>
  );
}
