import { useEffect, useRef, useState } from 'react';
import type { Point } from '../types';

export type Gradient = [string, string, string]; // bottom, middle, top

interface GraphProps {
  data: Point[];                       // time-stamped samples, ascending t; may grow in place
  windowMs: number;                    // span shown, ending at the newest sample
  gradient: Gradient;
  max?: number;                        // fixed scale; omit to fit the visible window
  niceMax?: (raw: number) => number;   // rounds an auto scale up to a readable value
  onScale?: (max: number) => void;     // reports the scale actually drawn
  height?: number;                     // CSS px; omit to fill a flex-column parent
  fillAlpha?: number;
}

// Samples further apart than this are not joined: a server restart or a
// closed laptop shows as a hole, not a straight line across it.
const GAP_MS = 15000;

function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Canvas area chart in btop's style: time on x with the newest sample at the
// right edge, colour from a vertical gradient so tall spikes turn yellow/red.
// Samples are folded into one value per pixel column (the max, so short
// spikes survive), which keeps an hour of 1s data readable.
export default function Graph({
  data,
  windowMs,
  gradient,
  max,
  niceMax,
  onScale,
  height,
  fillAlpha = 0.28,
}: GraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;
  const lastScale = useRef(-1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize(s => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { w, h } = size;
    if (!canvas || w < 2 || h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // faint quarter lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (const f of [0.25, 0.5, 0.75]) {
      const y = Math.round(h * (1 - f)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // fold samples into pixel columns: max value + last timestamp per column
    const end = data.length ? data[data.length - 1].t : Date.now();
    const start = end - windowMs;
    const colV = new Float64Array(w).fill(NaN);
    const colT = new Float64Array(w);
    let raw = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const p = data[i];
      if (p.t < start) break;
      const x = Math.min(w - 1, Math.floor(((p.t - start) / windowMs) * w));
      if (Number.isNaN(colV[x]) || p.v > colV[x]) colV[x] = p.v;
      if (p.t > colT[x]) colT[x] = p.t;
      if (p.v > raw) raw = p.v;
    }

    let scale: number;
    if (max !== undefined) scale = max;
    else scale = niceMax ? niceMax(raw) : Math.max(raw, 1);
    if (scale !== lastScale.current) {
      lastScale.current = scale;
      onScaleRef.current?.(scale);
    }

    const [c0, c1, c2] = gradient;
    const yOf = (v: number) => {
      const t = Math.max(0, Math.min(1, v / scale));
      return h - 1 - t * (h - 2);
    };

    const fill = ctx.createLinearGradient(0, h, 0, 0);
    fill.addColorStop(0, rgba(c0, fillAlpha * 0.5));
    fill.addColorStop(0.5, rgba(c1, fillAlpha));
    fill.addColorStop(1, rgba(c2, Math.min(1, fillAlpha * 1.6)));
    const stroke = ctx.createLinearGradient(0, h, 0, 0);
    stroke.addColorStop(0, c0);
    stroke.addColorStop(0.5, c1);
    stroke.addColorStop(1, c2);

    // walk columns, joining neighbours unless the time gap is too large
    let line: Path2D | null = null;
    let segStartX = 0;
    let lastX = 0;
    let lastT = 0;
    const flush = () => {
      if (!line) return;
      const area = new Path2D(line);
      area.lineTo(lastX, h);
      area.lineTo(segStartX, h);
      area.closePath();
      ctx.fillStyle = fill;
      ctx.fill(area);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(line);
      line = null;
    };
    for (let x = 0; x < w; x++) {
      const v = colV[x];
      if (Number.isNaN(v)) continue;
      const px = x + 0.5;
      const py = yOf(v);
      if (line && colT[x] - lastT > GAP_MS) flush();
      if (!line) {
        line = new Path2D();
        line.moveTo(px, py);
        segStartX = px;
      } else {
        line.lineTo(px, py);
      }
      lastX = px;
      lastT = colT[x];
    }
    flush();
    // No dependency list: the caller appends to `data` in place, so the array
    // reference doesn't change. Every render redraws; renders come from new
    // frames, window changes and resizes, which are exactly the redraws needed.
  });

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 0,
        ...(height === undefined ? { flex: '1 1 0' } : { height }),
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
