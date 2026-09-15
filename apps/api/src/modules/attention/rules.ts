import { prisma } from '../../lib/db.js';
import type { AccessContext } from '../../lib/accessContext.js';
import { jobCardScopeWhere } from '../../lib/projectScope.js';

export interface AttentionItem {
  id: string;
  jobCardId: string | null;
  jobNumber: string | null;
  type: string;
  title: string;
  whatHappened: string;
  why: string;
  currentOwner: string | null;
  nextAction: string | null;
  dueBy: string | null;
  hoursLate: number | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedAction: string;
  /** Always navigable: a single job's detail route, or a pre-filtered Job Card list for
   * aggregate items (e.g. engineer workload) that don't point at one specific job. */
  link: string;
}

const OPEN_STATUS_FILTER = { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] };

function hoursSince(date: Date) {
  return Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10;
}

/** Reads a Master-Admin-configured threshold (Masters > Escalation Rules); falls back to the
 * documented default when no active rule exists for this triggerType, so the rule engine is
 * never silently disabled by a missing row. */
async function resolveThresholdHours(triggerType: string, fallbackHours: number): Promise<number> {
  const rule = await prisma.escalationRule.findUnique({ where: { triggerType } });
  if (rule && rule.active) return rule.thresholdHours;
  return fallbackHours;
}

const ENGINEER_OVERLOAD_THRESHOLD = 6; // active jobs per engineer — L1 constant, not yet Master-configurable (see README gaps)

/**
 * Deterministic, rule-based exception detection (§22/§23). Every rule here is a pure query
 * over normalized fields — never a free-text guess — and is exposed over this same function
 * to both the human Process Coordinator dashboard and (per ARCHITECTURE.md §7) a future AI
 * agent, so both consume identical, explainable "what/why/owner/next action" items.
 */
