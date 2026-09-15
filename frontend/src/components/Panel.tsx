import React from 'react';
import { theme } from '../theme';

interface PanelProps {
  num?: string | number;
  title: string;
  extra?: React.ReactNode;       // trailing title info, e.g. the interface name
  borderColor?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bottomRight?: React.ReactNode; // info in the bottom-right border slot
}

// btop draws box chrome as text: ┌─┤ title N ├─…─┐ … └──┤ info ├─┘
// Emulated with a CSS border plus absolutely positioned labels that cut the
// border using the background colour.
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
    <section
      className={className ? `panel ${className}` : 'panel'}
      style={{
        position: 'relative',
        border: `1px solid ${borderColor}`,
        backgroundColor: theme.bg,
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: 8,
          zIndex: 1,
          backgroundColor: theme.bg,
          padding: '0 2px',
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
        {extra && <span style={{ color: theme.graph_text }}> {extra}</span>}
        <span style={{ color: borderColor }}> ├</span>
      </span>

      {bottomRight && (
        <span
          style={{
            position: 'absolute',
            bottom: -8,
            right: 10,
            zIndex: 1,
            backgroundColor: theme.bg,
            padding: '0 4px',
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

      <div className="panel-body">{children}</div>
    </section>
  );
}
