import { Router } from 'express';
import { z } from 'zod';
import {
  CreateServiceRequestSchema,
  AssignJobSchema,
  SiteVisitCompleteSchema,
  HoldJobSchema,
  MaterialRequirementSchema,
  ApprovalRequestSchema,
  ApprovalDecisionBodySchema,
  CompleteJobSchema,
  VerifyJobSchema,
  CloseJobSchema,
  ReopenJobSchema,
  AddCommentSchema,
  isOpenStatus,
  type JobStatus,
} from '@servicedesk/shared';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, conflict, notFound } from '../../lib/httpError.js';
import { canViewProject } from '../../lib/accessContext.js';
import { jobCardScopeWhere } from '../../lib/projectScope.js';
import { findPossibleDuplicates } from '../../lib/duplicateDetection.js';
import { createJobCard, fullJobInclude, runSimpleCommand, advanceStage } from './service.js';
import { assertTransition } from '../../lib/workflowEngine.js';
import { writeAudit } from '../../lib/audit.js';
import { primaryDelayResponsibility, computeStageDueDate } from '../../lib/slaEngine.js';
import { streamJobCardPdf } from '../../lib/jobCardPdf.js';

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

async function loadScopedJob(ctx: NonNullable<Express.Request['access']>, id: string) {
  const job = await prisma.jobCard.findUnique({ where: { id }, include: fullJobInclude });
  if (!job) throw notFound('Job Card not found');
  if (!canViewProject(ctx, job.projectId)) throw notFound('Job Card not found');
  return job;
}

// ---- Duplicate check ----
jobsRouter.get(
  '/check-duplicates',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ projectId: z.string(), locationText: z.string(), categoryId: z.string(), assetTag: z.string().optional() })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query', parsed.error.flatten());
    const dupes = await findPossibleDuplicates(parsed.data);
    res.json(dupes.map((d) => ({ id: d.id, jobNumber: d.jobNumber, status: d.status, locationText: d.locationText, createdAt: d.createdAt })));
  }),
);

// ---- Create ----
jobsRouter.post(
  '/',
  requirePermission('job.create'),
  asyncHandler(async (req, res) => {
    const parsed = CreateServiceRequestSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid Job Card payload', parsed.error.flatten());
    if (!canViewProject(req.access!, parsed.data.projectId)) throw notFound('Project not found');
    const job = await createJobCard(req.access!, parsed.data);
    res.status(201).json(job);
  }),
);

