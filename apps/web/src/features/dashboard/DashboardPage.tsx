import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { PageHeader } from '../../ui/PageHeader';
import { KpiCard } from '../../ui/KpiCard';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';

interface Summary {
  open: number;
  dueToday: number;
  overdue: number;
  atRisk: number;
  waitingMaterial: number;
  waitingApproval: number;
  inProgress: number;
  verificationPending: number;
  closedThisPeriod: number;
  reopened: number;
}

interface ProjectHealth {
  project: string;
  projectId: string;
  open: number;
  overdue: number;
  dueToday: number;
  waitingMaterial: number;
  waitingApproval: number;
  closed: number;
  reopenRate: number;
}

interface Bottleneck {
  stageKey: string;
  name: string;
  count: number;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const summary = useQuery({ queryKey: queryKeys.dashboardSummary(), queryFn: async () => (await apiClient.get<Summary>('/dashboard/summary')).data });
  const health = useQuery({ queryKey: queryKeys.projectHealth(), queryFn: async () => (await apiClient.get<ProjectHealth[]>('/dashboard/project-health')).data });
  const bottlenecks = useQuery({ queryKey: queryKeys.bottlenecks(), queryFn: async () => (await apiClient.get<Bottleneck[]>('/dashboard/bottlenecks')).data });

  const goTo = (view: string) => navigate(`/jobs?view=${view}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Everything that needs attention across Service Engineering, at a glance." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Open Jobs" value={summary.data?.open ?? '—'} onClick={() => goTo('all_open')} />
        <KpiCard label="Due Today" value={summary.data?.dueToday ?? '—'} accent="info" onClick={() => goTo('due_today')} />
        <KpiCard label="Overdue" value={summary.data?.overdue ?? '—'} accent="danger" onClick={() => goTo('overdue')} />
        <KpiCard label="Waiting Material" value={summary.data?.waitingMaterial ?? '—'} accent="warning" onClick={() => goTo('waiting_material')} />
        <KpiCard label="Waiting Approval" value={summary.data?.waitingApproval ?? '—'} accent="warning" onClick={() => goTo('waiting_approval')} />
        <KpiCard label="In Progress" value={summary.data?.inProgress ?? '—'} onClick={() => goTo('in_progress')} />
        <KpiCard label="Verification Pending" value={summary.data?.verificationPending ?? '—'} accent="info" onClick={() => goTo('verification')} />
        <KpiCard label="Closed (30d)" value={summary.data?.closedThisPeriod ?? '—'} accent="success" onClick={() => goTo('closed')} />
        <KpiCard label="Reopened" value={summary.data?.reopened ?? '—'} accent="danger" onClick={() => goTo('reopened')} />
      </div>

      <Card header={<h2 className="text-base font-semibold text-content dark:text-content-dark">Project Health</h2>}>
        {health.isLoading ? (
          <p className="text-sm text-content-muted">Loading…</p>
        ) : !health.data || health.data.length === 0 ? (
          <EmptyState title="No projects yet" reason="Add a project in Masters to see health here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-content-muted dark:text-content-dark-muted">
                <tr>
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Open</th>
                  <th className="py-2 pr-4">Overdue</th>
                  <th className="py-2 pr-4">Due Today</th>
                  <th className="py-2 pr-4">Waiting Material</th>
                  <th className="py-2 pr-4">Waiting Approval</th>
                  <th className="py-2 pr-4">Reopen Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border-dark">
                {health.data.map((p) => (
                  <tr
                    key={p.projectId}
                    className="cursor-pointer hover:bg-surface-muted dark:hover:bg-surface-dark-muted"
                    onClick={() => navigate(`/jobs?projectId=${p.projectId}`)}
                  >
                    <td className="py-2 pr-4 font-medium text-content dark:text-content-dark">{p.project}</td>
                    <td className="py-2 pr-4">{p.open}</td>
                    <td className="py-2 pr-4 text-danger">{p.overdue}</td>
                    <td className="py-2 pr-4">{p.dueToday}</td>
                    <td className="py-2 pr-4">{p.waitingMaterial}</td>
                    <td className="py-2 pr-4">{p.waitingApproval}</td>
                    <td className="py-2 pr-4">{p.reopenRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card header={<h2 className="text-base font-semibold text-content dark:text-content-dark">Where work is stuck (bottlenecks)</h2>}>
        {!bottlenecks.data || bottlenecks.data.length === 0 ? (
          <EmptyState title="No active bottlenecks" reason="No stages currently have jobs stuck in them." />
        ) : (
          <div className="flex flex-col gap-2">
            {bottlenecks.data.map((b) => (
              <div key={b.stageKey} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-content dark:text-content-dark">{b.name}</span>
                <div className="h-2 flex-1 rounded-full bg-surface-muted dark:bg-surface-dark-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (b.count / Math.max(...bottlenecks.data!.map((x) => x.count), 1)) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-content dark:text-content-dark">{b.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
