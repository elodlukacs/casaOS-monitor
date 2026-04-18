import type { CpuCore, TemperatureInfo, LoadAvg } from '../types';
import Panel from './Panel';
import Sparkline from './Sparkline';
import UsageBar from './UsageBar';

function tempColor(c: number) {
  if (c >= 85) return '#fa1e1e';
  if (c >= 70) return '#f2e266';
  return '#50f095';
}

function cpuBarColor(usage: number) {
  if (usage > 66) return '#fa1e1e';
  if (usage > 33) return '#f2e266';
  return '#50f095';
}

interface Props {
  cores: CpuCore[];
  history: number[];
  temperature: TemperatureInfo | null;
  uptime: string;
  cpuModel: string;
  loadAvg: LoadAvg;
}

export default function CpuPanel({ cores, history, temperature, uptime, cpuModel, loadAvg }: Props) {
  const total = cores.find(c => c.name === 'cpu');
  const coreList = cores.filter(c => c.name !== 'cpu');

  return (
    <Panel num="¹" title="cpu" borderColor="#556cb1">
      <div style={{ display: 'flex', gap: 0, minHeight: 120 }}>
        {/* Left: braille history graph — min-width:0 prevents flex child from expanding past container */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Sparkline data={history} max={100} color="#50f095" fillColor="#50f095" height={100} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: '#606060',
              marginTop: 4,
            }}
          >
            <span>up {uptime}</span>
            {temperature && (
              <span style={{ color: tempColor(temperature.cpu) }}>
                temp {temperature.cpu.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            width: 1,
            backgroundColor: '#3a3a3a',
            margin: '0 12px',
            flexShrink: 0,
          }}
        />

        {/* Right: cpu model, per-core bars, load avg */}
        <div style={{ minWidth: 200, flexShrink: 0, maxWidth: 280 }}>
          {temperature && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: tempColor(temperature.cpu) }}>
                {temperature.cpu.toFixed(1)}
              </span>
              <span style={{ fontSize: 14, color: tempColor(temperature.cpu) }}>°C</span>
            </div>
          )}
          <div
            style={{
              fontSize: 10,
              color: '#888',
              marginBottom: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cpuModel}
          </div>

          {total && (
            <UsageBar
              label="CPU"
              value={total.usage}
              color={cpuBarColor(total.usage)}
            />
          )}

          {coreList.map(core => (
            <UsageBar
              key={core.name}
              label={core.name.replace('cpu', 'C')}
              value={core.usage}
              color={cpuBarColor(core.usage)}
            />
          ))}

          <div style={{ marginTop: 6, fontSize: 10, color: '#606060' }}>
            Load avg:{' '}
            <span style={{ color: '#aaa' }}>
              {loadAvg.one.toFixed(2)}{' '}
              {loadAvg.five.toFixed(2)}{' '}
              {loadAvg.fifteen.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
