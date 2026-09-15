import { CheckCircle2, Clock, AlertTriangle, Info, PauseCircle, RotateCcw, Ban } from 'lucide-react';
import type { JobStatus } from '@servicedesk/shared';
import { Badge, type BadgeTone } from './Badge';

// Status -> {tone, icon, label}, per NEXORA_COMPONENT_LIBRARY.md "Status mapping":
// color is always paired with a label/icon, never used alone (§ accessibility rule).
const STATUS_MAP: Record<JobStatus, { tone: BadgeTone; icon: typeof CheckCircle2; label: string }> = {
  DRAFT: { tone: 'neutral', icon: Info, label: 'Draft' },
  RAISED: { tone: 'info', icon: Info, label: 'Raised' },
  UNDER_TRIAGE: { tone: 'info', icon: Clock, label: 'Under Triage' },
  ASSIGNED: { tone: 'info', icon: Clock, label: 'Assigned' },
  SITE_VISIT_PENDING: { tone: 'warning', icon: Clock, label: 'Site Visit Pending' },
  SITE_VISIT_COMPLETED: { tone: 'info', icon: CheckCircle2, label: 'Site Visit Completed' },
  DIAGNOSIS_PENDING: { tone: 'warning', icon: Clock, label: 'Diagnosis Pending' },
  SCOPE_PENDING: { tone: 'warning', icon: Clock, label: 'Scope Pending' },
  WAITING_MATERIAL: { tone: 'warning', icon: PauseCircle, label: 'Waiting Material' },
  WAITING_APPROVAL: { tone: 'warning', icon: PauseCircle, label: 'Waiting Approval' },
  READY_TO_START: { tone: 'info', icon: Clock, label: 'Ready to Start' },
  IN_PROGRESS: { tone: 'warning', icon: Clock, label: 'In Progress' },
  PARTIALLY_COMPLETED: { tone: 'warning', icon: Clock, label: 'Partially Completed' },
  WORK_COMPLETED: { tone: 'info', icon: CheckCircle2, label: 'Work Completed' },
  VERIFICATION_PENDING: { tone: 'warning', icon: Clock, label: 'Verification Pending' },
  CLOSED: { tone: 'success', icon: CheckCircle2, label: 'Closed' },
  REOPENED: { tone: 'danger', icon: RotateCcw, label: 'Reopened' },
  ON_HOLD: { tone: 'warning', icon: PauseCircle, label: 'On Hold' },
  CANCELLED: { tone: 'neutral', icon: Ban, label: 'Cancelled' },
  CLOSED_NOT_FEASIBLE: { tone: 'neutral', icon: Ban, label: 'Closed — Not Feasible' },
  CLOSED_DUPLICATE: { tone: 'neutral', icon: Ban, label: 'Closed — Duplicate' },
  CLOSED_NO_ACTION: { tone: 'neutral', icon: Ban, label: 'Closed — No Action' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const meta = STATUS_MAP[status] ?? { tone: 'neutral' as BadgeTone, icon: AlertTriangle, label: status };
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} icon={<Icon className="h-3 w-3" aria-hidden />}>
      {meta.label}
    </Badge>
  );
}
