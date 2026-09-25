import type { TemperatureInfo, Cooling, Point } from '../types';
import Panel from './Panel';
import Graph from './Graph';
import UsageBar from './UsageBar';
import { theme, gradAt } from '../theme';
import { THRESHOLDS, level, levelColor } from '../thresholds';

const TEMP_GRADIENT: [string, string, string] = [theme.temp_start, theme.temp_mid, theme.temp_end];
const SCALE_MAX = 100; // °C; bars and graph share this scale

interface Props {
  temperature: TemperatureInfo | null;
  cooling: Cooling | null;
  history: Point[];
  windowMs: number;
}

// "coretemp/Package id 0" → { group: "coretemp", name: "Package id 0" }
function splitLabel(label: string) {
  const i = label.indexOf('/');
  return i === -1 ? { group: '', name: label } : { group: label.slice(0, i), name: label.slice(i + 1) };
}

const labelStyle: React.CSSProperties = {
  width: 118,
  flexShrink: 0,
  fontSize: 11,
  lineHeight: '15px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function SensorLabel({ label, color }: { label: string; color?: string }) {
  const { group, name } = splitLabel(label);
  return (
    <span title={label} style={labelStyle}>
      {group && <span style={{ color: theme.graph_text }}>{group}/</span>}
      <span style={{ color: color ?? theme.fg }}>{name}</span>
    </span>
  );
}

const NO_FANS_HINT =
  'The kernel reports no fanN_input or pwmN files. Either the board runs the fan from firmware, ' +
  'or the driver for its sensor chip is not loaded (run sensors-detect on the host to check).';

function CoolingSection({ cooling }: { cooling: Cooling }) {
  const { fans, controls } = cooling;
  // Unconnected headers read 0 rpm forever. Hide those, but keep a 0 rpm fan
  // the board has named (e.g. "CPU Fan"): that one stopping is worth seeing.
  const isGeneric = (label: string) => /\/fan\d+$/.test(label);
  const shown = fans.filter(f => f.rpm > 0 || !isGeneric(f.label));
  const unused = fans.length - shown.length;
  const warn = levelColor('warn');

  return (
    <div>
      <div style={{ fontSize: 10, color: theme.graph_text, margin: '2px 0 4px', letterSpacing: '0.08em' }}>─ cooling ─</div>

      {fans.length === 0 && controls.length === 0 ? (
        <div title={NO_FANS_HINT} style={{ fontSize: 11, color: theme.graph_text, cursor: 'help' }}>
          no fan sensors or fan control exposed
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {shown.map((f, i) => {
            const stopped = f.rpm === 0;
            return (
              <div key={`${f.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, lineHeight: '15px' }}>
                <SensorLabel label={f.label} color={stopped ? warn : undefined} />
                <span style={{ flex: 1 }} />
                <span style={{ color: stopped ? warn : theme.fg, fontWeight: stopped ? 700 : 400 }}>
                  {f.rpm.toLocaleString('en-US')}
                </span>
                <span style={{ color: theme.graph_text, width: 24 }}>rpm</span>
              </div>
            );
          })}

          {unused > 0 && (
            <div style={{ fontSize: 10, color: theme.graph_text }}>
              {unused} unused fan header{unused === 1 ? '' : 's'} (0 rpm)
            </div>
          )}

          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', fontSize: 11, lineHeight: '15px', marginTop: 3 }}
            title="Software fan control channels (pwm). auto: firmware/chip curve. manual: fixed by software. full: 100%."
          >
            <span style={{ color: theme.graph_text }}>control</span>
            {controls.length === 0 ? (
              <span style={{ color: theme.graph_text }}>not exposed</span>
            ) : (
              controls.map(c => (
                <span key={c.label} title={c.label} style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ color: theme.fg }}>{splitLabel(c.label).name}</span>{' '}
                  <span style={{ color: theme.hi_fg }}>{c.percent === null ? '?' : `${c.percent}%`}</span>{' '}
                  <span style={{ color: c.mode === 'manual' ? warn : theme.graph_text }}>{c.mode ?? ''}</span>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TempPanel({ temperature, cooling, history, windowMs }: Props) {
  const cpu = temperature?.cpu ?? null;
  const cpuLevel = cpu === null ? 'ok' : level(cpu, THRESHOLDS.cpuTemp);
  const cpuColor =
    cpu === null ? theme.graph_text : levelColor(cpuLevel) ?? gradAt(TEMP_GRADIENT, cpu / SCALE_MAX);
  const sensors = temperature?.all ?? [];
  const spinning = cooling?.fans.filter(f => f.rpm > 0).length ?? 0;

  const footer = [
    sensors.length > 0 ? `${sensors.length} sensor${sensors.length === 1 ? '' : 's'}` : null,
    spinning > 0 ? `${spinning} fan${spinning === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Panel
      title="temp"
      className="panel-temp"
      borderColor={theme.temp_box}
      bottomRight={footer ? <span style={{ color: theme.graph_text }}>{footer}</span> : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
        {!temperature ? (
          <div style={{ color: theme.graph_text, fontSize: 11 }}>no temperature sensors found</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: cpuColor }}>
                  {cpu !== null ? cpu.toFixed(0) : '—'}
                </span>
                <span style={{ fontSize: 12, color: cpuColor, marginLeft: 3 }}>°C</span>
                <span style={{ fontSize: 11, color: theme.graph_text, marginLeft: 8 }}>cpu</span>
                {cpuLevel !== 'ok' && (
                  <span style={{ fontSize: 11, color: cpuColor, marginLeft: 8, fontWeight: 700 }}>
                    {cpuLevel === 'crit' ? '⚠ hot' : '⚠ warm'}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: theme.graph_text }}>▔ {SCALE_MAX}°C</span>
            </div>

            <Graph data={history} windowMs={windowMs} max={SCALE_MAX} gradient={TEMP_GRADIENT} height={64} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {sensors.map((s, i) => {
                const lc = levelColor(level(s.celsius, THRESHOLDS.sensorTemp));
                return (
                  <div key={`${s.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SensorLabel label={s.label} color={lc} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <UsageBar
                        value={(s.celsius / SCALE_MAX) * 100}
                        gradient={TEMP_GRADIENT}
                        display={`${s.celsius.toFixed(0)}°C`}
                        valueWidth={40}
                        valueColor={lc}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {cooling && <CoolingSection cooling={cooling} />}
      </div>
    </Panel>
  );
}
