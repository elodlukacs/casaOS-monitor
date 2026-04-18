import React from 'react';

interface PanelProps {
  num?: string;
  title: string;
  borderColor?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Panel({
  num,
  title,
  borderColor = '#3f3f3f',
  children,
  className,
  style,
}: PanelProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        border: `1px solid ${borderColor}`,
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: 10,
          backgroundColor: '#1a1a1a',
          padding: '0 4px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          lineHeight: '14px',
          userSelect: 'none',
        }}
      >
        {num && (
          <span style={{ color: '#b54040' }}>{num}</span>
        )}
        <span style={{ color: '#cccccc' }}>{title}</span>
      </span>
      <div style={{ padding: '14px 12px 10px' }}>{children}</div>
    </div>
  );
}
