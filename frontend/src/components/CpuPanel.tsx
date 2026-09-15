import type { CpuCore, LoadAvg, Point } from '../types';
import Panel from './Panel';
import Graph from './Graph';
import UsageBar from './UsageBar';
import { theme, gradAt } from '../theme';

const CPU_GRADIENT: [string, string, string] = [theme.cpu_start, theme.cpu_mid, theme.cpu_end];

interface Props {
  cores: CpuCore[];
  history: Point[];
  windowMs: number;
  uptime: string;
  cpuModel: string;
  loadAvg: LoadAvg;
}

export default function CpuPanel({ cores, history, windowMs, uptime, cpuModel, loadAvg }: Props) {
  const total = cores.find(c => c.name === 'cpu');
  const coreList = cores.filter(c => c.name !== 'cpu');
  // Up to 8 cores per column so many-core boxes don't turn into a tall strip.
  const cols = Math.min(3, Math.max(1, Math.ceil(coreList.length / 8)));

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
      <div className="cpu-body">
        <div className="cpu-graph">
          <Graph data={history} windowMs={windowMs} max={100} gradient={CPU_GRADIENT} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 11,
              color: theme.graph_text,
              marginTop: 8,
            }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>
              Load{' '}
              <span style={{ color: theme.fg }}>
                {loadAvg.one.toFixed(2)} {loadAvg.five.toFixed(2)} {loadAvg.fifteen.toFixed(2)}
              </span>
            </span>
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={cpuModel}
            >
              {cpuModel}
            </span>
          </div>
        </div>

        <div className="cpu-divider" style={{ backgroundColor: theme.div_line }} />

        <div className="cpu-side" style={{ width: cols * 270, maxWidth: '58%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            {total && (
              <div>
                <span
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: gradAt(CPU_GRADIENT, total.usage / 100),
                  }}
                >
                  {total.usage.toFixed(0)}
                </span>
                <span style={{ fontSize: 12, color: theme.graph_text, marginLeft: 3 }}>%</span>
              </div>
            )}
            <span style={{ fontSize: 11, color: theme.graph_text }}>{coreList.length} cores</span>
          </div>

          {total && <UsageBar label="CPU" value={total.usage} gradient={CPU_GRADIENT} />}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              columnGap: 16,
              marginTop: 4,
            }}
          >
            {coreList.map((core, i) => (
              <UsageBar
                key={core.name}
                label={cols > 1 ? `C${i}` : `Core${i}`}
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
