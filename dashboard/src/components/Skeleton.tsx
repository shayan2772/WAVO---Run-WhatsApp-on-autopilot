import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** Shimmer placeholder — render while data loads so the layout appears instantly, not blank. */
export function Skeleton({ width = '100%', height = 16, radius = 8, className = '', style }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
