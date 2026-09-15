import { theme, gradAt } from '../theme';

interface UsageBarProps {
  label?: string;
  value: number; // 0-100
  total?: string;
  gradient?: [string, string, string]; // colour by fill level
  color?: string;
  labelColor?: string;
  labelWidth?: number;
  display?: string;    // text shown after the bar; defaults to the percentage
  valueWidth?: number;
}

// btop-style meter: a track with a fill whose colour follows the level.
export default function UsageBar({
  label,
  value,
  total,
  gradient,
  color,
  labelColor = theme.graph_text,
  labelWidth = 52,
  display,
  valueWidth = 34,
}: UsageBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  const fill = color ?? (gradient ? gradAt(gradient, pct / 100) : theme.fg);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 2,
        fontSize: 11,
        lineHeight: '15px',
      }}
    >
      {label !== undefined && (
        <span style={{ color: labelColor, minWidth: labelWidth, flexShrink: 0 }}>{label}</span>
      )}
      <div
        style={{
          flex: 1,
          height: 9,
          backgroundColor: theme.meter_bg,
          position: 'relative',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${pct}%`,
            background: gradient
              ? `linear-gradient(90deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`
              : fill,
            transition: 'width 0.15s ease',
          }}
        />
      </div>
      <span style={{ color: theme.fg, minWidth: valueWidth, textAlign: 'right', flexShrink: 0 }}>
        {display ?? `${pct.toFixed(0)}%`}
      </span>
      {total && (
        <span style={{ color: theme.hi_fg, minWidth: 54, flexShrink: 0, textAlign: 'right' }}>
          {total}
        </span>
      )}
    </div>
  );
}
