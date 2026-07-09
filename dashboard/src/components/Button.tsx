import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, disables interaction, and keeps the label so the button never feels stuck. */
  loading?: boolean;
  /** Leading icon (hidden while loading — the spinner takes its place). */
  icon?: ReactNode;
  block?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'ui-btn--primary',
  secondary: '',
  danger: 'ui-btn--danger',
  ghost: 'ui-btn--ghost',
};
const SIZE_CLASS: Record<Size, string> = { sm: 'ui-btn--sm', md: '', lg: 'ui-btn--lg' };

/**
 * The app's standard action button. Every button gives feedback:
 * - hover/active micro-interactions (from design.css)
 * - a `loading` state that swaps the icon for a spinner and blocks double-clicks
 * so no click ever feels unacknowledged.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, block, className = '', disabled, type, children, ...rest },
  ref,
) {
  const spinnerSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  return (
    <button
      ref={ref}
      // Default to type="button" so a Button placed inside a <form> never triggers an implicit
      // submit + full page reload (which silently swallows click handlers).
      type={type ?? 'button'}
      className={`ui-btn ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${block ? 'ui-btn--block' : ''} ${className}`.trim()}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="ui-btn__label">
        {loading ? <Loader2 className="ui-btn__spinner" size={spinnerSize} /> : icon}
        {children}
      </span>
    </button>
  );
});
