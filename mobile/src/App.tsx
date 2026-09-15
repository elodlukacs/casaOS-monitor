import { useState, useEffect, useRef } from 'react';
import type { Metrics } from './types';
import Dashboard from './Dashboard';

const STORAGE_KEY = 'casaos_ws_host';
const HISTORY = 300;              // CPU samples kept for the graph
const CONNECT_TIMEOUT_MS = 6000;  // give up on a fresh connect after this
const RETRY_MIN_MS = 1000;        // reconnect backoff bounds
const RETRY_MAX_MS = 10000;
const STALE_MS = 8000;            // no frame for this long → socket is dead

type Phase = 'setup' | 'connecting' | 'live' | 'error';

function normalizeHost(raw: string) {
  return raw.trim().replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
}

export default function App() {
  const [host, setHost] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [inputHost, setInputHost] = useState(host);
  const [phase, setPhase] = useState<Phase>(host ? 'connecting' : 'setup');
  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const hostRef = useRef(host);       // target we should be connected to
  const wasLiveRef = useRef(false);   // ever received data for this host
  const attemptRef = useRef(0);       // consecutive failed reconnects
  const retryRef = useRef<number | undefined>(undefined);
  const lastFrameRef = useRef(0);

  function dropSocket() {
    window.clearTimeout(retryRef.current);
    retryRef.current = undefined;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    }
  }

  function scheduleRetry() {
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attemptRef.current);
    attemptRef.current += 1;
    retryRef.current = window.setTimeout(() => connect(hostRef.current, true), delay);
  }

  function connect(target: string, isRetry = false) {
    const trimmed = normalizeHost(target);
    if (!trimmed) return;
    dropSocket();

    hostRef.current = trimmed;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setHost(trimmed);
    setConnected(false);
    if (!isRetry) {
      wasLiveRef.current = false;
      attemptRef.current = 0;
      setPhase('connecting');
      setMetrics(null);
      setCpuHistory([]);
    }

    const url = `ws://${trimmed}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setPhase('error');
      setErrorMsg(`Invalid address: ${trimmed}`);
      return;
    }
    wsRef.current = ws;

    let opened = false;
    const timeout = window.setTimeout(() => {
      if (!opened) ws.close(); // falls through to onclose
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      opened = true;
      window.clearTimeout(timeout);
      attemptRef.current = 0;
      lastFrameRef.current = Date.now();
      ws.send(JSON.stringify({ type: 'setInterval', ms: 1000 }));
      setConnected(true);
      setPhase('live');
    };

    ws.onmessage = e => {
      const data = JSON.parse(e.data) as Metrics;
      lastFrameRef.current = Date.now();
      wasLiveRef.current = true;
      setMetrics(data);
      const total = data.cpu.find(c => c.name === 'cpu');
      if (total) setCpuHistory(h => [...h.slice(-(HISTORY - 1)), total.usage]);
    };

    ws.onerror = () => ws.close();

    ws.onclose = () => {
      window.clearTimeout(timeout);
      if (wsRef.current !== ws) return; // superseded or closed on purpose
      wsRef.current = null;
      setConnected(false);
      if (!wasLiveRef.current) {
        // Never got data from this host: most likely a wrong address. Stop.
        setPhase('error');
        setErrorMsg(`Could not reach ${url}`);
        return;
      }
      // Was live before: keep the dashboard (stale) and retry in the background.
      scheduleRetry();
    };
  }

  // Connect on start if a host is saved. Cleanup nulls the handlers first so
  // StrictMode's double mount cannot leave a second socket behind.
  useEffect(() => {
    if (hostRef.current) connect(hostRef.current);
    return () => dropSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android freezes the WebView in the background; the socket may be dead
  // without ever firing close. On resume (and periodically) check for stale
  // frames and reconnect right away instead of waiting for backoff.
  useEffect(() => {
    function check() {
      if (!hostRef.current || !wasLiveRef.current) return;
      const stale = Date.now() - lastFrameRef.current > STALE_MS;
      const dead = !wsRef.current && retryRef.current === undefined;
      if (stale || dead) {
        attemptRef.current = 0;
        connect(hostRef.current, true);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible' && wsRef.current) check();
    }, STALE_MS / 2);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDisconnect() {
    dropSocket();
    hostRef.current = '';
    wasLiveRef.current = false;
    setConnected(false);
    setPhase('setup');
    setMetrics(null);
    setCpuHistory([]);
    setInputHost(host);
  }

  if (phase === 'live' && metrics) {
    return (
      <Dashboard
        metrics={metrics}
        connected={connected}
        cpuHistory={cpuHistory}
        onDisconnect={handleDisconnect}
      />
    );
  }

  const connecting = phase === 'connecting';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom" style={{ background: '#111' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-4xl font-black tracking-tight mb-1" style={{ color: '#ee79d3' }}>
            CasaOS
          </div>
          <div className="text-sm font-medium tracking-widest uppercase" style={{ color: '#555' }}>
            Monitor
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <label htmlFor="host" className="block text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#666' }}>
            Server Address
          </label>
          <input
            id="host"
            type="text"
            inputMode="url"
            enterKeyHint="go"
            value={inputHost}
            onChange={e => setInputHost(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect(inputHost)}
            placeholder="192.168.1.100:3030"
            className="w-full rounded-xl px-4 py-4 text-base font-medium outline-none"
            style={{
              background: '#0d0d0d',
              border: '1px solid #333',
              color: '#e5e5e5',
              letterSpacing: '0.02em',
            }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={connecting}
          />
          <p className="mt-2 text-xs" style={{ color: '#444' }}>
            host or IP and port, e.g. 192.168.1.100:3030
          </p>

          {phase === 'error' && (
            <div className="mt-4 rounded-xl px-4 py-3 text-sm font-medium" style={{ background: '#2a1515', color: '#fa6a6a', border: '1px solid #3a1a1a' }}>
              {errorMsg}
            </div>
          )}

          <button
            onClick={() => connect(inputHost)}
            disabled={connecting || !normalizeHost(inputHost)}
            className="mt-5 w-full rounded-xl py-4 text-base font-bold transition-opacity active:opacity-70 disabled:opacity-60"
            style={{
              background: connecting ? '#2a2a2a' : '#ee79d3',
              color: connecting ? '#555' : '#111',
              cursor: connecting ? 'default' : 'pointer',
            }}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#333' }}>
          Make sure the backend is running on port 3030
        </p>
      </div>
    </div>
  );
}
