import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { StatusBadge } from '../../ui/StatusBadge';
import { EmptyState } from '../../ui/EmptyState';
import { useJobList } from './api';
import type { JobListItem } from '../../types/job';
import { formatDateTime } from '../../lib/format';

function JobRow({ job, onClick }: { job: JobListItem; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left text-sm transition-colors duration-fast hover:bg-surface-muted dark:border-border-dark dark:hover:bg-surface-dark-muted">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-content dark:text-content-dark">{job.jobNumber}</span>
        <StatusBadge status={job.status} />
      </div>
      <span className="text-content-muted dark:text-content-dark-muted">{job.locationText}</span>
      <span className="font-medium text-primary">{job.nextAction ?? 'No next action set'}</span>
      {job.nextActionDueAt && <span className="text-xs text-content-muted dark:text-content-dark-muted">Due {formatDateTime(job.nextActionDueAt)}</span>}
    </button>
  );
}

export function MyJobsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useJobList({ view: 'my_jobs', pageSize: 100 });
  const jobs = data?.items ?? [];

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  const overdue = jobs.filter((j) => j.isOpen && j.nextActionDueAt && new Date(j.nextActionDueAt) < now);
  const today = jobs.filter((j) => j.isOpen && j.nextActionDueAt && new Date(j.nextActionDueAt) >= startOfDay && new Date(j.nextActionDueAt) <= endOfDay);
  const blocked = jobs.filter((j) => ['WAITING_MATERIAL', 'WAITING_APPROVAL', 'ON_HOLD'].includes(j.status));
  const upcoming = jobs.filter((j) => !overdue.includes(j) && !today.includes(j) && !blocked.includes(j) && j.isOpen);

  const sections: { title: string; items: JobListItem[]; emptyReason: string }[] = [
    { title: 'Overdue', items: overdue, emptyReason: 'Nothing overdue — good work.' },
    { title: 'Today', items: today, emptyReason: 'Nothing due today.' },
    { title: 'Blocked', items: blocked, emptyReason: 'No jobs are blocked on material/approval/hold.' },
    { title: 'Upcoming', items: upcoming, emptyReason: 'No other open jobs assigned to you.' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Jobs" description="What you need to do next — nothing else." />
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.title} header={<h2 className="text-base font-semibold text-content dark:text-content-dark">{s.title} ({s.items.length})</h2>}>
              {s.items.length === 0 ? (
                <EmptyState title="All clear" reason={s.emptyReason} />
              ) : (
                <div className="flex flex-col gap-2">
                  {s.items.map((j) => (
                    <JobRow key={j.id} job={j} onClick={() => navigate(`/jobs/${j.id}`)} />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
