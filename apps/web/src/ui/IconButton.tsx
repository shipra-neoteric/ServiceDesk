import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(({ label, size = 'md', className, children, ...rest }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={clsx(
      'inline-flex items-center justify-center rounded-md border border-border dark:border-border-dark text-content dark:text-content-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors duration-fast',
      size === 'md' ? 'h-9 w-9' : 'h-8 w-8',
      className,
    )}
    {...rest}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';
