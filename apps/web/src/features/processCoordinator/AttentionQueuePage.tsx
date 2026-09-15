import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, PackageX, ShieldAlert, RotateCcw, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';

interface AttentionItem {
  id: string;
  jobCardId: string;
  jobNumber: string;
  type: string;
  title: string;
  whatHappened: string;
  why: string;
  currentOwner: string | null;
  dueBy: string | null;
  hoursLate: number | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedAction: string;
}

const TYPE_ICON: Record<string, typeof AlertTriangle> = {
  OVERDUE: AlertTriangle,
  AT_RISK: Clock,
  NO_OWNER: ShieldAlert,
  MATERIAL_BLOCKED: PackageX,
  APPROVAL_OVERDUE: ShieldAlert,
  HOLD_REVIEW_EXPIRED: Clock,
  REOPENED: RotateCcw,
  VERIFICATION_PENDING: CheckCircle2,
};

const SEVERITY_TONE = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'info' } as const;

export function AttentionQueuePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.attention(),
    queryFn: async () => (await apiClient.get<{ items: AttentionItem[]; total: number }>('/attention')).data,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Process Coordinator" description="Deterministic exception queue — every item explains what happened, why, who owns it, and what to do next." />

      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Nothing needs attention right now" reason="All Job Cards are within SLA with clear owners and no expired holds." icon={<CheckCircle2 className="h-8 w-8" />} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((item) => {
            const Icon = TYPE_ICON[item.type] ?? AlertTriangle;
            return (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-content-muted dark:text-content-dark-muted" aria-hidden />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-content dark:text-content-dark">{item.title}</p>
                        <Badge tone={SEVERITY_TONE[item.severity]}>{item.severity}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-content-muted dark:text-content-dark-muted">
                        <span className="font-medium">What happened:</span> {item.whatHappened}
                      </p>
                      <p className="text-sm text-content-muted dark:text-content-dark-muted">
                        <span className="font-medium">Why flagged:</span> {item.why}
                      </p>
                      <p className="text-sm text-content-muted dark:text-content-dark-muted">
                        <span className="font-medium">Current owner:</span> {item.currentOwner ?? 'Unassigned'}
                        {item.hoursLate !== null && item.hoursLate > 0 && ` · ${item.hoursLate.toFixed(1)}h late`}
                      </p>
                      <p className="mt-1 text-sm font-medium text-primary-strong dark:text-primary">{item.recommendedAction}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/jobs/${item.jobCardId}`)}>
                    Open Job Card
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
