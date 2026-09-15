import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { nextJobNumber, nextRequestNumber } from '../../lib/jobNumber.js';
import { writeAudit } from '../../lib/audit.js';
import { selectTemplateKey, assertTransition, STAGE_KEY_FOR_COMMAND, DYNAMIC_STAGE_CLOSE_COMMANDS, type WorkflowCommand } from '../../lib/workflowEngine.js';
import { computeStageDueDate } from '../../lib/slaEngine.js';
import { badRequest, notFound } from '../../lib/httpError.js';
import type { CreateServiceRequestInput } from '@servicedesk/shared';
import type { JobStatus } from '@servicedesk/shared';
import type { AccessContext } from '../../lib/accessContext.js';

export async function createJobCard(ctx: AccessContext, input: CreateServiceRequestInput) {
  // project/category/priority are fetched purely to 404 on a bad id; only jobType.code is used below.
  const [_project, _category, jobType, _priority] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: input.projectId } }),
    prisma.workCategory.findUniqueOrThrow({ where: { id: input.categoryId } }),
    prisma.jobType.findUniqueOrThrow({ where: { id: input.jobTypeId } }),
    prisma.priority.findUniqueOrThrow({ where: { id: input.priorityId } }),
  ]);

  const templateKey = selectTemplateKey({
    jobTypeCode: jobType.code,
    isEmergency: input.isEmergency,
    vendorRelated: input.vendorRelated,
  });
  const template = await prisma.workflowTemplate.findUniqueOrThrow({
    where: { key: templateKey },
    include: { stages: { orderBy: { sequence: 'asc' } } },
  });
  if (template.stages.length === 0) {
    throw badRequest(`Workflow template ${templateKey} has no seeded stages`);
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const requestNumber = await nextRequestNumber(tx);
    const serviceRequest = await tx.serviceRequest.create({
      data: {
        requestNumber,
        projectId: input.projectId,
        locationText: input.locationText,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        jobTypeId: input.jobTypeId,
        priorityId: input.priorityId,
        narration: input.narration,
        requesterId: ctx.userId,
        requesterName: input.requesterName,
        requesterContact: input.requesterContact ?? null,
        desiredCompletionDate: input.desiredCompletionDate ? new Date(input.desiredCompletionDate) : null,
        isEmergency: input.isEmergency,
        safetyIssue: input.safetyIssue,
        vendorRelated: input.vendorRelated,
        assetTag: input.assetTag ?? null,
        unitNumber: input.unitNumber ?? null,
        duplicateOfId: input.linkedJobCardId ?? null,
      },
    });

    const jobNumber = await nextJobNumber(tx);
    const firstStage = template.stages[0];
    // Computed up front so it can seed JobCard.nextActionDueAt on the very first write — this
    // field is what the Overdue KPI, attention queue, and reports all filter on (see
    // advanceStage() below for why it must be kept in sync on every later transition too).
    const firstStagePlannedDueAt = await computeStageDueDate({
      projectId: input.projectId,
      categoryId: input.categoryId,
      priorityId: input.priorityId,
      stageKey: firstStage.key,
      startAt: now,
    });

    const jobCard = await tx.jobCard.create({
      data: {
        jobNumber,
        serviceRequestId: serviceRequest.id,
        projectId: input.projectId,
        locationId: input.locationId ?? null,
        locationText: input.locationText,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        jobTypeId: input.jobTypeId,
        priorityId: input.priorityId,
        workflowTemplateId: template.id,
        status: 'RAISED',
        currentStageKey: firstStage.key,
        nextAction: firstStage.name,
        nextActionDueAt: firstStagePlannedDueAt,
        targetCompletionAt: input.desiredCompletionDate ? new Date(input.desiredCompletionDate) : null,
        originalTargetCompletionAt: input.desiredCompletionDate ? new Date(input.desiredCompletionDate) : null,
        createdById: ctx.userId,
        isEmergency: input.isEmergency,
        safetyIssue: input.safetyIssue,
        assetTag: input.assetTag ?? null,
        unitNumber: input.unitNumber ?? null,
      },
    });

    for (const [i, stageTemplate] of template.stages.entries()) {
      const isFirst = i === 0;
      const plannedDueAt = isFirst ? firstStagePlannedDueAt : null;
      await tx.jobStage.create({
        data: {
          jobCardId: jobCard.id,
          stageKey: stageTemplate.key,
          name: stageTemplate.name,
          sequence: stageTemplate.sequence,
          status: isFirst ? 'ACTIVE' : 'PENDING',
          ownerRole: stageTemplate.ownerRole,
          actualStartAt: isFirst ? now : null,
          plannedStartAt: isFirst ? now : null,
          plannedDueAt,
        },
      });
    }

    await tx.comment.create({
      data: { jobCardId: jobCard.id, authorId: ctx.userId, body: `Job Card ${jobNumber} created from request ${requestNumber}.`, isSystem: true },
    });

    await writeAudit(tx, {
      entityType: 'JobCard',
      entityId: jobCard.id,
      action: 'CREATED',
      actorId: ctx.userId,
      newValue: { jobNumber, status: 'RAISED', templateKey },
    });

    return tx.jobCard.findUniqueOrThrow({ where: { id: jobCard.id }, include: fullJobInclude });
  });
}

