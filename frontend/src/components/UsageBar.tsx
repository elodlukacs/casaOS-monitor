interface UsageBarProps {
  label: string;
  value: number; // 0-100
  total?: string;
  color: string;
}

export default function UsageBar({ label, value, total, color }: UsageBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      }}
    >
      <span style={{ color: '#606060', minWidth: 44, flexShrink: 0 }}>{label}</span>
      <div
        style={{
          flex: 1,
          height: 8,
          backgroundColor: '#2a2a2a',
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
            backgroundColor: color,
            transition: 'width 0.15s ease',
          }}
        />
      </div>
      <span style={{ color: '#cccccc', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
        {pct.toFixed(0)}%
      </span>
      {total && (
        <span style={{ color: '#888', minWidth: 60, flexShrink: 0 }}>{total}</span>
      )}
    </div>
  );
}
