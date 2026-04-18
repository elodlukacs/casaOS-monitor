import type { NetworkInterface } from '../types';
import Panel from './Panel';
import BrailleGraph from './BrailleGraph';
import { theme } from '../theme';

function fmtSpeed(bps: number) {
  const bits = bps * 8;
  if (bits >= 1_000_000_000) return (bits / 1_000_000_000).toFixed(2) + ' Gbps';
  if (bits >= 1_000_000) return (bits / 1_000_000).toFixed(2) + ' Mbps';
  if (bits >= 1_000) return (bits / 1_000).toFixed(1) + ' Kbps';
  return bits.toFixed(0) + ' bps';
}

function fmtBytes(bps: number) {
  if (bps >= 1073741824) return (bps / 1073741824).toFixed(2) + ' GiB/s';
  if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MiB/s';
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KiB/s';
  return bps.toFixed(0) + ' B/s';
}

function scaleLabel(max: number) {
  if (max >= 1073741824) return (max / 1073741824).toFixed(1) + ' GiB';
  if (max >= 1048576) return (max / 1048576).toFixed(0) + ' MiB';
  if (max >= 1024) return (max / 1024).toFixed(0) + ' KiB';
  return max.toFixed(0) + ' B';
}

const DL: [string, string, string] = [theme.download_start, theme.download_mid, theme.download_end];
const UL: [string, string, string] = [theme.upload_start, theme.upload_mid, theme.upload_end];

interface Props {
  network: NetworkInterface[];
  rxHistory: number[];
  txHistory: number[];
}

export default function NetworkPanel({ network, rxHistory, txHistory }: Props) {
  const main = network[0];
  const rxMax = Math.max(...rxHistory, 1024);
  const txMax = Math.max(...txHistory, 1024);

  return (
    <Panel
      title="net"
      num="3"
      borderColor={theme.net_box}
      extra={main ? main.iface : undefined}
    >
      {main && (
        <>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: 10,
                color: theme.graph_text,
                marginBottom: 2,
              }}
            >
              <span>
                <span style={{ color: theme.download_end }}>▼ Download </span>
                <span style={{ color: theme.fg }}>{fmtSpeed(main.rxBytesPerSec)}</span>
                <span style={{ color: theme.graph_text }}> · {fmtBytes(main.rxBytesPerSec)}</span>
              </span>
              <span>{scaleLabel(rxMax)}</span>
            </div>
            <BrailleGraph data={rxHistory} max={rxMax} height={3} color={theme.download_end} gradient={DL} />
          </div>

          <div style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: 10,
                color: theme.graph_text,
                marginBottom: 2,
              }}
            >
              <span>
                <span style={{ color: theme.upload_end }}>▲ Upload </span>
                <span style={{ color: theme.fg }}>{fmtSpeed(main.txBytesPerSec)}</span>
                <span style={{ color: theme.graph_text }}> · {fmtBytes(main.txBytesPerSec)}</span>
              </span>
              <span>{scaleLabel(txMax)}</span>
            </div>
            <BrailleGraph data={txHistory} max={txMax} height={3} color={theme.upload_end} gradient={UL} />
          </div>
        </>
      )}

      {network.slice(1).length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${theme.div_line}` }}>
          {network.slice(1).map(iface => (
            <div
              key={iface.iface}
              style={{
                fontSize: 10,
                display: 'flex',
                justifyContent: 'space-between',
                lineHeight: '14px',
              }}
            >
              <span style={{ color: theme.graph_text }}>{iface.iface}</span>
              <span>
                <span style={{ color: theme.download_end }}>▼ {fmtBytes(iface.rxBytesPerSec)}</span>
                {'  '}
                <span style={{ color: theme.upload_end }}>▲ {fmtBytes(iface.txBytesPerSec)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
