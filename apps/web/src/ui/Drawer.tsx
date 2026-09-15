import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 transition-opacity duration-normal" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="drawer-title"
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface shadow-drawer transition-transform duration-normal dark:border-border-dark dark:bg-surface-dark"
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-4 dark:border-border-dark">
          <div>
            <h2 id="drawer-title" className="text-lg font-semibold text-content dark:text-content-dark">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-content-muted dark:text-content-dark-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-4 dark:border-border-dark dark:bg-surface-dark">{footer}</div>}
      </div>
    </div>
  );
}
