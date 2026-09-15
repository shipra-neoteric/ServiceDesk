import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ children, className, header, footer }: { children: ReactNode; className?: string; header?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={clsx('rounded-lg border border-border bg-surface shadow-sm dark:border-border-dark dark:bg-surface-dark', className)}>
      {header && <div className="border-b border-border px-4 py-3 dark:border-border-dark">{header}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-border px-4 py-3 dark:border-border-dark">{footer}</div>}
    </div>
  );
}
