import type { CpuCore, TemperatureInfo, LoadAvg } from '../types';
import Panel from './Panel';
import BrailleGraph from './BrailleGraph';
import UsageBar from './UsageBar';
import { theme, gradAt } from '../theme';

const CPU_GRADIENT: [string, string, string] = [theme.cpu_start, theme.cpu_mid, theme.cpu_end];
const TEMP_GRADIENT: [string, string, string] = [theme.temp_start, theme.temp_mid, theme.temp_end];

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
  const tempPct = temperature ? Math.min(1, Math.max(0, (temperature.cpu - 20) / 80)) : 0;
  const tempC = temperature ? gradAt(TEMP_GRADIENT, tempPct) : theme.fg;

  return (
    <Panel
      title="cpu"
      num="1"
      borderColor={theme.cpu_box}
      bottomRight={
        <>
          <span style={{ color: theme.graph_text }}>up </span>
          <span style={{ color: theme.fg }}>{uptime}</span>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 0, minHeight: 140 }}>
        {/* Left: tall braille history graph with vertical gradient */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <BrailleGraph
            data={history}
            max={100}
            height={7}
            color={theme.cpu_start}
            gradient={CPU_GRADIENT}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: theme.graph_text,
              marginTop: 6,
              paddingRight: 6,
            }}
          >
            <span>
              Load{' '}
              <span style={{ color: theme.fg }}>
                {loadAvg.one.toFixed(2)} {loadAvg.five.toFixed(2)} {loadAvg.fifteen.toFixed(2)}
              </span>
            </span>
            <span style={{ color: theme.graph_text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8 }}>
              {cpuModel}
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, backgroundColor: theme.div_line, margin: '0 10px', flexShrink: 0 }} />

        {/* Right: big total % + per-core bars + temp */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            {total && (
              <div>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: gradAt(CPU_GRADIENT, total.usage / 100),
                  }}
                >
                  {total.usage.toFixed(0)}
                </span>
                <span style={{ fontSize: 12, color: theme.graph_text, marginLeft: 2 }}>%</span>
              </div>
            )}
            {temperature && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: tempC, lineHeight: 1 }}>
                  {temperature.cpu.toFixed(0)}
                </span>
                <span style={{ fontSize: 11, color: tempC, marginLeft: 2 }}>°C</span>
              </div>
            )}
          </div>

          {total && (
            <UsageBar label="CPU" value={total.usage} gradient={CPU_GRADIENT} />
          )}

          <div style={{ marginTop: 4 }}>
            {coreList.map(core => (
              <UsageBar
                key={core.name}
                label={core.name.replace('cpu', 'Core')}
                value={core.usage}
                gradient={CPU_GRADIENT}
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
