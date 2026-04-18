import { useEffect, useRef, useState } from 'react';

interface BrailleGraphProps {
  data: number[];
  max?: number;
  height?: number;
  // Single color OR vertical gradient stops [bottom, middle, top]
  color: string;
  gradient?: [string, string, string];
}

const LEFT_BITS = [0x01, 0x02, 0x04, 0x40];
const RIGHT_BITS = [0x08, 0x10, 0x20, 0x80];

// One braille char per row, one mask per column (column-major flat grid)
function buildBrailleRows(
  data: number[],
  maxVal: number,
  cols: number,
  rows: number,
): string[] {
  const pixelRows = rows * 4;
  const pixelCols = cols * 2;

  const buckets: number[] = new Array(pixelCols).fill(0);
  if (data.length > 0) {
    for (let px = 0; px < pixelCols; px++) {
      const dataIdx = data.length >= pixelCols
        ? data.length - pixelCols + px
        : Math.floor((px / pixelCols) * data.length);
      if (dataIdx >= 0 && dataIdx < data.length) buckets[px] = data[dataIdx];
    }
  }

  const grid: boolean[][] = Array.from({ length: pixelRows }, () =>
    new Array(pixelCols).fill(false),
  );
  for (let px = 0; px < pixelCols; px++) {
    const val = Math.min(maxVal, Math.max(0, buckets[px]));
    const fillHeight = Math.round((val / maxVal) * pixelRows);
    for (let pr = pixelRows - fillHeight; pr < pixelRows; pr++) grid[pr][px] = true;
  }

  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      let mask = 0;
      for (let r = 0; r < 4; r++) {
        const pr = row * 4 + r;
        if (grid[pr]?.[col * 2]) mask |= LEFT_BITS[r];
        if (grid[pr]?.[col * 2 + 1]) mask |= RIGHT_BITS[r];
      }
      line += String.fromCodePoint(0x2800 | mask);
    }
    lines.push(line);
  }
  return lines;
}

export default function BrailleGraph({ data, max, height = 8, color, gradient }: BrailleGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(40);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = "12px 'JetBrains Mono', monospace";
      const charWidth = ctx.measureText('⣿').width;
      if (charWidth > 0) {
        const w = el.getBoundingClientRect().width;
        setCols(Math.max(4, Math.ceil(w / charWidth) + 1));
      }
    }
    const target = el.parentElement ?? el;
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  const maxVal = max ?? Math.max(...data, 1);
  const rows = buildBrailleRows(data, maxVal, cols, height);

  // Render: each row gets its own color from vertical gradient so a tall
  // spike takes on multiple colors (green→yellow→red) like btop.
  const rowColor = (rowIdx: number) => {
    if (!gradient) return color;
    // rowIdx 0 is top; we want bottom=gradient[0], top=gradient[2]
    const t = height === 1 ? 0 : 1 - rowIdx / (height - 1);
    const [a, b, c] = gradient;
    const hex = (s: string) => [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
    ];
    const lerp = (x: number[], y: number[], k: number) =>
      x.map((v, i) => Math.round(v + (y[i] - v) * k));
    const rgb = t < 0.5 ? lerp(hex(a), hex(b), t * 2) : lerp(hex(b), hex(c), (t - 0.5) * 2);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  };

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
      <pre
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
          fontSize: 12,
          lineHeight: 1.1,
          whiteSpace: 'pre',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {rows.map((line, i) => (
          <div key={i} style={{ color: rowColor(i), lineHeight: 1.1 }}>
            {line}
          </div>
        ))}
      </pre>
    </div>
  );
}
