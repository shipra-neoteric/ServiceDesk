import { prisma } from '../../lib/db.js';
import type { AccessContext } from '../../lib/accessContext.js';
import { jobCardScopeWhere } from '../../lib/projectScope.js';

export interface AttentionItem {
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

const OPEN_STATUS_FILTER = { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] };

function hoursSince(date: Date) {
  return Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10;
}

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

  // 1. Overdue jobs (next action due date has passed).
  const overdue = await prisma.jobCard.findMany({
    where: { ...scope, status: OPEN_STATUS_FILTER, nextActionDueAt: { lt: now } },
    include: { project: true },
  });
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
      dueBy: j.nextActionDueAt?.toISOString() ?? null,
      hoursLate: j.nextActionDueAt ? hoursSince(j.nextActionDueAt) : null,
      severity: 'HIGH',
      recommendedAction: 'Follow up with current owner or reassign.',
    });
  }

  // 2. Due within 4 business hours (at risk).
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
      dueBy: j.nextActionDueAt?.toISOString() ?? null,
      hoursLate: null,
      severity: 'MEDIUM',
      recommendedAction: 'Confirm progress before the deadline passes.',
    });
  }

  // 3. No owner assigned, sitting in intake.
  const noOwner = await prisma.jobCard.findMany({
    where: { ...scope, status: { in: ['RAISED', 'UNDER_TRIAGE'] }, currentOwnerUserId: null },
  });
  for (const j of noOwner) {
    items.push({
      id: `no-owner-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'NO_OWNER',
      title: `${j.jobNumber} has no engineer assigned`,
      whatHappened: 'Job is raised/under triage but nobody is assigned.',
      why: 'currentOwnerUserId is empty while the job is not a terminal status.',
      currentOwner: null,
      dueBy: null,
      hoursLate: hoursSince(j.createdAt),
      severity: hoursSince(j.createdAt) > 24 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Assign an engineer now.',
    });
  }

  // 4. Material requirement pending too long.
  const staleMaterials = await prisma.materialRequirement.findMany({
    where: {
      status: 'REQUIREMENT_RAISED',
      createdAt: { lt: new Date(now.getTime() - 48 * 3_600_000) },
      jobCard: { ...scope },
    },
    include: { jobCard: true },
  });
  for (const m of staleMaterials) {
    items.push({
      id: `material-${m.id}`,
      jobCardId: m.jobCardId,
      jobNumber: m.jobCard.jobNumber,
      type: 'MATERIAL_BLOCKED',
      title: `${m.jobCard.jobNumber}: material "${m.item}" pending > 48h`,
      whatHappened: `Material requirement raised ${m.createdAt.toISOString()} still has no availability decision.`,
      why: 'MaterialRequirement.status has stayed REQUIREMENT_RAISED beyond the 48h expectation.',
      currentOwner: 'MATERIAL_TEAM',
      dueBy: m.requiredByDate?.toISOString() ?? null,
      hoursLate: hoursSince(m.createdAt) - 48,
      severity: 'MEDIUM',
      recommendedAction: 'Chase material availability or mark not available.',
    });
  }

  // 5. Approval overdue.
  const staleApprovals = await prisma.approval.findMany({
    where: { decision: 'PENDING', requestedAt: { lt: new Date(now.getTime() - 24 * 3_600_000) }, jobCard: { ...scope } },
    include: { jobCard: true, approver: true },
  });
  for (const a of staleApprovals) {
    items.push({
      id: `approval-${a.id}`,
      jobCardId: a.jobCardId,
      jobNumber: a.jobCard.jobNumber,
      type: 'APPROVAL_OVERDUE',
      title: `${a.jobCard.jobNumber}: approval pending from ${a.approver.name} > 24h`,
      whatHappened: `Approval type "${a.type}" requested ${a.requestedAt.toISOString()} still undecided.`,
      why: 'Approval.decision has stayed PENDING beyond the 24h expectation.',
      currentOwner: a.approver.name,
      dueBy: null,
      hoursLate: hoursSince(a.requestedAt) - 24,
      severity: 'HIGH',
      recommendedAction: 'Escalate to approver or their manager.',
    });
  }

  // 6. Hold review expired.
  const expiredHolds = await prisma.hold.findMany({
    where: { endAt: null, reviewDueAt: { lt: now }, jobCard: { ...scope } },
    include: { jobCard: true },
  });
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
      dueBy: h.reviewDueAt.toISOString(),
      hoursLate: hoursSince(h.reviewDueAt),
      severity: 'MEDIUM',
      recommendedAction: 'Review the hold: resume, extend, or escalate.',
    });
  }

  // 7. Reopened jobs (recurrence signal).
  const reopened = await prisma.jobCard.findMany({ where: { ...scope, status: 'REOPENED' } });
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
      dueBy: null,
      hoursLate: null,
      severity: j.reopenCount >= 2 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'Investigate root cause before re-closing.',
    });
  }

  // 8. Verification pending too long.
  const staleVerification = await prisma.jobCard.findMany({
    where: { ...scope, status: 'WORK_COMPLETED', updatedAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } },
  });
  for (const j of staleVerification) {
    items.push({
      id: `verify-${j.id}`,
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      type: 'VERIFICATION_PENDING',
      title: `${j.jobNumber}: verification pending > 24h`,
      whatHappened: 'Engineer marked work completed but nobody has verified it.',
      why: 'JobCard.status has stayed WORK_COMPLETED beyond 24h.',
      currentOwner: 'VERIFIER',
      dueBy: null,
      hoursLate: hoursSince(j.updatedAt) - 24,
      severity: 'MEDIUM',
      recommendedAction: 'Verify the completed work.',
    });
  }

  return items.sort((a, b) => (b.hoursLate ?? 0) - (a.hoursLate ?? 0));
}
