import { useState, useEffect, useRef } from 'react';
import type { Metrics } from './types';
import Dashboard from './Dashboard';

const STORAGE_KEY = 'casaos_ws_host';

function getDefaultHost() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

type Phase = 'setup' | 'connecting' | 'live' | 'error';

export default function App() {
  const [host, setHost] = useState(getDefaultHost);
  const [inputHost, setInputHost] = useState(getDefaultHost);
  const [phase, setPhase] = useState<Phase>(host ? 'connecting' : 'setup');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  function connect(target: string) {
    const trimmed = target.trim().replace(/^wss?:\/\//, '');
    if (!trimmed) return;

    wsRef.current?.close();

    const url = `ws://${trimmed}`;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setHost(trimmed);
    setPhase('connecting');
    setMetrics(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        setPhase('error');
        setErrorMsg(`Could not reach ${url}`);
      }
    }, 6000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(JSON.stringify({ type: 'setInterval', ms: 1000 }));
      setPhase('live');
    };

    ws.onmessage = (e) => {
      setMetrics(JSON.parse(e.data) as Metrics);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (phase === 'live') {
        setPhase('error');
        setErrorMsg('Connection lost');
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      ws.close();
      setPhase('error');
      setErrorMsg(`Could not reach ${url}`);
    };
  }

  // Auto-connect if we have a saved host
  useEffect(() => {
    if (host) connect(host);
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDisconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    setPhase('setup');
    setMetrics(null);
    setInputHost(host);
  }

  if (phase === 'live' && metrics) {
    return <Dashboard metrics={metrics} onDisconnect={handleDisconnect} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom" style={{ background: '#111' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-4xl font-black tracking-tight mb-1" style={{ color: '#ee79d3' }}>
            CasaOS
          </div>
          <div className="text-sm font-medium tracking-widest uppercase" style={{ color: '#555' }}>
            Monitor
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#666' }}>
            Server Address
          </label>
          <input
            type="text"
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
            spellCheck={false}
          />
          <p className="mt-2 text-xs" style={{ color: '#444' }}>
            e.g. 192.168.1.100:3030
          </p>

          {phase === 'error' && (
            <div className="mt-4 rounded-xl px-4 py-3 text-sm font-medium" style={{ background: '#2a1515', color: '#fa6a6a', border: '1px solid #3a1a1a' }}>
              {errorMsg}
            </div>
          )}

          <button
            onClick={() => connect(inputHost)}
            disabled={phase === 'connecting'}
            className="mt-5 w-full rounded-xl py-4 text-base font-bold transition-opacity active:opacity-70"
            style={{
              background: phase === 'connecting' ? '#2a2a2a' : '#ee79d3',
              color: phase === 'connecting' ? '#555' : '#111',
              cursor: phase === 'connecting' ? 'default' : 'pointer',
            }}
          >
            {phase === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#333' }}>
          Make sure the backend is running on port 3030
        </p>
      </div>
    </div>
  );
}
