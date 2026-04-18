import { useState, useEffect, useRef, useCallback } from 'react';
import type { Metrics } from './types';
import CpuPanel from './components/CpuPanel';
import MemoryPanel from './components/MemoryPanel';
import NetworkPanel from './components/NetworkPanel';
import DiskPanel from './components/DiskPanel';
import ProcessList from './components/ProcessList';

const HISTORY = 60;
const WS_URL = import.meta.env.DEV ? 'ws://localhost:3030' : `ws://${window.location.host}`;
const INTERVALS = [100, 200, 500, 1000];

function fmtInterval(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

export default function App() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [rxHistory, setRxHistory] = useState<number[]>([]);
  const [txHistory, setTxHistory] = useState<number[]>([]);
  const [now, setNow] = useState(() => new Date());
  const wsRef = useRef<WebSocket | null>(null);

  // Clock tick every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sendInterval = useCallback((ms: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setInterval', ms }));
    }
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setIntervalMs(prev => {
          ws.send(JSON.stringify({ type: 'setInterval', ms: prev }));
          return prev;
        });
      };
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        const data: Metrics = JSON.parse(e.data);
        setMetrics(data);

        const total = data.cpu.find(c => c.name === 'cpu');
        if (total) setCpuHistory(h => [...h.slice(-(HISTORY - 1)), total.usage]);

        const iface = data.network[0];
        if (iface) {
          setRxHistory(h => [...h.slice(-(HISTORY - 1)), iface.rxBytesPerSec]);
          setTxHistory(h => [...h.slice(-(HISTORY - 1)), iface.txBytesPerSec]);
        }
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        setIntervalMs(prev => {
          const idx = INTERVALS.indexOf(prev);
          const next = INTERVALS[Math.max(0, idx - 1)];
          sendInterval(next);
          return next;
        });
      } else if (e.key === '-') {
        setIntervalMs(prev => {
          const idx = INTERVALS.indexOf(prev);
          const next = INTERVALS[Math.min(INTERVALS.length - 1, idx + 1)];
          sendInterval(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendInterval]);

  if (!metrics) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: '#555',
          letterSpacing: '0.1em',
        }}
      >
        {connected ? 'loading...' : 'connecting...'}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#cccccc',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        padding: 12,
      }}
    >
      {/* btop-style header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          padding: '0 2px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.15em' }}>
          <span style={{ color: '#ee79d3' }}>btop  </span>
          <span style={{ color: '#556cb1' }}>{metrics.hostname}</span>
        </div>
        <div style={{ fontSize: 10, color: '#888' }}>
          {fmtTime(now)}
          {'   '}
          <span style={{ color: '#404040' }}>interval: </span>
          <span style={{ color: '#ee79d3' }}>{fmtInterval(intervalMs)}</span>
          <span style={{ color: '#404040' }}> (+/-)</span>
        </div>
        <div style={{ fontSize: 10, color: connected ? '#50f095' : '#fa1e1e' }}>
          {connected ? '● live' : '○ offline'}
        </div>
      </div>

      {/* Row 1: CPU full width */}
      <div style={{ marginBottom: 10 }}>
        <CpuPanel
          cores={metrics.cpu}
          history={cpuHistory}
          temperature={metrics.temperature}
          uptime={metrics.uptime}
          cpuModel={metrics.cpuModel ?? 'CPU'}
          loadAvg={metrics.loadAvg ?? { one: 0, five: 0, fifteen: 0 }}
        />
      </div>

      {/* Row 2: left 35% (mem + net stacked) | right 65% (proc) */}
      <div style={{ display: 'grid', gridTemplateColumns: '35% 1fr', gap: 10, alignItems: 'start' }}>
        {/* Left column: mem + net */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MemoryPanel memory={metrics.memory} />
          <NetworkPanel network={metrics.network} rxHistory={rxHistory} txHistory={txHistory} />
          <DiskPanel disk={metrics.disk} />
        </div>

        {/* Right column: proc */}
        <ProcessList processes={metrics.processes} totalMem={metrics.memory.total} />
      </div>
    </div>
  );
}
