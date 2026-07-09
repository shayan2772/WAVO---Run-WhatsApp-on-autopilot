import { Waves } from 'lucide-react';
import './BrandMark.css';

interface BrandMarkProps {
  size?: number;
  /** Show the "Wavo" wordmark next to the glyph. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * Wavo brand mark: a frosted-glass rounded chip with a wave glyph in the accent color.
 * Pure CSS/SVG — no image asset — so it stays crisp and theme-aware in light and dark.
 */
export function BrandMark({ size = 34, withWordmark = false, className = '' }: BrandMarkProps) {
  return (
    <span className={`brandmark ${className}`.trim()}>
      <span className="brandmark__chip" style={{ width: size, height: size }} aria-hidden="true">
        <Waves size={size * 0.56} strokeWidth={2.4} />
      </span>
      {withWordmark && <span className="brandmark__word">Wavo</span>}
    </span>
  );
}
