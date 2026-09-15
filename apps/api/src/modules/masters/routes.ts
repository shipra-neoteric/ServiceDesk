import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest } from '../../lib/httpError.js';
import { HOLD_REASONS, CLOSURE_REASONS } from '@servicedesk/shared';

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

// ---- Workflow templates ----
mastersRouter.get(
  '/workflow-templates',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.workflowTemplate.findMany({ include: { stages: { orderBy: { sequence: 'asc' } } } }));
  }),
);

// Stage-level edits only (owner role, SLA hours, evidence requirement) — adding/removing
// stages or templates stays an API/seed-level operation for L1 (ARCHITECTURE.md §6 "Master
// Admin CRUD for templates is modeled... but the L1 UI only exposes read + the four seeded
// templates"); this is the one write path the UI needs for §35 "Required Evidence Rules".
mastersRouter.patch(
  '/workflow-stage-templates/:id',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ ownerRole: z.string().optional(), slaHours: z.number().int().positive().optional(), requiredEvidence: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid stage template payload', parsed.error.flatten());
    const stage = await prisma.workflowStageTemplate.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(stage);
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
mastersRouter.delete(
  '/sla-definitions/:id',
  requirePermission('master.delete'),
  asyncHandler(async (req, res) => {
    await prisma.sLADefinition.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ---- Escalation rules (§22/§23 thresholds — see attention/rules.ts for how these are read) ----
mastersRouter.get(
  '/escalation-rules',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.escalationRule.findMany({ orderBy: { triggerType: 'asc' } }));
  }),
);
const EscalationRuleSchema = z.object({
  triggerType: z.string().min(1),
  thresholdHours: z.number().int().positive(),
  escalateToRole: z.string().min(1),
  active: z.boolean().default(true),
});
mastersRouter.post(
  '/escalation-rules',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = EscalationRuleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid escalation rule payload', parsed.error.flatten());
    const rule = await prisma.escalationRule.upsert({
      where: { triggerType: parsed.data.triggerType },
      create: parsed.data,
      update: parsed.data,
    });
    res.status(201).json(rule);
  }),
);
mastersRouter.patch(
  '/escalation-rules/:id',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = EscalationRuleSchema.partial().safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    res.json(await prisma.escalationRule.update({ where: { id: req.params.id }, data: parsed.data }));
  }),
);

// ---- Reason codes: Hold / Closure / Cancellation / Reopen (§35 "Reasons") ----
// HOLD and CLOSURE codes are constrained to the shared Zod enums the hold/close endpoints
// actually validate against (see schema below) — this master curates labels/active state for
// those, and freely for CANCELLATION/REOPEN which have no backend enum. See schema.prisma
// "ReasonCode" doc comment.
mastersRouter.get(
  '/reason-codes',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    res.json(await prisma.reasonCode.findMany({ where: category ? { category } : {}, orderBy: [{ category: 'asc' }, { label: 'asc' }] }));
  }),
);
const ReasonCodeSchema = z.object({
  category: z.enum(['HOLD', 'CLOSURE', 'CANCELLATION', 'REOPEN']),
  code: z.string().min(1),
  label: z.string().min(1),
});
mastersRouter.post(
  '/reason-codes',
  requirePermission('master.create'),
  asyncHandler(async (req, res) => {
    const parsed = ReasonCodeSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid reason code payload', parsed.error.flatten());
    if (parsed.data.category === 'HOLD' && !HOLD_REASONS.includes(parsed.data.code as (typeof HOLD_REASONS)[number])) {
      throw badRequest(`Unknown HOLD reason code "${parsed.data.code}" — the hold endpoint only accepts: ${HOLD_REASONS.join(', ')}`);
    }
    if (parsed.data.category === 'CLOSURE' && !CLOSURE_REASONS.includes(parsed.data.code as (typeof CLOSURE_REASONS)[number])) {
      throw badRequest(`Unknown CLOSURE reason code "${parsed.data.code}" — the close endpoint only accepts: ${CLOSURE_REASONS.join(', ')}`);
    }
    const reason = await prisma.reasonCode.upsert({
      where: { category_code: { category: parsed.data.category, code: parsed.data.code } },
      create: parsed.data,
      update: { label: parsed.data.label },
    });
    res.status(201).json(reason);
  }),
);
mastersRouter.patch(
  '/reason-codes/:id',
  requirePermission('master.edit'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ label: z.string().optional(), active: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    res.json(await prisma.reasonCode.update({ where: { id: req.params.id }, data: parsed.data }));
  }),
);
