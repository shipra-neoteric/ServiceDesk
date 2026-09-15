import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest } from '../../lib/httpError.js';

export const mastersRouter = Router();
mastersRouter.use(requireAuth);

const NameCodeSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });

// ---- Projects ----
mastersRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const ctx = req.access!;
    const where = ctx.canViewAllProjects ? {} : { id: { in: ctx.projectAccess.map((p) => p.projectId) } };
    const projects = await prisma.project.findMany({ where, orderBy: { name: 'asc' } });
    res.json(projects);
  }),
);

mastersRouter.post(
  '/projects',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = NameCodeSchema.extend({ timezone: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid project payload', parsed.error.flatten());
    const project = await prisma.project.create({ data: parsed.data });
    res.status(201).json(project);
  }),
);

mastersRouter.patch(
  '/projects/:id',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().optional(), active: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const project = await prisma.project.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(project);
  }),
);

// ---- Locations ----
mastersRouter.get(
  '/projects/:projectId/locations',
  asyncHandler(async (req, res) => {
    const locations = await prisma.location.findMany({ where: { projectId: req.params.projectId, active: true } });
    res.json(locations);
  }),
);

mastersRouter.post(
  '/projects/:projectId/locations',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ name: z.string().min(1), type: z.string().min(1), parentId: z.string().nullable().optional(), code: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid location payload', parsed.error.flatten());
    const location = await prisma.location.create({ data: { ...parsed.data, projectId: req.params.projectId } });
    res.status(201).json(location);
  }),
);

// ---- Work categories / subcategories ----
mastersRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.workCategory.findMany({
      where: { active: true },
      include: { subcategories: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  }),
);

mastersRouter.post(
  '/categories',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = NameCodeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid category payload', parsed.error.flatten());
    const category = await prisma.workCategory.create({ data: parsed.data });
    res.status(201).json(category);
  }),
);

mastersRouter.post(
  '/categories/:categoryId/subcategories',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = NameCodeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid subcategory payload', parsed.error.flatten());
    const sub = await prisma.workSubcategory.create({ data: { ...parsed.data, categoryId: req.params.categoryId } });
    res.status(201).json(sub);
  }),
);

mastersRouter.patch(
  '/categories/:id',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().optional(), active: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const category = await prisma.workCategory.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(category);
  }),
);

// ---- Job types ----
mastersRouter.get(
  '/job-types',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.jobType.findMany({ where: { active: true }, orderBy: { name: 'asc' } }));
  }),
);
mastersRouter.post(
  '/job-types',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = NameCodeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid job type payload', parsed.error.flatten());
    res.status(201).json(await prisma.jobType.create({ data: parsed.data }));
  }),
);

// ---- Priorities ----
mastersRouter.get(
  '/priorities',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.priority.findMany({ where: { active: true }, orderBy: { rank: 'asc' } }));
  }),
);
mastersRouter.post(
  '/priorities',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = NameCodeSchema.extend({ rank: z.number().int() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid priority payload', parsed.error.flatten());
    res.status(201).json(await prisma.priority.create({ data: parsed.data }));
  }),
);

// ---- Holidays ----
mastersRouter.get(
  '/holidays',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.holiday.findMany({ orderBy: { date: 'asc' } }));
  }),
);
mastersRouter.post(
  '/holidays',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ date: z.string().datetime(), name: z.string().min(1), projectId: z.string().nullable().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid holiday payload', parsed.error.flatten());
    res.status(201).json(await prisma.holiday.create({ data: { ...parsed.data, date: new Date(parsed.data.date) } }));
  }),
);

// ---- Roles (read only in L1 UI; edit via RolePermission below) ----
mastersRouter.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }));
  }),
);

mastersRouter.get(
  '/permissions',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.permission.findMany());
  }),
);

mastersRouter.post(
  '/roles/:roleId/permissions',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ permissionKeys: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const permissions = await prisma.permission.findMany({ where: { key: { in: parsed.data.permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: req.params.roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: req.params.roleId, permissionId: p.id })),
    });
    res.json({ ok: true });
  }),
);

// ---- Workflow templates (read-only in L1 UI) ----
mastersRouter.get(
  '/workflow-templates',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.workflowTemplate.findMany({ include: { stages: { orderBy: { sequence: 'asc' } } } }));
  }),
);

// ---- SLA definitions ----
mastersRouter.get(
  '/sla-definitions',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.sLADefinition.findMany());
  }),
);
mastersRouter.post(
  '/sla-definitions',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        scope: z.enum(['GLOBAL', 'PROJECT', 'CATEGORY', 'PRIORITY']),
        projectId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        priorityId: z.string().nullable().optional(),
        stageKey: z.string().nullable().optional(),
        hours: z.number().int().positive(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid SLA payload', parsed.error.flatten());
    res.status(201).json(await prisma.sLADefinition.create({ data: parsed.data }));
  }),
);
