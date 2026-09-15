import { Router } from 'express';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { jobCardScopeWhere } from '../../lib/projectScope.js';
import { toCsv } from '../../lib/csv.js';
import { primaryDelayResponsibility } from '../../lib/slaEngine.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requirePermission('report.view'));

function respond(req: import('express').Request, res: import('express').Response, rows: Record<string, unknown>[]) {
  if (req.query.format === 'csv') {
    res.header('Content-Type', 'text/csv');
    res.send(toCsv(rows));
  } else {
    res.json(rows);
  }
}

// Open Job Aging (§33)
reportsRouter.get(
  '/open-job-aging',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const jobs = await prisma.jobCard.findMany({
      where: { ...scope, status: { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] } },
      include: { project: true, category: true, priority: true },
      orderBy: { createdAt: 'asc' },
    });
    const now = Date.now();
    respond(req, res, jobs.map((j) => ({
      jobNumber: j.jobNumber,
      project: j.project.name,
      category: j.category.name,
      priority: j.priority.name,
      status: j.status,
      ageDays: Math.round(((now - j.createdAt.getTime()) / 86_400_000) * 10) / 10,
    })));
  }),
);

// Overdue Jobs (§33)
reportsRouter.get(
  '/overdue',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const jobs = await prisma.jobCard.findMany({
      where: { ...scope, status: { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] }, nextActionDueAt: { lt: new Date() } },
      include: { project: true, priority: true },
    });
    respond(req, res, jobs.map((j) => ({
      jobNumber: j.jobNumber,
      project: j.project.name,
      priority: j.priority.name,
      status: j.status,
      nextAction: j.nextAction,
      nextActionDueAt: j.nextActionDueAt?.toISOString(),
    })));
  }),
);

// Project Performance (§33)
reportsRouter.get(
  '/project-performance',
  asyncHandler(async (req, res) => {
    const ctx = req.access!;
    const projectWhere = ctx.canViewAllProjects ? {} : { id: { in: ctx.projectAccess.map((p) => p.projectId) } };
    const projects = await prisma.project.findMany({ where: projectWhere });
    const rows = await Promise.all(
      projects.map(async (p) => {
        const closedJobs = await prisma.jobCard.findMany({ where: { projectId: p.id, status: 'CLOSED', closedAt: { not: null } } });
        const avgResolutionHours =
          closedJobs.length > 0
            ? Math.round((closedJobs.reduce((sum, j) => sum + (j.closedAt!.getTime() - j.createdAt.getTime()) / 3_600_000, 0) / closedJobs.length) * 10) / 10
            : 0;
        const reopenCount = await prisma.jobCard.count({ where: { projectId: p.id, reopenCount: { gt: 0 } } });
        return { project: p.name, closedJobs: closedJobs.length, avgResolutionHours, reopenCount };
      }),
    );
    respond(req, res, rows);
  }),
);

// Delay Responsibility (§33, SLA_RULES.md)
reportsRouter.get(
  '/delay-responsibility',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const jobs = await prisma.jobCard.findMany({ where: { ...scope, status: { notIn: ['CLOSED_DUPLICATE', 'CANCELLED'] } }, take: 200 });
    const rows = await Promise.all(
      jobs.map(async (j) => ({ jobNumber: j.jobNumber, status: j.status, delayResponsibility: await primaryDelayResponsibility(j.id) })),
    );
    respond(req, res, rows.filter((r) => r.delayResponsibility !== 'NONE'));
  }),
);

// Reopened Jobs (§33)
reportsRouter.get(
  '/reopened',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const jobs = await prisma.jobCard.findMany({
      where: { ...scope, reopenCount: { gt: 0 } },
      include: { project: true, reopenEvents: { orderBy: { reopenedAt: 'desc' }, take: 1 } },
    });
    respond(req, res, jobs.map((j) => ({
      jobNumber: j.jobNumber,
      project: j.project.name,
      reopenCount: j.reopenCount,
      lastReason: j.reopenEvents[0]?.reason ?? '',
      status: j.status,
    })));
  }),
);
