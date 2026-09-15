import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// primary/danger use the *-strong shade, not the bare semantic color: white text on bare
// bg-primary (#f97316) or bg-danger (#ef4444) measures 2.8:1 / 3.76:1 (axe-core accessibility
// smoke test findings) — short of WCAG AA's 4.5:1 for this button text size. See
// tailwind.config.ts for why these darker shades exist.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary-hover shadow-sm active:scale-95 disabled:bg-primary/50',
  secondary: 'border border-border dark:border-border-dark bg-surface dark:bg-surface-dark text-content dark:text-content-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted',
  ghost: 'text-content dark:text-content-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted',
  danger: 'bg-danger-strong text-white hover:bg-red-700 active:scale-95 disabled:bg-danger/50',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-70',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
