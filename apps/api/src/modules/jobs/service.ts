import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { nextJobNumber, nextRequestNumber } from '../../lib/jobNumber.js';
import { writeAudit } from '../../lib/audit.js';
import { selectTemplateKey, assertTransition, STAGE_KEY_FOR_COMMAND, type WorkflowCommand } from '../../lib/workflowEngine.js';
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
      const plannedDueAt = isFirst
        ? await computeStageDueDate({
            projectId: input.projectId,
            categoryId: input.categoryId,
            priorityId: input.priorityId,
            stageKey: stageTemplate.key,
            startAt: now,
          })
        : null;
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

/** Advances the workflow to `command`'s target stage: closes every not-yet-done stage up to
 * and including it (so an earlier stage with no dedicated closing command — e.g. TRIAGE, which
 * precedes ASSIGN but has no "triage" command of its own — never gets orphaned ACTIVE forever),
 * then activates the next PENDING stage after it. Pure bookkeeping so the stage tracker (§11)
 * never has to infer stage state from JobCard.status. */
export async function advanceStage(tx: Prisma.TransactionClient, jobCardId: string, command: WorkflowCommand, actorRole?: string | null) {
  const stageKey = STAGE_KEY_FOR_COMMAND[command];
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
      data: { currentStageKey: next.stageKey, nextAction: next.name, currentOwnerRole: next.ownerRole ?? actorRole ?? null },
    });
  }
}

export async function runSimpleCommand(params: {
  jobCardId: string;
  command: WorkflowCommand;
  actorId: string;
  actorRole?: string | null;
  reason?: string;
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
