import { theme, gradAt } from '../theme';

interface UsageBarProps {
  label: string;
  value: number; // 0-100
  total?: string;
  // Optional gradient stops for a meter that colors by fill level
  gradient?: [string, string, string];
  color?: string;
  labelColor?: string;
  width?: number; // cells; passed to flex layout implicitly
}

// btop-style meter: a row of block characters that gradient-color by level.
// We render a solid bar with CSS width, over a dark meter_bg track.
export default function UsageBar({
  label,
  value,
  total,
  gradient,
  color,
  labelColor = theme.graph_text,
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
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        lineHeight: '14px',
      }}
    >
      <span style={{ color: labelColor, minWidth: 48, flexShrink: 0 }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 10,
          backgroundColor: theme.meter_bg,
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 1,
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
      <span style={{ color: theme.fg, minWidth: 38, textAlign: 'right', flexShrink: 0 }}>
        {pct.toFixed(0)}%
      </span>
      {total && (
        <span style={{ color: theme.hi_fg, minWidth: 62, flexShrink: 0, textAlign: 'right' }}>
          {total}
        </span>
      )}
    </div>
  );
}
