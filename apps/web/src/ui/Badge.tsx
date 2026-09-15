import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Text colors are deliberately darker than the raw semantic hex (e.g. danger's #ef4444) —
// an axe-core accessibility smoke test measured the raw color at ~3.3:1 against its own /10
// background tint, short of WCAG AA's 4.5:1 for this text size. Dark mode uses the inverse
// pairing (a lighter tint of the color as text on a dark, low-opacity fill), which is the
// standard way to keep the same semantic hue legible in both themes.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-content dark:bg-surface-dark-muted dark:text-content-dark',
  info: 'bg-info/10 text-info-strong dark:bg-info/20 dark:text-[#60a5fa]',
  success: 'bg-success/10 text-success-strong dark:bg-success/20 dark:text-[#4ade80]',
  warning: 'bg-warning/10 text-warning-strong dark:bg-warning/20 dark:text-[#fbbf24]',
  danger: 'bg-danger/10 text-danger-strong dark:bg-danger/20 dark:text-[#f87171]',
};

export function Badge({ tone = 'neutral', children, icon }: { tone?: BadgeTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
      {icon}
      {children}
    </span>
  );
}
