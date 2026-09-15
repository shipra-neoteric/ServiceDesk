import clsx from 'clsx';

type Accent = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const ACCENT_CLASSES: Record<Accent, string> = {
  neutral: 'text-content dark:text-content-dark',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function KpiCard({
  label,
  value,
  accent = 'neutral',
  onClick,
}: {
  label: string;
  value: number | string;
  accent?: Accent;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-left shadow-sm dark:border-border-dark dark:bg-surface-dark',
        onClick && 'transition-colors duration-fast hover:bg-surface-muted dark:hover:bg-surface-dark-muted cursor-pointer',
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-content-muted dark:text-content-dark-muted">{label}</span>
      <span className={clsx('text-2xl font-bold', ACCENT_CLASSES[accent])}>{value}</span>
    </Comp>
  );
}
