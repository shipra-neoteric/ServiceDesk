import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyTitle = 'No records found',
  emptyReason = 'Try adjusting your filters.',
  onRowClick,
  pagination,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyReason?: string;
  onRowClick?: (row: T) => void;
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };
}) {
  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-surface-muted dark:bg-surface-dark-muted" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} reason={emptyReason} />;
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return (
    // tabIndex + role/aria-label: a horizontally-scrollable region must itself be keyboard-
    // focusable (arrow-key scrollable) per WCAG 2.1.1/2.1.3 — an axe-core smoke test on the
    // mobile viewport caught this container being scrollable by touch/mouse only.
    <div
      className="overflow-x-auto rounded-lg border border-border dark:border-border-dark"
      tabIndex={0}
      role="region"
      aria-label="Job Card table, scroll horizontally for more columns"
    >
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 bg-surface-muted text-xs font-semibold uppercase tracking-wide text-content-muted-strong dark:bg-surface-dark-muted dark:text-content-dark-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border dark:divide-border-dark">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer bg-surface transition-colors duration-fast hover:bg-surface-muted dark:bg-surface-dark dark:hover:bg-surface-dark-muted' : 'bg-surface dark:bg-surface-dark'}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.className ?? 'px-4 py-3 text-content dark:text-content-dark'}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm dark:border-border-dark">
          <span className="text-content-muted dark:text-content-dark-muted">
            Page {pagination.page} of {totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={pagination.page >= totalPages} onClick={() => pagination.onPageChange(pagination.page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