// ---- List ----
const ListQuerySchema = z.object({
  status: z.string().optional(),
  projectId: z.string().optional(),
  categoryId: z.string().optional(),
  priorityId: z.string().optional(),
  engineerId: z.string().optional(),
  view: z.enum(['all_open', 'my_jobs', 'due_today', 'overdue', 'waiting_material', 'waiting_approval', 'in_progress', 'verification', 'closed', 'reopened']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

jobsRouter.get(
  '/',
  requirePermission('job.view'),
  asyncHandler(async (req, res) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query', parsed.error.flatten());
    const q = parsed.data;
    const ctx = req.access!;

    const where: Record<string, unknown> = { ...jobCardScopeWhere(ctx) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.priorityId) where.priorityId = q.priorityId;
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { jobNumber: { contains: q.q } },
        { locationText: { contains: q.q } },
      ];
    }
    if (q.engineerId) {
      where.assignments = { some: { userId: q.engineerId, active: true } };
    }

    const now = new Date();
    switch (q.view) {
      case 'all_open':
        where.status = { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] };
        break;
      case 'my_jobs':
        where.assignments = { some: { userId: ctx.userId, active: true } };
        break;
      case 'due_today': {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(now); end.setHours(23, 59, 59, 999);
        where.nextActionDueAt = { gte: start, lte: end };
        break;
      }
      case 'overdue':
        where.nextActionDueAt = { lt: now };
        where.status = { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] };
        break;
      case 'waiting_material':
        where.status = 'WAITING_MATERIAL';
        break;
      case 'waiting_approval':
        where.status = 'WAITING_APPROVAL';
        break;
      case 'in_progress':
        where.status = 'IN_PROGRESS';
        break;
      case 'verification':
        where.status = { in: ['WORK_COMPLETED', 'VERIFICATION_PENDING'] };
        break;
      case 'closed':
        where.status = { in: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION'] };
        break;
      case 'reopened':
        where.status = 'REOPENED';
        break;
      default:
        break;
    }

    const [total, jobs] = await Promise.all([
      prisma.jobCard.count({ where }),
      prisma.jobCard.findMany({
        where,
        include: {
          project: true,
          category: true,
          priority: true,
          assignments: { where: { active: true }, include: { user: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: jobs.map((j) => ({
        id: j.id,
        jobNumber: j.jobNumber,
        project: j.project.name,
        locationText: j.locationText,
        category: j.category.name,
        priority: j.priority.name,
        status: j.status,
        currentOwnerRole: j.currentOwnerRole,
        nextAction: j.nextAction,
        nextActionDueAt: j.nextActionDueAt,
        engineer: j.assignments.find((a) => a.role === 'ENGINEER')?.user.name ?? null,
        updatedAt: j.updatedAt,
        isOpen: isOpenStatus(j.status as JobStatus),
      })),
    });
  }),
);

// ---- Detail ----
jobsRouter.get(
  '/:id',
  requirePermission('job.view'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const delayResponsibility = await primaryDelayResponsibility(job.id);
    res.json({ ...job, delayResponsibility });
  }),
);

// ---- PDF ----
jobsRouter.get(
  '/:id/pdf',
  requirePermission('job.view'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    streamJobCardPdf(res, job);
  }),
);

// ---- Assign ----
jobsRouter.post(
  '/:id/assign',
  requirePermission('job.assign', 'job.reassign'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = AssignJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid assignment payload', parsed.error.flatten());

    await prisma.$transaction(async (tx) => {
      await tx.jobAssignment.updateMany({
        where: { jobCardId: job.id, role: parsed.data.role, active: true },
        data: { active: false, unassignedAt: new Date() },
      });
      await tx.jobAssignment.create({
        data: { jobCardId: job.id, userId: parsed.data.userId, role: parsed.data.role, assignedById: req.access!.userId },
      });
      if (parsed.data.role === 'ENGINEER') {
        await tx.jobCard.update({ where: { id: job.id }, data: { currentOwnerUserId: parsed.data.userId } });
      }
      if (job.status === 'RAISED' || job.status === 'UNDER_TRIAGE') {
        const toStatus = assertTransition('assign', job.status as JobStatus);
        await tx.jobCard.update({ where: { id: job.id }, data: { status: toStatus as string } });
        await advanceStage(tx, job.id, 'assign', parsed.data.role);
      }
      await writeAudit(tx, {
        entityType: 'JobCard',
        entityId: job.id,
        action: 'ASSIGNED',
        actorId: req.access!.userId,
        newValue: { userId: parsed.data.userId, role: parsed.data.role },
      });
    });

    res.json(await loadScopedJob(req.access!, req.params.id));
  }),
);

// ---- Site visit ----
jobsRouter.post(
  '/:id/site-visit/start',
  requirePermission('job.edit'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    await prisma.siteVisit.create({ data: { jobCardId: job.id, engineerId: req.access!.userId } });
    await runSimpleCommand({ jobCardId: job.id, command: 'siteVisitStart', actorId: req.access!.userId });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

jobsRouter.post(
  '/:id/site-visit/complete',
  requirePermission('job.edit'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = SiteVisitCompleteSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid site visit payload', parsed.error.flatten());

    const openVisit = await prisma.siteVisit.findFirst({ where: { jobCardId: job.id, completedAt: null }, orderBy: { startedAt: 'desc' } });
    if (!openVisit) throw badRequest('No open site visit to complete');
    await prisma.siteVisit.update({
      where: { id: openVisit.id },
      data: { completedAt: new Date(), ...parsed.data, proposedCompletionDate: parsed.data.proposedCompletionDate ? new Date(parsed.data.proposedCompletionDate) : null },
    });
    await runSimpleCommand({ jobCardId: job.id, command: 'siteVisitComplete', actorId: req.access!.userId });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Materials ----
jobsRouter.post(
  '/:id/materials',
  requirePermission('material.create'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = MaterialRequirementSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid material payload', parsed.error.flatten());
    await prisma.materialRequirement.create({
      data: {
        jobCardId: job.id,
        ...parsed.data,
        requiredByDate: parsed.data.requiredByDate ? new Date(parsed.data.requiredByDate) : null,
        createdById: req.access!.userId,
      },
    });
    if (isOpenStatus(job.status as JobStatus) && job.status !== 'WAITING_MATERIAL') {
      await runSimpleCommand({ jobCardId: job.id, command: 'requestMaterial', actorId: req.access!.userId }).catch(() => undefined);
    }
    res.status(201).json(await loadScopedJob(req.access!, job.id));
  }),
);

jobsRouter.patch(
  '/:id/materials/:materialId',
  requirePermission('material.update'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = z.object({ status: z.string(), availabilityNote: z.string().nullable().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const resolved = ['AVAILABLE', 'ISSUED', 'RECEIVED', 'NOT_AVAILABLE', 'CANCELLED'].includes(parsed.data.status);
    await prisma.materialRequirement.update({
      where: { id: req.params.materialId },
      data: { ...parsed.data, resolvedAt: resolved ? new Date() : null },
    });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Approvals ----
jobsRouter.post(
  '/:id/approvals',
  requirePermission('approval.request'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = ApprovalRequestSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid approval payload', parsed.error.flatten());
    await prisma.approval.create({
      data: { jobCardId: job.id, ...parsed.data, requestedById: req.access!.userId },
    });
    if (job.status !== 'WAITING_APPROVAL') {
      await runSimpleCommand({ jobCardId: job.id, command: 'requestApproval', actorId: req.access!.userId }).catch(() => undefined);
    }
    res.status(201).json(await loadScopedJob(req.access!, job.id));
  }),
);

jobsRouter.post(
  '/:id/approvals/:approvalId/decide',
  requirePermission('approval.decide'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = ApprovalDecisionBodySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid decision payload', parsed.error.flatten());
    await prisma.approval.update({
      where: { id: req.params.approvalId },
      data: { decision: parsed.data.decision, comments: parsed.data.comments ?? null, decisionAt: new Date() },
    });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Ready to start / start / partial ----
for (const [path, command] of [
  ['ready-to-start', 'readyToStart'],
  ['start', 'start'],
  ['partial', 'partial'],
] as const) {
  jobsRouter.post(
    `/:id/${path}`,
    requirePermission('job.edit'),
    asyncHandler(async (req, res) => {
      const job = await loadScopedJob(req.access!, req.params.id);
      await runSimpleCommand({ jobCardId: job.id, command, actorId: req.access!.userId });
      res.json(await loadScopedJob(req.access!, job.id));
    }),
  );
}

// ---- Complete ----
jobsRouter.post(
  '/:id/complete',
  requirePermission('job.complete'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = CompleteJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid completion payload', parsed.error.flatten());

    const currentStage = job.stages.find((s) => s.stageKey === job.currentStageKey);
    const requiresEvidence = true; // §17 "Do not allow completion without required evidence"
    if (requiresEvidence) {
      const hasAfterPhoto = job.attachments.some((a) => a.phase === 'AFTER');
      if (!hasAfterPhoto) throw badRequest('Completion requires at least one AFTER photo/evidence attachment');
    }
    void currentStage;

    await prisma.comment.create({
      data: { jobCardId: job.id, authorId: req.access!.userId, isSystem: true, body: `Work completed: ${parsed.data.completionNotes}` },
    });
    await runSimpleCommand({ jobCardId: job.id, command: 'complete', actorId: req.access!.userId });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Verify ----
jobsRouter.post(
  '/:id/verify',
  requirePermission('job.verify'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = VerifyJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid verification payload', parsed.error.flatten());
    if (job.status !== 'WORK_COMPLETED') {
      throw conflict(`Cannot verify a job in status ${job.status}; work must be marked completed first`);
    }

    await prisma.verification.create({
      data: { jobCardId: job.id, verifiedById: req.access!.userId, decision: parsed.data.decision, comments: parsed.data.comments ?? null },
    });

    if (parsed.data.decision === 'VERIFIED') {
      await runSimpleCommand({ jobCardId: job.id, command: 'close', actorId: req.access!.userId, reason: 'Verified' });
    } else if (parsed.data.decision === 'REWORK_REQUIRED' || parsed.data.decision === 'REJECTED') {
      await prisma.jobCard.update({ where: { id: job.id }, data: { status: 'IN_PROGRESS' } });
      await prisma.comment.create({
        data: { jobCardId: job.id, authorId: req.access!.userId, isSystem: true, body: `Verification: ${parsed.data.decision}. ${parsed.data.comments ?? ''}` },
      });
    } else {
      await prisma.jobCard.update({ where: { id: job.id }, data: { status: 'PARTIALLY_COMPLETED' } });
    }
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Close (direct, when verification is configured to be skipped) ----
jobsRouter.post(
  '/:id/close',
  requirePermission('job.close'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = CloseJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid closure payload', parsed.error.flatten());
    if (job.status !== 'WORK_COMPLETED' && job.status !== 'VERIFICATION_PENDING') {
      const cmd = 'closeShortCircuit' as const;
      await runSimpleCommand({ jobCardId: job.id, command: cmd, actorId: req.access!.userId, reason: parsed.data.closureReasonCode });
      await prisma.jobCard.update({
        where: { id: job.id },
        data: {
          status:
            parsed.data.closureReasonCode === 'DUPLICATE'
              ? 'CLOSED_DUPLICATE'
              : parsed.data.closureReasonCode === 'NO_ACTION_REQUIRED'
                ? 'CLOSED_NO_ACTION'
                : 'CLOSED_NOT_FEASIBLE',
        },
      });
    } else {
      await runSimpleCommand({ jobCardId: job.id, command: 'close', actorId: req.access!.userId, reason: parsed.data.closureReasonCode });
    }
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Reopen ----
jobsRouter.post(
  '/:id/reopen',
  requirePermission('job.reopen'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = ReopenJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid reopen payload', parsed.error.flatten());

    await prisma.$transaction(async (tx) => {
      await tx.reopenEvent.create({
        data: { jobCardId: job.id, reason: parsed.data.reason, reopenedById: req.access!.userId, previousClosedAt: job.closedAt, severity: parsed.data.severity },
      });

      // Reopening must land the job back in an actionable state with a real next action
      // (WORKFLOW.md "Reopen"), never in a REOPENED limbo with no valid transition out.
      // Re-activate the EXECUTION stage (and reset VERIFICATION so it must be redone).
      const executionStage = await tx.jobStage.findFirst({ where: { jobCardId: job.id, stageKey: 'EXECUTION' } });
      const verificationStage = await tx.jobStage.findFirst({ where: { jobCardId: job.id, stageKey: 'VERIFICATION' } });
      if (executionStage) {
        const plannedDueAt = await computeStageDueDate({
          projectId: job.projectId,
          categoryId: job.categoryId,
          priorityId: job.priorityId,
          stageKey: 'EXECUTION',
          startAt: new Date(),
        });
        await tx.jobStage.update({
          where: { id: executionStage.id },
          data: { status: 'ACTIVE', actualStartAt: new Date(), actualCompletedAt: null, plannedDueAt },
        });
      }
      if (verificationStage) {
        await tx.jobStage.update({ where: { id: verificationStage.id }, data: { status: 'PENDING', actualCompletedAt: null } });
      }

      await tx.jobCard.update({
        where: { id: job.id },
        data: {
          status: 'IN_PROGRESS',
          reopenCount: { increment: 1 },
          closedAt: null,
          currentStageKey: executionStage ? 'EXECUTION' : job.currentStageKey,
          nextAction: executionStage ? executionStage.name : 'Re-investigate and resolve',
          currentOwnerRole: 'SERVICE_ENGINEER',
        },
      });
      await writeAudit(tx, { entityType: 'JobCard', entityId: job.id, action: 'REOPENED', actorId: req.access!.userId, reason: parsed.data.reason });
    });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Cancel ----
jobsRouter.post(
  '/:id/cancel',
  requirePermission('job.cancel'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = z.object({ reason: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    await runSimpleCommand({ jobCardId: job.id, command: 'cancel', actorId: req.access!.userId, reason: parsed.data.reason });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Hold / Resume ----
jobsRouter.post(
  '/:id/hold',
  requirePermission('job.hold'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = HoldJobSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid hold payload', parsed.error.flatten());

    await prisma.$transaction(async (tx) => {
      await tx.hold.create({
        data: {
          jobCardId: job.id,
          reasonCode: parsed.data.reasonCode,
          heldByUserId: req.access!.userId,
          dependencyOwnerRole: parsed.data.dependencyOwnerRole,
          reviewDueAt: new Date(parsed.data.reviewDueAt),
          comment: parsed.data.comment,
          slaPauses: parsed.data.slaPauses,
          statusBeforeHold: job.status,
        },
      });
      if (parsed.data.slaPauses) {
        await tx.sLAPause.create({ data: { jobCardId: job.id, reason: parsed.data.reasonCode, accountableParty: parsed.data.dependencyOwnerRole } });
      }
      await tx.jobCard.update({ where: { id: job.id }, data: { status: 'ON_HOLD', statusBeforeHold: job.status } });
      await writeAudit(tx, { entityType: 'JobCard', entityId: job.id, action: 'HOLD', actorId: req.access!.userId, newValue: parsed.data });
    });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

jobsRouter.post(
  '/:id/resume',
  requirePermission('job.resume'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    if (job.status !== 'ON_HOLD') throw badRequest('Job is not on hold');
    await prisma.$transaction(async (tx) => {
      const openHold = await tx.hold.findFirst({ where: { jobCardId: job.id, endAt: null }, orderBy: { startAt: 'desc' } });
      if (openHold) await tx.hold.update({ where: { id: openHold.id }, data: { endAt: new Date() } });
      const openPause = await tx.sLAPause.findFirst({ where: { jobCardId: job.id, endAt: null }, orderBy: { startAt: 'desc' } });
      if (openPause) await tx.sLAPause.update({ where: { id: openPause.id }, data: { endAt: new Date() } });
      await tx.jobCard.update({ where: { id: job.id }, data: { status: job.statusBeforeHold ?? 'RAISED' } });
      await writeAudit(tx, { entityType: 'JobCard', entityId: job.id, action: 'RESUME', actorId: req.access!.userId });
    });
    res.json(await loadScopedJob(req.access!, job.id));
  }),
);

// ---- Comments ----
jobsRouter.post(
  '/:id/comments',
  requirePermission('job.view'),
  asyncHandler(async (req, res) => {
    const job = await loadScopedJob(req.access!, req.params.id);
    const parsed = AddCommentSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid comment payload', parsed.error.flatten());
    await prisma.comment.create({ data: { jobCardId: job.id, authorId: req.access!.userId, body: parsed.data.body } });
    res.status(201).json(await loadScopedJob(req.access!, job.id));
  }),
);