export const fullJobInclude = {
  project: true,
  location: true,
  category: true,
  subcategory: true,
  jobType: true,
  priority: true,
  workflowTemplate: true,
  serviceRequest: true,
  stages: { orderBy: { sequence: 'asc' as const } },
  assignments: { where: { active: true }, include: { user: true } },
  siteVisits: { orderBy: { startedAt: 'desc' as const }, include: { engineer: true } },
  materials: { orderBy: { createdAt: 'desc' as const } },
  approvals: { orderBy: { requestedAt: 'desc' as const }, include: { approver: true, requestedBy: true } },
  vendorDeps: true,
  holds: { orderBy: { startAt: 'desc' as const } },
  attachments: { orderBy: { uploadedAt: 'desc' as const }, include: { uploadedBy: true } },
  comments: { orderBy: { createdAt: 'asc' as const }, include: { author: true } },
  verifications: { orderBy: { verifiedAt: 'desc' as const }, include: { verifiedBy: true } },
  reopenEvents: { orderBy: { reopenedAt: 'desc' as const } },
  slaPauses: true,
};

/** Resolves which stage (if any) `command` closes for this job: the fixed key from
 * STAGE_KEY_FOR_COMMAND when that stage actually exists in this job's template, otherwise
 * (for DYNAMIC_STAGE_CLOSE_COMMANDS) whatever is currently ACTIVE. Returns null for commands
 * that don't close a stage at all (start/partial/siteVisitStart/requestMaterial/hold/...). See
 * the doc comments on STAGE_KEY_FOR_COMMAND / DYNAMIC_STAGE_CLOSE_COMMANDS in workflowEngine.ts. */
async function resolveStageKeyToClose(tx: Prisma.TransactionClient, jobCardId: string, command: WorkflowCommand): Promise<string | null> {
  const fixedKey = STAGE_KEY_FOR_COMMAND[command];
  if (fixedKey) {
    const stageExists = await tx.jobStage.findUnique({ where: { jobCardId_stageKey: { jobCardId, stageKey: fixedKey } } });
    if (stageExists) return fixedKey;
  }
  if (DYNAMIC_STAGE_CLOSE_COMMANDS.has(command)) {
    const job = await tx.jobCard.findUnique({ where: { id: jobCardId } });
    return job?.currentStageKey ?? null;
  }
  return null;
}

/** Advances the workflow to the stage `command` closes: closes every not-yet-done stage up to
 * and including it (so an earlier stage with no dedicated closing command — e.g. TRIAGE, which
 * precedes ASSIGN but has no "triage" command of its own — never gets orphaned ACTIVE forever),
 * then activates the next PENDING stage after it. Pure bookkeeping so the stage tracker (§11)
 * never has to infer stage state from JobCard.status. */
export async function advanceStage(tx: Prisma.TransactionClient, jobCardId: string, command: WorkflowCommand, actorRole?: string | null) {
  const stageKey = await resolveStageKeyToClose(tx, jobCardId, command);
  if (!stageKey) return;
  const current = await tx.jobStage.findUnique({ where: { jobCardId_stageKey: { jobCardId, stageKey } } });
  if (!current || current.status === 'DONE') return;
  await tx.jobStage.updateMany({
    where: { jobCardId, sequence: { lte: current.sequence }, status: { in: ['ACTIVE', 'PENDING'] } },
    data: { status: 'DONE', actualCompletedAt: new Date() },
  });
  const next = await tx.jobStage.findFirst({
    where: { jobCardId, sequence: { gt: current.sequence }, status: 'PENDING' },
    orderBy: { sequence: 'asc' },
  });
  if (next) {
    const job = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
    const plannedDueAt = await computeStageDueDate({
      projectId: job.projectId,
      categoryId: job.categoryId,
      priorityId: job.priorityId,
      stageKey: next.stageKey,
      startAt: new Date(),
    });
    await tx.jobStage.update({
      where: { id: next.id },
      data: { status: 'ACTIVE', actualStartAt: new Date(), plannedStartAt: new Date(), plannedDueAt },
    });
    await tx.jobCard.update({
      where: { id: jobCardId },
      data: { currentStageKey: next.stageKey, nextAction: next.name, nextActionDueAt: plannedDueAt, currentOwnerRole: next.ownerRole ?? actorRole ?? null },
    });
  }
}

