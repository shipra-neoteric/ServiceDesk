import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({
  title,
  reason,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center dark:border-border-dark">
      <div className="text-content-muted dark:text-content-dark-muted">{icon ?? <Inbox className="h-8 w-8" aria-hidden />}</div>
      <p className="text-sm font-semibold text-content dark:text-content-dark">{title}</p>
      <p className="max-w-sm text-sm text-content-muted dark:text-content-dark-muted">{reason}</p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
