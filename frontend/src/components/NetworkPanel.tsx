import { useState } from 'react';
import type { NetworkInterface, Point } from '../types';
import Panel from './Panel';
import Graph from './Graph';
import { theme } from '../theme';

function fmtBits(bps: number) {
  const bits = bps * 8;
  if (bits >= 1e9) return (bits / 1e9).toFixed(2) + ' Gbps';
  if (bits >= 1e6) return (bits / 1e6).toFixed(2) + ' Mbps';
  if (bits >= 1e3) return (bits / 1e3).toFixed(1) + ' Kbps';
  return bits.toFixed(0) + ' bps';
}

function fmtBytes(bps: number) {
  if (bps >= 1073741824) return (bps / 1073741824).toFixed(2) + ' GiB/s';
  if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MiB/s';
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KiB/s';
  return bps.toFixed(0) + ' B/s';
}

function fmtScale(max: number) {
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (max >= 1073741824) return trim((max / 1073741824).toFixed(1)) + ' GiB/s';
  if (max >= 1048576) return trim((max / 1048576).toFixed(1)) + ' MiB/s';
  if (max >= 1024) return trim((max / 1024).toFixed(1)) + ' KiB/s';
  return max.toFixed(0) + ' B/s';
}

// Round an auto scale up to a readable step (1, 1.5, 2, 3, 4, 5, 6, 8, 10 ...)
// in the current binary unit, so the axis label is never "37.2 MiB/s".
const NICE = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1024];
function niceMax(raw: number) {
  const v = Math.max(raw, 1024);
  const n = Math.floor(Math.log(v) / Math.log(1024));
  const unit = 1024 ** n;
  const m = v / unit;
  return (NICE.find(x => x >= m) ?? 1024) * unit;
}

const DL: [string, string, string] = [theme.download_start, theme.download_mid, theme.download_end];
const UL: [string, string, string] = [theme.upload_start, theme.upload_mid, theme.upload_end];

export interface NetSeries {
  rx: Point[];
  tx: Point[];
}

const EMPTY: NetSeries = { rx: [], tx: [] };

interface Props {
  network: NetworkInterface[];
  shown: NetworkInterface | undefined;  // interface graphed at the top
  primary: string | undefined;          // the server's main interface (default route)
  history: NetSeries | undefined;       // graph samples for `shown`
  onPick: (iface: string) => void;
  windowMs: number;
}

interface RowProps {
  arrow: string;
  label: string;
  color: string;
  value: number;
  history: Point[];
  windowMs: number;
  gradient: [string, string, string];
}

function Row({ arrow, label, color, value, history, windowMs, gradient }: RowProps) {
  const [scale, setScale] = useState(0);
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 11,
          color: theme.graph_text,
          marginBottom: 4,
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color }}>{arrow} {label} </span>
          <span style={{ color: theme.fg }}>{fmtBits(value)}</span>
          <span> · {fmtBytes(value)}</span>
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>▔ {fmtScale(scale)}</span>
      </div>
      <Graph data={history} windowMs={windowMs} gradient={gradient} niceMax={niceMax} onScale={setScale} height={56} />
    </div>
  );
}

export default function NetworkPanel({ network, shown, primary, history = EMPTY, onPick, windowMs }: Props) {
  const main = shown;
  const others = network.filter(n => n !== shown);

  return (
    <Panel
      title="net"
      num="3"
      className="panel-net"
      borderColor={theme.net_box}
      extra={main ? main.iface + (main.iface === primary ? '' : ' (picked)') : undefined}
    >
      {main ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row arrow="▼" label="Download" color={theme.download_end} value={main.rxBytesPerSec} history={history.rx} windowMs={windowMs} gradient={DL} />
          <Row arrow="▲" label="Upload" color={theme.upload_end} value={main.txBytesPerSec} history={history.tx} windowMs={windowMs} gradient={UL} />
        </div>
      ) : (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>no interfaces</div>
      )}

      {others.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${theme.div_line}` }}>
          {others.map(iface => (
            <button
              key={iface.iface}
              type="button"
              className="net-row"
              onClick={() => onPick(iface.iface)}
              title={`graph ${iface.iface}` + (iface.iface === primary ? ' (main interface)' : '')}
            >
              <span style={{ color: theme.graph_text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {iface.iface}
                {iface.iface === primary && <span style={{ color: theme.inactive_fg }}> main</span>}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                <span style={{ color: theme.download_end }}>▼ {fmtBytes(iface.rxBytesPerSec)}</span>
                {'  '}
                <span style={{ color: theme.upload_end }}>▲ {fmtBytes(iface.txBytesPerSec)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