export async function computeAttentionItems(ctx: AccessContext): Promise<AttentionItem[]> {
  const scope = jobCardScopeWhere(ctx);
  const now = new Date();
  const items: AttentionItem[] = [];

  // 1. Overdue: next action due date has passed on an open stage.
  const overdue = await prisma.jobCard.findMany({ where: { ...scope, status: OPEN_STATUS_FILTER, nextActionDueAt: { lt: now } } });
  for (const j of overdue) {
    items.push({
      id: `overdue-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'OVERDUE',
      title: `${j.jobNumber} is overdue`,
      whatHappened: `Next action "${j.nextAction ?? j.currentStageKey}" was due ${j.nextActionDueAt?.toISOString()}.`,
      why: 'Next-action due date has passed while the job is still open.',
      currentOwner: j.currentOwnerRole,
      nextAction: j.nextAction,
      dueBy: j.nextActionDueAt?.toISOString() ?? null,
      hoursLate: j.nextActionDueAt ? hoursSince(j.nextActionDueAt) : null,
      severity: 'HIGH',
      recommendedAction: 'Follow up with current owner or reassign.',
      link: `/jobs/${j.id}`,
    });
  }

  // 2. At risk of SLA breach: due within the next 4 hours, not yet overdue.
  const riskWindow = new Date(now.getTime() + 4 * 3_600_000);
  const atRisk = await prisma.jobCard.findMany({
    where: { ...scope, status: OPEN_STATUS_FILTER, nextActionDueAt: { gte: now, lte: riskWindow } },
  });
  for (const j of atRisk) {
    items.push({
      id: `at-risk-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'AT_RISK',
      title: `${j.jobNumber} due within 4 hours`,
      whatHappened: `Next action "${j.nextAction ?? j.currentStageKey}" is due soon.`,
      why: 'Due date falls inside the at-risk warning window.',
      currentOwner: j.currentOwnerRole,
      nextAction: j.nextAction,
      dueBy: j.nextActionDueAt?.toISOString() ?? null,
      hoursLate: null,
      severity: 'MEDIUM',
      recommendedAction: 'Confirm progress before the deadline passes.',
      link: `/jobs/${j.id}`,
    });
  }

  // 3. No owner assigned, sitting in intake.
  const noOwner = await prisma.jobCard.findMany({ where: { ...scope, status: { in: ['RAISED', 'UNDER_TRIAGE'] }, currentOwnerUserId: null } });
  for (const j of noOwner) {
    const hrs = hoursSince(j.createdAt);
    items.push({
      id: `no-owner-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'NO_OWNER',
      title: `${j.jobNumber} has no engineer assigned`,
      whatHappened: 'Job is raised/under triage but nobody is assigned.',
      why: 'currentOwnerUserId is empty while the job is not a terminal status.',
      currentOwner: null,
      nextAction: j.nextAction,
      dueBy: null,
      hoursLate: hrs,
      severity: hrs > 24 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Assign an engineer now.',
      link: `/jobs/${j.id}`,
    });
  }

  // 4. Material requirement pending too long (threshold configurable via Escalation Rules).
  const materialThreshold = await resolveThresholdHours('MATERIAL_BLOCKED', 48);
  const staleMaterials = await prisma.materialRequirement.findMany({
    where: { status: 'REQUIREMENT_RAISED', createdAt: { lt: new Date(now.getTime() - materialThreshold * 3_600_000) }, jobCard: { ...scope } },
    include: { jobCard: true },
  });
  for (const m of staleMaterials) {
    items.push({
      id: `material-${m.id}`,
      jobCardId: m.jobCardId,
      jobNumber: m.jobCard.jobNumber,
      type: 'MATERIAL_BLOCKED',
      title: `${m.jobCard.jobNumber}: material "${m.item}" pending > ${materialThreshold}h`,
      whatHappened: `Material requirement raised ${m.createdAt.toISOString()} still has no availability decision.`,
      why: `MaterialRequirement.status has stayed REQUIREMENT_RAISED beyond the ${materialThreshold}h expectation.`,
      currentOwner: 'MATERIAL_TEAM',
      nextAction: m.jobCard.nextAction,
      dueBy: m.requiredByDate?.toISOString() ?? null,
      hoursLate: hoursSince(m.createdAt) - materialThreshold,
      severity: 'MEDIUM',
      recommendedAction: 'Chase material availability or mark not available.',
      link: `/jobs/${m.jobCardId}`,
    });
  }

  // 5. Approval overdue (threshold configurable via Escalation Rules).
  const approvalThreshold = await resolveThresholdHours('APPROVAL_OVERDUE', 24);
  const staleApprovals = await prisma.approval.findMany({
    where: { decision: 'PENDING', requestedAt: { lt: new Date(now.getTime() - approvalThreshold * 3_600_000) }, jobCard: { ...scope } },
    include: { jobCard: true, approver: true },
  });
  for (const a of staleApprovals) {
    items.push({
      id: `approval-${a.id}`,
      jobCardId: a.jobCardId,
      jobNumber: a.jobCard.jobNumber,
      type: 'APPROVAL_OVERDUE',
      title: `${a.jobCard.jobNumber}: approval pending from ${a.approver.name} > ${approvalThreshold}h`,
      whatHappened: `Approval type "${a.type}" requested ${a.requestedAt.toISOString()} still undecided.`,
      why: `Approval.decision has stayed PENDING beyond the ${approvalThreshold}h expectation.`,
      currentOwner: a.approver.name,
      nextAction: a.jobCard.nextAction,
      dueBy: null,
      hoursLate: hoursSince(a.requestedAt) - approvalThreshold,
      severity: 'HIGH',
      recommendedAction: 'Escalate to approver or their manager.',
      link: `/jobs/${a.jobCardId}`,
    });
  }

  // 6. Hold review expired.
  const expiredHolds = await prisma.hold.findMany({ where: { endAt: null, reviewDueAt: { lt: now }, jobCard: { ...scope } }, include: { jobCard: true } });
  for (const h of expiredHolds) {
    items.push({
      id: `hold-${h.id}`,
      jobCardId: h.jobCardId,
      jobNumber: h.jobCard.jobNumber,
      type: 'HOLD_REVIEW_EXPIRED',
      title: `${h.jobCard.jobNumber}: hold review overdue`,
      whatHappened: `On hold for "${h.reasonCode}" since ${h.startAt.toISOString()}; review was due ${h.reviewDueAt.toISOString()}.`,
      why: 'Hold.reviewDueAt has passed with no resume.',
      currentOwner: h.dependencyOwnerRole,
      nextAction: 'Review hold',
      dueBy: h.reviewDueAt.toISOString(),
      hoursLate: hoursSince(h.reviewDueAt),
      severity: 'MEDIUM',
      recommendedAction: 'Review the hold: resume, extend, or escalate.',
      link: `/jobs/${h.jobCardId}`,
    });
  }

  // 7. Reopened jobs (recurrence signal).
  const reopened = await prisma.jobCard.findMany({ where: { ...scope, reopenCount: { gt: 0 }, status: { not: 'CLOSED' } } });
  for (const j of reopened) {
    items.push({
      id: `reopened-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'REOPENED',
      title: `${j.jobNumber} was reopened${j.reopenCount > 1 ? ` (${j.reopenCount} times)` : ''}`,
      whatHappened: 'Job was closed and has since been reopened.',
      why: j.reopenCount >= 2 ? 'Reopened 2+ times — repeated-failure signal.' : 'Reopened after closure.',
      currentOwner: j.currentOwnerRole,
      nextAction: j.nextAction,
      dueBy: null,
      hoursLate: null,
      severity: j.reopenCount >= 2 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Investigate root cause before re-closing.',
      link: `/jobs/${j.id}`,
    });
  }

  // 8. Verification pending too long.
  const verificationThreshold = 24;
  const staleVerification = await prisma.jobCard.findMany({
    where: { ...scope, status: 'WORK_COMPLETED', updatedAt: { lt: new Date(now.getTime() - verificationThreshold * 3_600_000) } },
  });
  for (const j of staleVerification) {
    items.push({
      id: `verify-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'VERIFICATION_PENDING',
      title: `${j.jobNumber}: verification pending > ${verificationThreshold}h`,
      whatHappened: 'Engineer marked work completed but nobody has verified it.',
      why: `JobCard.status has stayed WORK_COMPLETED beyond ${verificationThreshold}h.`,
      currentOwner: 'VERIFIER',
      nextAction: 'Verify completed work',
      dueBy: null,
      hoursLate: hoursSince(j.updatedAt) - verificationThreshold,
      severity: 'MEDIUM',
      recommendedAction: 'Verify the completed work.',
      link: `/jobs/${j.id}`,
    });
  }

  // 9. No update for a configured period — an open job nobody has touched (no comment, no
  // stage change) recently. Distinct from OVERDUE: a job can have no due date set yet and
  // still be silently stalled.
  const noUpdateThreshold = await resolveThresholdHours('NO_UPDATE', 24);
  const staleJobs = await prisma.jobCard.findMany({
    where: { ...scope, status: OPEN_STATUS_FILTER, updatedAt: { lt: new Date(now.getTime() - noUpdateThreshold * 3_600_000) } },
  });
  for (const j of staleJobs) {
    if (items.some((i) => i.jobCardId === j.id && i.type === 'OVERDUE')) continue; // already flagged more specifically
    items.push({
      id: `no-update-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'NO_UPDATE',
      title: `${j.jobNumber}: no update in > ${noUpdateThreshold}h`,
      whatHappened: `Nothing has changed on this job since ${j.updatedAt.toISOString()}.`,
      why: `JobCard.updatedAt has not moved in over ${noUpdateThreshold}h while the job is open.`,
      currentOwner: j.currentOwnerRole,
      nextAction: j.nextAction,
      dueBy: null,
      hoursLate: hoursSince(j.updatedAt) - noUpdateThreshold,
      severity: 'LOW',
      recommendedAction: 'Request a status update from the current owner.',
      link: `/jobs/${j.id}`,
    });
  }

  // 10. Completion evidence missing — a WORK_COMPLETED/CLOSED job with no AFTER-phase evidence.
  // The complete-command endpoint already blocks this synchronously (§17), so this rule exists
  // to catch legacy-imported or manually-fixed-up records that bypassed that check.
  const completedJobs = await prisma.jobCard.findMany({
    where: { ...scope, status: { in: ['WORK_COMPLETED', 'VERIFICATION_PENDING', 'CLOSED'] } },
    include: { attachments: true },
  });
  for (const j of completedJobs) {
    if (j.attachments.some((a) => a.phase === 'AFTER')) continue;
    items.push({
      id: `evidence-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'EVIDENCE_MISSING',
      title: `${j.jobNumber}: completed with no AFTER evidence`,
      whatHappened: 'Job is marked completed/closed but has no AFTER-phase photo or attachment on file.',
      why: 'No Attachment row with phase=AFTER exists for this job.',
      currentOwner: j.currentOwnerRole,
      nextAction: 'Attach completion evidence',
      dueBy: null,
      hoursLate: null,
      severity: 'MEDIUM',
      recommendedAction: 'Request completion evidence from the engineer before final closure.',
      link: `/jobs/${j.id}`,
    });
  }

  // 11. Repeated complaint: 2+ Job Cards at the same project+location+category within 90 days.
  const recentJobs = await prisma.jobCard.findMany({
    where: { ...scope, createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } },
    select: { id: true, jobNumber: true, projectId: true, locationText: true, categoryId: true, currentOwnerRole: true, nextAction: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const byLocation = new Map<string, typeof recentJobs>();
  for (const j of recentJobs) {
    const key = `${j.projectId}|${j.locationText.trim().toLowerCase()}|${j.categoryId}`;
    byLocation.set(key, [...(byLocation.get(key) ?? []), j]);
  }
  for (const group of byLocation.values()) {
    if (group.length < 2) continue;
    const latest = group[0];
    items.push({
      id: `repeat-${latest.id}`,
      jobCardId: latest.id,
      jobNumber: latest.jobNumber,
      type: 'REPEAT_COMPLAINT',
      title: `${latest.jobNumber}: ${group.length} complaints at this location in 90 days`,
      whatHappened: `${group.length} Job Cards raised for the same location/category since ${group[group.length - 1].createdAt.toISOString()}.`,
      why: 'Recurring-issue signal — likely a root cause has not been fixed.',
      currentOwner: latest.currentOwnerRole,
      nextAction: latest.nextAction,
      dueBy: null,
      hoursLate: null,
      severity: group.length >= 3 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Investigate the underlying cause rather than treating each report as isolated.',
      link: `/jobs/${latest.id}`,
    });
  }

  // 12. Target date changed multiple times — a moving-goalpost signal (§44, §75).
  const churnedDueDates = await prisma.jobCard.findMany({ where: { ...scope, status: OPEN_STATUS_FILTER, dueDateChangeCount: { gte: 2 } } });
  for (const j of churnedDueDates) {
    items.push({
      id: `due-date-churn-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'DUE_DATE_CHURN',
      title: `${j.jobNumber}: target date changed ${j.dueDateChangeCount} times`,
      whatHappened: `Original target was ${j.originalTargetCompletionAt?.toISOString() ?? 'not set'}; current target is ${j.targetCompletionAt?.toISOString() ?? 'not set'}.`,
      why: 'JobCard.dueDateChangeCount is 2 or more — the commitment keeps slipping.',
      currentOwner: j.currentOwnerRole,
      nextAction: j.nextAction,
      dueBy: j.targetCompletionAt?.toISOString() ?? null,
      hoursLate: null,
      severity: 'MEDIUM',
      recommendedAction: 'Confirm a firm date with the owner or escalate.',
      link: `/jobs/${j.id}`,
    });
  }

  // 13. Engineer workload pressure — an aggregate item, not tied to one Job Card (§27, §44
  // "assignment overload"); links to that engineer's filtered Job Card list instead.
  const overloadedEngineers = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { key: 'SERVICE_ENGINEER' } } } },
  });
  for (const engineer of overloadedEngineers) {
    const activeCount = await prisma.jobAssignment.count({
      where: {
        userId: engineer.id,
        active: true,
        role: 'ENGINEER',
        jobCard: { ...scope, status: OPEN_STATUS_FILTER },
      },
    });
    if (activeCount < ENGINEER_OVERLOAD_THRESHOLD) continue;
    items.push({
      id: `overload-${engineer.id}`,
      jobCardId: null,
      jobNumber: null,
      type: 'ENGINEER_OVERLOAD',
      title: `${engineer.name} has ${activeCount} active jobs`,
      whatHappened: `${engineer.name} is currently assigned ${activeCount} open Job Cards.`,
      why: `Active assignment count is at/above the overload threshold (${ENGINEER_OVERLOAD_THRESHOLD}).`,
      currentOwner: engineer.name,
      nextAction: 'Rebalance workload',
      dueBy: null,
      hoursLate: null,
      severity: activeCount >= ENGINEER_OVERLOAD_THRESHOLD + 3 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Reassign some of this engineer’s jobs before assigning more.',
      link: `/jobs?engineerId=${engineer.id}`,
    });
  }

  return items.sort((a, b) => (b.hoursLate ?? 0) - (a.hoursLate ?? 0));
}
