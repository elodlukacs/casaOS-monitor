import React from 'react';
import { theme } from '../theme';

interface PanelProps {
  num?: string | number;
  title: string;
  extra?: React.ReactNode;     // trailing title info like "cpu  1  (3500MHz)"
  borderColor?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bottomRight?: React.ReactNode; // info in bottom-right chrome slot
}

// btop renders box chrome as text: ┌─┤ title N ├─…─┐  │…│  └──…──┘
// We emulate with CSS border + absolutely-positioned title/footer spans
// that overlay the border using background-color "cuts".
export default function Panel({
  num,
  title,
  extra,
  borderColor = theme.div_line,
  children,
  className,
  style,
  bottomRight,
}: PanelProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        border: `1px solid ${borderColor}`,
        backgroundColor: theme.bg,
        ...style,
      }}
    >
      {/* top-left title: ┤ title N ├ */}
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: 8,
          backgroundColor: theme.bg,
          padding: '0 2px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          lineHeight: '14px',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: borderColor }}>┤ </span>
        <span style={{ color: theme.title, fontWeight: 700 }}>{title}</span>
        {num !== undefined && (
          <>
            <span> </span>
            <span style={{ color: theme.hi_fg, fontWeight: 700 }}>{num}</span>
          </>
        )}
        {extra && (
          <>
            <span style={{ color: theme.graph_text }}> {extra}</span>
          </>
        )}
        <span style={{ color: borderColor }}> ├</span>
      </span>

      {bottomRight && (
        <span
          style={{
            position: 'absolute',
            bottom: -8,
            right: 10,
            backgroundColor: theme.bg,
            padding: '0 4px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            lineHeight: '14px',
            userSelect: 'none',
            color: theme.graph_text,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: borderColor }}>┤ </span>
          {bottomRight}
          <span style={{ color: borderColor }}> ├</span>
        </span>
      )}

      <div style={{ padding: '12px 12px 10px' }}>{children}</div>
    </div>
  );
}
