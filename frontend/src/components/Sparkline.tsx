interface SparklineProps {
  data: number[];
  max?: number;
  color: string;
  fillColor?: string;
  height?: number;
  grid?: boolean;
}

export default function Sparkline({ data, max, color, fillColor, height = 60, grid = true }: SparklineProps) {
  const W = 300;
  const H = height;
  const pad = 1;
  const chartH = H - pad * 2;
  const maxVal = max ?? Math.max(...data, 1);

  const pts = data.length >= 2
    ? data.map((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = pad + chartH - Math.min(1, v / maxVal) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
    : null;

  const linePath = pts ? `M ${pts.join(' L ')}` : null;
  const fillPath = linePath ? `${linePath} L ${W},${H} L 0,${H} Z` : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {grid && [25, 50, 75].map(pct => {
        const y = pad + chartH - (pct / 100) * chartH;
        return (
          <line
            key={pct}
            x1={0} y1={y.toFixed(1)} x2={W} y2={y.toFixed(1)}
            stroke="#2a2a2a" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {fillPath && fillColor && <path d={fillPath} fill={fillColor} opacity="0.15" />}
      {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
