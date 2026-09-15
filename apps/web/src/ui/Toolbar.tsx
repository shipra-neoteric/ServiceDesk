import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  activeFilterCount = 0,
  onClearFilters,
  children,
  action,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 dark:border-border-dark dark:bg-surface-dark">
      {onSearchChange && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted dark:text-content-dark-muted" aria-hidden />
          <input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className="h-10 w-52 rounded-md border border-border bg-surface pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-border-dark dark:bg-surface-dark"
          />
        </div>
      )}
      {children}
      {activeFilterCount > 0 && onClearFilters && (
        <button onClick={onClearFilters} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-xs font-medium text-primary-hover dark:bg-primary/10">
          {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
          <X className="h-3 w-3" />
        </button>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
