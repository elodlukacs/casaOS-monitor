import { useEffect, useRef, useState } from 'react';

export type Gradient = [string, string, string]; // bottom, middle, top

interface GraphProps {
  data: number[];
  gradient: Gradient;
  max?: number;                        // fixed scale; omit to fit the visible window
  niceMax?: (raw: number) => number;   // rounds an auto scale up to a readable value
  onScale?: (max: number) => void;     // reports the scale actually drawn
  height?: number;                     // CSS px; omit to fill a flex-column parent
  pointSpacing?: number;               // CSS px per sample
  fillAlpha?: number;
}

function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Canvas area chart in btop's style: newest sample at the right edge, history
// scrolling left, colour taken from a vertical gradient so tall spikes turn
// yellow/red. Renders crisp at any device pixel ratio.
export default function Graph({
  data,
  gradient,
  max,
  niceMax,
  onScale,
  height,
  pointSpacing = 3,
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

    const visible = Math.max(2, Math.floor(w / pointSpacing) + 1);
    const pts = data.length > visible ? data.slice(data.length - visible) : data;

    let scale: number;
    if (max !== undefined) {
      scale = max;
    } else {
      let raw = 0;
      for (const v of pts) if (v > raw) raw = v;
      scale = niceMax ? niceMax(raw) : Math.max(raw, 1);
    }
    if (scale !== lastScale.current) {
      lastScale.current = scale;
      onScaleRef.current?.(scale);
    }

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

    if (pts.length < 2) return;
    const [c0, c1, c2] = gradient;
    const yOf = (v: number) => {
      const t = Math.max(0, Math.min(1, v / scale));
      return h - 1 - t * (h - 2);
    };
    const x0 = w - (pts.length - 1) * pointSpacing;

    const line = new Path2D();
    line.moveTo(x0, yOf(pts[0]));
    for (let i = 1; i < pts.length; i++) line.lineTo(x0 + i * pointSpacing, yOf(pts[i]));

    const area = new Path2D(line);
    area.lineTo(w, h);
    area.lineTo(x0, h);
    area.closePath();

    const fill = ctx.createLinearGradient(0, h, 0, 0);
    fill.addColorStop(0, rgba(c0, fillAlpha * 0.5));
    fill.addColorStop(0.5, rgba(c1, fillAlpha));
    fill.addColorStop(1, rgba(c2, Math.min(1, fillAlpha * 1.6)));
    ctx.fillStyle = fill;
    ctx.fill(area);

    const stroke = ctx.createLinearGradient(0, h, 0, 0);
    stroke.addColorStop(0, c0);
    stroke.addColorStop(0.5, c1);
    stroke.addColorStop(1, c2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(line);
  }, [data, gradient, max, niceMax, size, pointSpacing, fillAlpha]);

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
