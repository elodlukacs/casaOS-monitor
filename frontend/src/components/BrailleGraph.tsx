import { useEffect, useRef, useState } from 'react';

interface BrailleGraphProps {
  data: number[];
  max?: number;
  height?: number; // in braille chars (each char = 4 rows), default 8
  color: string;
}

// Braille bit layout (Unicode standard):
// Each braille char covers a 2-col x 4-row cell
// left col:  row0=bit0, row1=bit1, row2=bit2, row3=bit6
// right col: row0=bit3, row1=bit4, row2=bit5, row3=bit7
const LEFT_BITS = [0x01, 0x02, 0x04, 0x40];
const RIGHT_BITS = [0x08, 0x10, 0x20, 0x80];

function buildBrailleGrid(
  data: number[],
  maxVal: number,
  cols: number,
  rows: number, // in braille chars (4 pixel rows each)
): string {
  const pixelRows = rows * 4;
  // Each braille char is 2 pixels wide
  const pixelCols = cols * 2;

  // Resample data to pixelCols buckets
  const buckets: number[] = new Array(pixelCols).fill(0);
  if (data.length > 0) {
    for (let px = 0; px < pixelCols; px++) {
      let dataIdx: number;
      if (data.length >= pixelCols) {
        // enough data: scroll — latest point on the right
        dataIdx = data.length - pixelCols + px;
      } else {
        // not enough data yet: stretch to fill full width
        dataIdx = Math.floor((px / pixelCols) * data.length);
      }
      if (dataIdx >= 0 && dataIdx < data.length) {
        buckets[px] = data[dataIdx];
      }
    }
  }

  // Build pixel grid [pixelRow][pixelCol] = filled?
  const grid: boolean[][] = Array.from({ length: pixelRows }, () =>
    new Array(pixelCols).fill(false),
  );

  for (let px = 0; px < pixelCols; px++) {
    const val = Math.min(maxVal, Math.max(0, buckets[px]));
    const fillHeight = Math.round((val / maxVal) * pixelRows);
    // Fill from bottom up
    for (let pr = pixelRows - fillHeight; pr < pixelRows; pr++) {
      grid[pr][px] = true;
    }
  }

  // Convert pixel grid to braille characters
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

  return lines.join('\n');
}

export default function BrailleGraph({ data, max, height = 8, color }: BrailleGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(40);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      // Measure char width using canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = "12px 'JetBrains Mono', monospace";
      const charWidth = ctx.measureText('⣿').width;
      if (charWidth > 0) {
        const containerWidth = el.getBoundingClientRect().width;
        // ceil+1 so graph fills edge; overflow:hidden clips any excess
        setCols(Math.max(4, Math.ceil(containerWidth / charWidth) + 1));
      }
    }

    // Observe the PARENT element — observing el itself creates a feedback loop
    // because the <pre> inside it can expand el's width.
    const target = el.parentElement ?? el;
    const ro = new ResizeObserver(measure);
    ro.observe(target);

    // Initial measure after webfont loads so charWidth is accurate
    document.fonts.ready.then(measure);

    return () => ro.disconnect();
  }, []);

  const maxVal = max ?? Math.max(...data, 1);
  const text = buildBrailleGrid(data, maxVal, cols, height);

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
      <pre
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
          fontSize: 12,
          lineHeight: 1.1,
          color,
          whiteSpace: 'pre',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {text}
      </pre>
    </div>
  );
}
