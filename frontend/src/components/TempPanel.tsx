import type { TemperatureInfo } from '../types';
import Panel from './Panel';
import Graph from './Graph';
import UsageBar from './UsageBar';
import { theme, gradAt } from '../theme';

const TEMP_GRADIENT: [string, string, string] = [theme.temp_start, theme.temp_mid, theme.temp_end];
const SCALE_MAX = 100; // °C; bars and graph share this scale

interface Props {
  temperature: TemperatureInfo | null;
  history: number[];
}

// "coretemp/Package id 0" → { group: "coretemp", name: "Package id 0" }
function splitLabel(label: string) {
  const i = label.indexOf('/');
  return i === -1 ? { group: '', name: label } : { group: label.slice(0, i), name: label.slice(i + 1) };
}

export default function TempPanel({ temperature, history }: Props) {
  const cpu = temperature?.cpu ?? null;
  const cpuColor = cpu === null ? theme.graph_text : gradAt(TEMP_GRADIENT, cpu / SCALE_MAX);
  const sensors = temperature?.all ?? [];

  return (
    <Panel
      title="temp"
      className="panel-temp"
      borderColor={theme.temp_box}
      bottomRight={
        sensors.length > 0 ? (
          <>
            <span style={{ color: theme.graph_text }}>{sensors.length} sensor{sensors.length === 1 ? '' : 's'}</span>
          </>
        ) : undefined
      }
    >
      {!temperature ? (
        <div style={{ color: theme.graph_text, fontSize: 11 }}>no temperature sensors found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: cpuColor }}>
                {cpu !== null ? cpu.toFixed(0) : '—'}
              </span>
              <span style={{ fontSize: 12, color: cpuColor, marginLeft: 3 }}>°C</span>
              <span style={{ fontSize: 11, color: theme.graph_text, marginLeft: 8 }}>cpu</span>
            </div>
            <span style={{ fontSize: 11, color: theme.graph_text }}>▔ {SCALE_MAX}°C</span>
          </div>

          <Graph data={history} max={SCALE_MAX} gradient={TEMP_GRADIENT} height={64} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sensors.map((s, i) => {
              const { group, name } = splitLabel(s.label);
              return (
                <div key={`${s.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    title={s.label}
                    style={{
                      width: 118,
                      flexShrink: 0,
                      fontSize: 11,
                      lineHeight: '15px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group && <span style={{ color: theme.graph_text }}>{group}/</span>}
                    <span style={{ color: theme.fg }}>{name}</span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <UsageBar
                      value={(s.celsius / SCALE_MAX) * 100}
                      gradient={TEMP_GRADIENT}
                      display={`${s.celsius.toFixed(0)}°C`}
                      valueWidth={40}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
