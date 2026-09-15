import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal aria-labelledby="modal-title" className="relative w-full max-w-md rounded-lg border border-border bg-surface shadow-md dark:border-border-dark dark:bg-surface-dark">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border-dark">
          <h2 id="modal-title" className="text-base font-semibold text-content dark:text-content-dark">
            {title}
          </h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="p-4 text-sm text-content dark:text-content-dark">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3 dark:border-border-dark">{footer}</div>}
      </div>
    </div>
  );
}
