import type { CpuCore, CpuFreq, LoadAvg, Point } from '../types';
import Panel from './Panel';
import Graph from './Graph';
import UsageBar from './UsageBar';
import { theme, gradAt } from '../theme';
import { levelColor } from '../thresholds';

const CPU_GRADIENT: [string, string, string] = [theme.cpu_start, theme.cpu_mid, theme.cpu_end];
const FREQ_COLOR = theme.cached_mid;

// Running below base clock while busy is the textbook sign of thermal or
// power throttling. Needs base_frequency (Intel HWP); without it we don't guess.
const THROTTLE_MIN_USAGE = 80;
const THROTTLE_MARGIN = 0.95;

interface Props {
  cores: CpuCore[];
  freq: CpuFreq | null;
  history: Point[];
  windowMs: number;
  uptime: string;
  cpuModel: string;
  loadAvg: LoadAvg;
}

function ghz(mhz: number, digits = 1) {
  return (mhz / 1000).toFixed(digits);
}

// "cpu3" → 3
function cpuIndex(name: string) {
  const n = parseInt(name.slice(3), 10);
  return Number.isFinite(n) ? n : -1;
}

// Where the current average sits in the hardware range, with a tick at base.
function FreqGauge({ freq }: { freq: CpuFreq }) {
  const { min, max, base, avg } = freq;
  if (min === null || max === null || max <= min) return null;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const title =
    `range ${ghz(min, 2)} to ${ghz(max, 2)} GHz` + (base !== null ? `, base ${ghz(base, 2)} GHz (tick)` : '');
  return (
    <div
      title={title}
      style={{ position: 'relative', width: 120, height: 4, backgroundColor: theme.meter_bg, marginTop: 5, marginLeft: 'auto' }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pos(avg)}%`,
          background: `linear-gradient(90deg, ${theme.cached_start}, ${FREQ_COLOR})`,
          transition: 'width 0.15s ease',
        }}
      />
      {base !== null && (
        <div
          style={{ position: 'absolute', left: `${pos(base)}%`, top: -2, bottom: -2, width: 1, backgroundColor: theme.fg, opacity: 0.7 }}
        />
      )}
    </div>
  );
}

export default function CpuPanel({ cores, freq, history, windowMs, uptime, cpuModel, loadAvg }: Props) {
  const total = cores.find(c => c.name === 'cpu');
  const coreList = cores.filter(c => c.name !== 'cpu');
  // Up to 8 cores per column so many-core boxes don't turn into a tall strip.
  const cols = Math.min(3, Math.max(1, Math.ceil(coreList.length / 8)));

  const throttling =
    !!freq &&
    freq.base !== null &&
    (total?.usage ?? 0) >= THROTTLE_MIN_USAGE &&
    freq.avg < freq.base * THROTTLE_MARGIN;
  const freqColor = throttling ? levelColor('warn')! : FREQ_COLOR;
  const coreGhz = (name: string) => {
    const mhz = freq?.cores[cpuIndex(name)];
    return typeof mhz === 'number' ? `${ghz(mhz)} GHz` : undefined;
  };

  const sub = [
    `${coreList.length} cores`,
    freq?.governor ?? null,
    freq?.max != null ? `max ${ghz(freq.max)} GHz` : null,
  ].filter(Boolean).join(' · ');

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

        <div className="cpu-side" style={{ width: cols * (freq ? 300 : 270), maxWidth: '58%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
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
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              {freq && (
                <div style={{ lineHeight: 1 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: freqColor }}>{ghz(freq.avg, 2)}</span>
                  <span style={{ fontSize: 11, color: freqColor, marginLeft: 3 }}>GHz</span>
                </div>
              )}
              {freq && <FreqGauge freq={freq} />}
              <div
                style={{
                  fontSize: 10,
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: throttling ? freqColor : theme.graph_text,
                  fontWeight: throttling ? 700 : 400,
                }}
                title={throttling ? `busy and below base clock (${ghz(freq!.base!, 2)} GHz): likely thermal or power throttling` : sub}
              >
                {throttling ? '⚠ throttling' : sub}
              </div>
            </div>
          </div>

          {total && (
            <UsageBar label="CPU" value={total.usage} gradient={CPU_GRADIENT} total={freq ? `${ghz(freq.avg)} GHz` : undefined} />
          )}

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
                total={coreGhz(core.name)}
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
