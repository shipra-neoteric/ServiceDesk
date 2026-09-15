import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../ui/PageHeader';
import { Toolbar } from '../../ui/Toolbar';
import { Button } from '../../ui/Button';
import { DataTable, type Column } from '../../ui/DataTable';
import { StatusBadge } from '../../ui/StatusBadge';
import { PermissionGate } from '../../ui/PermissionGate';
import { useJobList } from './api';
import type { JobListItem } from '../../types/job';
import { CreateJobDrawer } from './CreateJobDrawer';
import { formatDateTime } from '../../lib/format';

const QUICK_VIEWS = [
  { key: 'all_open', label: 'All Open' },
  { key: 'my_jobs', label: 'My Jobs' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'waiting_material', label: 'Waiting Material' },
  { key: 'waiting_approval', label: 'Waiting Approval' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'verification', label: 'Verification' },
  { key: 'closed', label: 'Closed' },
  { key: 'reopened', label: 'Reopened' },
];

export function JobListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  const view = params.get('view') ?? undefined;
  const q = params.get('q') ?? '';
  const projectId = params.get('projectId') ?? undefined;
  const stageKey = params.get('stageKey') ?? undefined;
  const engineerId = params.get('engineerId') ?? undefined;
  const page = Number(params.get('page') ?? '1');

  const queryParams = useMemo(
    () => ({ view, q: q || undefined, projectId, stageKey, engineerId, page, pageSize: 25 }),
    [view, q, projectId, stageKey, engineerId, page],
  );
  const { data, isLoading } = useJobList(queryParams);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };

  const activeFilterCount = [view, projectId, stageKey, engineerId].filter(Boolean).length;

  const columns: Column<JobListItem>[] = [
    { key: 'jobNumber', header: 'Job Card', render: (r) => <span className="font-medium text-content dark:text-content-dark">{r.jobNumber}</span> },
    { key: 'project', header: 'Project', render: (r) => r.project },
    { key: 'locationText', header: 'Location', render: (r) => r.locationText },
    { key: 'category', header: 'Category', render: (r) => r.category },
    { key: 'priority', header: 'Priority', render: (r) => r.priority },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'engineer', header: 'Engineer', render: (r) => r.engineer ?? '—' },
    { key: 'nextAction', header: 'Next Action', render: (r) => r.nextAction ?? '—' },
    {
      key: 'nextActionDueAt',
      header: 'Due',
      render: (r) =>
        r.nextActionDueAt ? (
          <span className={new Date(r.nextActionDueAt) < new Date() && r.isOpen ? 'font-medium text-danger-strong dark:text-danger' : ''}>
            {formatDateTime(r.nextActionDueAt)}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Job Cards"
        description="Every service issue, from intake to closure."
        action={
          <PermissionGate permissions={['job.create']}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Job Card
            </Button>
          </PermissionGate>
        }
      />

      <Toolbar search={q} onSearchChange={(v) => setParam('q', v || undefined)} searchPlaceholder="Search job number or location…" activeFilterCount={activeFilterCount} onClearFilters={() => setParams({})}>
        <select
          aria-label="Quick view"
          value={view ?? ''}
          onChange={(e) => setParam('view', e.target.value || undefined)}
          className="h-10 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
        >
          <option value="">All views</option>
          {QUICK_VIEWS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        emptyTitle="No Job Cards match these filters"
        emptyReason="Try a different quick view, or clear filters to see everything you have access to."
        onRowClick={(row) => navigate(`/jobs/${row.id}`)}
        pagination={data ? { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: (p) => setParam('page', String(p)) } : undefined}
      />

      <CreateJobDrawer open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => navigate(`/jobs/${id}`)} />
    </div>
  );
}
