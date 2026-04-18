import type { NetworkInterface } from '../types';
import Panel from './Panel';
import BrailleGraph from './BrailleGraph';

function fmtSpeed(bps: number) {
  if (bps >= 1073741824) return (bps / 1073741824).toFixed(2) + ' GB/s';
  if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MB/s';
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s';
  return bps.toFixed(0) + ' B/s';
}

const DL_COLOR = '#b0a9de';
const UL_COLOR = '#a0f0a0';

interface Props {
  network: NetworkInterface[];
  rxHistory: number[];
  txHistory: number[];
}

export default function NetworkPanel({ network, rxHistory, txHistory }: Props) {
  const main = network[0];
  // separate scales so a dominant direction doesn't flatten the other
  const rxMax = Math.max(...rxHistory, 1024);
  const txMax = Math.max(...txHistory, 1024);

  return (
    <Panel num="³" title={`net${main ? ` ─ ${main.iface}` : ''}`} borderColor="#0f6e53">
      {main && (
        <>
          <div style={{ marginBottom: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#606060',
                marginBottom: 2,
              }}
            >
              <span style={{ color: DL_COLOR }}>↓</span>
              <span style={{ color: '#888', fontSize: 10 }}>{fmtSpeed(main.rxBytesPerSec)}</span>
            </div>
            <BrailleGraph data={rxHistory} max={rxMax} height={3} color={DL_COLOR} />
          </div>

          <div style={{ marginTop: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#606060',
                marginBottom: 2,
              }}
            >
              <span style={{ color: UL_COLOR }}>↑</span>
              <span style={{ color: '#888', fontSize: 10 }}>{fmtSpeed(main.txBytesPerSec)}</span>
            </div>
            <BrailleGraph data={txHistory} max={txMax} height={3} color={UL_COLOR} />
          </div>
        </>
      )}

      {network.slice(1).map(iface => (
        <div
          key={iface.iface}
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid #242424',
            fontSize: 10,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: '#606060' }}>{iface.iface}</span>
          <span>
            <span style={{ color: DL_COLOR }}>↓ {fmtSpeed(iface.rxBytesPerSec)}</span>
            {'  '}
            <span style={{ color: UL_COLOR }}>↑ {fmtSpeed(iface.txBytesPerSec)}</span>
          </span>
        </div>
      ))}
    </Panel>
  );
}
