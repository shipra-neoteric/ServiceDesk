import { Router } from 'express';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { jobCardScopeWhere } from '../../lib/projectScope.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const OPEN = { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] };

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const riskWindow = new Date(now.getTime() + 4 * 3_600_000);

    const [open, dueToday, overdue, atRisk, waitingMaterial, waitingApproval, inProgress, verificationPending, closedThisPeriod, reopened] =
      await Promise.all([
        prisma.jobCard.count({ where: { ...scope, status: OPEN } }),
        prisma.jobCard.count({ where: { ...scope, status: OPEN, nextActionDueAt: { gte: startOfDay, lte: endOfDay } } }),
        prisma.jobCard.count({ where: { ...scope, status: OPEN, nextActionDueAt: { lt: now } } }),
        prisma.jobCard.count({ where: { ...scope, status: OPEN, nextActionDueAt: { gt: now, lte: riskWindow } } }),
        prisma.jobCard.count({ where: { ...scope, status: 'WAITING_MATERIAL' } }),
        prisma.jobCard.count({ where: { ...scope, status: 'WAITING_APPROVAL' } }),
        prisma.jobCard.count({ where: { ...scope, status: 'IN_PROGRESS' } }),
        prisma.jobCard.count({ where: { ...scope, status: { in: ['WORK_COMPLETED', 'VERIFICATION_PENDING'] } } }),
        prisma.jobCard.count({ where: { ...scope, status: 'CLOSED', closedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
        prisma.jobCard.count({ where: { ...scope, status: 'REOPENED' } }),
      ]);

    res.json({ open, dueToday, overdue, atRisk, waitingMaterial, waitingApproval, inProgress, verificationPending, closedThisPeriod, reopened });
  }),
);

dashboardRouter.get(
  '/project-health',
  asyncHandler(async (req, res) => {
    const ctx = req.access!;
    const projectWhere = ctx.canViewAllProjects ? {} : { id: { in: ctx.projectAccess.map((p) => p.projectId) } };
    const projects = await prisma.project.findMany({ where: projectWhere, orderBy: { name: 'asc' } });
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const health = await Promise.all(
      projects.map(async (p) => {
        const base = { projectId: p.id };
        const [open, overdue, dueToday, waitingMaterial, waitingApproval, closed, reopenedCount] = await Promise.all([
          prisma.jobCard.count({ where: { ...base, status: OPEN } }),
          prisma.jobCard.count({ where: { ...base, status: OPEN, nextActionDueAt: { lt: now } } }),
          prisma.jobCard.count({ where: { ...base, status: OPEN, nextActionDueAt: { gte: startOfDay, lte: endOfDay } } }),
          prisma.jobCard.count({ where: { ...base, status: 'WAITING_MATERIAL' } }),
          prisma.jobCard.count({ where: { ...base, status: 'WAITING_APPROVAL' } }),
          prisma.jobCard.count({ where: { ...base, status: 'CLOSED' } }),
          prisma.jobCard.count({ where: { ...base, reopenCount: { gt: 0 } } }),
        ]);
        const reopenRate = closed > 0 ? Math.round((reopenedCount / closed) * 1000) / 10 : 0;
        return { project: p.name, projectId: p.id, open, overdue, dueToday, waitingMaterial, waitingApproval, closed, reopenRate };
      }),
    );
    res.json(health);
  }),
);

dashboardRouter.get(
  '/bottlenecks',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    // Grouped by stageKey alone, not {stageKey, name}: different workflow templates can label
    // the same conceptual stage differently (e.g. EMERGENCY's ASSIGN is "Immediate Assignment"
    // vs SIMPLE_REPAIR's "Assign Engineer"), but stageKey is the cross-template semantic id this
    // view is meant to aggregate on (§28 "Bottleneck View").
    const stages = await prisma.jobStage.findMany({
      where: { status: { in: ['ACTIVE', 'BLOCKED'] }, jobCard: { ...scope } },
      select: { stageKey: true, name: true },
    });
    const byKey = new Map<string, { stageKey: string; name: string; count: number }>();
    for (const s of stages) {
      const existing = byKey.get(s.stageKey);
      if (existing) existing.count += 1;
      else byKey.set(s.stageKey, { stageKey: s.stageKey, name: s.name, count: 1 });
    }
    res.json(Array.from(byKey.values()).sort((a, b) => b.count - a.count));
  }),
);

dashboardRouter.get(
  '/engineer-workload',
  asyncHandler(async (req, res) => {
    const scope = jobCardScopeWhere(req.access!);
    const engineers = await prisma.user.findMany({ where: { active: true, roles: { some: { role: { key: 'SERVICE_ENGINEER' } } } } });
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const workload = await Promise.all(
      engineers.map(async (e) => {
        const assignedFilter = { assignments: { some: { userId: e.id, active: true, role: 'ENGINEER' } }, ...scope };
        const [active, dueToday, overdue, blocked] = await Promise.all([
          prisma.jobCard.count({ where: { ...assignedFilter, status: OPEN } }),
          prisma.jobCard.count({ where: { ...assignedFilter, status: OPEN, nextActionDueAt: { gte: startOfDay, lte: endOfDay } } }),
          prisma.jobCard.count({ where: { ...assignedFilter, status: OPEN, nextActionDueAt: { lt: now } } }),
          prisma.jobCard.count({ where: { ...assignedFilter, status: { in: ['WAITING_MATERIAL', 'WAITING_APPROVAL', 'ON_HOLD'] } } }),
        ]);
        return { engineerId: e.id, engineer: e.name, active, dueToday, overdue, blocked };
      }),
    );
    res.json(workload);
  }),
);