/**
 * Jumps straight to `targetStageKey` if this job's template actually has that stage and it's
 * still PENDING/ahead of wherever the job currently is — a no-op otherwise. This backs
 * material/approval discovery (jobs/routes.ts requestMaterial/requestApproval handlers): a
 * SIMPLE_REPAIR job that discovers it needs material mid-EXECUTION has no MATERIAL stage in
 * its template, so this correctly does nothing and leaves EXECUTION active, while a
 * MATERIAL_REQUIRED job moves its MATERIAL box from PENDING to ACTIVE so the bottleneck view
 * (§28) can actually see it. Never used to go *backwards* in sequence.
 */
export async function activateStageIfPresent(tx: Prisma.TransactionClient, jobCardId: string, targetStageKey: string) {
  const target = await tx.jobStage.findUnique({ where: { jobCardId_stageKey: { jobCardId, stageKey: targetStageKey } } });
  if (!target || target.status === 'DONE' || target.status === 'ACTIVE') return;

  const currentActive = await tx.jobStage.findFirst({ where: { jobCardId, status: 'ACTIVE' } });
  if (currentActive && currentActive.sequence >= target.sequence) return; // never rewind

  if (currentActive) {
    await tx.jobStage.update({ where: { id: currentActive.id }, data: { status: 'DONE', actualCompletedAt: new Date() } });
  }
  await tx.jobStage.updateMany({
    where: { jobCardId, sequence: { gt: currentActive?.sequence ?? -1, lt: target.sequence }, status: 'PENDING' },
    data: { status: 'DONE', actualCompletedAt: new Date() },
  });

  const job = await tx.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
  const plannedDueAt = await computeStageDueDate({
    projectId: job.projectId,
    categoryId: job.categoryId,
    priorityId: job.priorityId,
    stageKey: target.stageKey,
    startAt: new Date(),
  });
  await tx.jobStage.update({ where: { id: target.id }, data: { status: 'ACTIVE', actualStartAt: new Date(), plannedStartAt: new Date(), plannedDueAt } });
  await tx.jobCard.update({
    where: { id: jobCardId },
    data: { currentStageKey: target.stageKey, nextAction: target.name, nextActionDueAt: plannedDueAt, currentOwnerRole: target.ownerRole },
  });
}

export async function runSimpleCommand(params: {
  jobCardId: string;
  command: WorkflowCommand;
  actorId: string;
  actorRole?: string | null;
  reason?: string;
  /** e.g. 'MATERIAL' when command is requestMaterial — activates that stage if the job's
   * template actually has it (see activateStageIfPresent). */
  activateStageKey?: string;
}) {
  const { jobCardId, command, actorId } = params;
  return prisma.$transaction(async (tx) => {
    const job = await tx.jobCard.findUnique({ where: { id: jobCardId } });
    if (!job) throw notFound('Job Card not found');
    const target = assertTransition(command, job.status as JobStatus);
    const toStatus = target === 'PRESERVE_PRE_HOLD' ? job.statusBeforeHold ?? 'RAISED' : target;

    const updated = await tx.jobCard.update({
      where: { id: jobCardId },
      data: {
        status: toStatus,
        closedAt: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION'].includes(toStatus) ? new Date() : job.closedAt,
      },
    });

    await advanceStage(tx, jobCardId, command, params.actorRole);
    if (params.activateStageKey) await activateStageIfPresent(tx, jobCardId, params.activateStageKey);

    await writeAudit(tx, {
      entityType: 'JobCard',
      entityId: jobCardId,
      action: command.toUpperCase(),
      actorId,
      oldValue: { status: job.status },
      newValue: { status: toStatus },
      reason: params.reason,
    });

    await tx.comment.create({
      data: { jobCardId, authorId: actorId, isSystem: true, body: `Status changed: ${job.status} -> ${toStatus} (${command}).` },
    });

    return tx.jobCard.findUniqueOrThrow({ where: { id: updated.id }, include: fullJobInclude });
  });
}
