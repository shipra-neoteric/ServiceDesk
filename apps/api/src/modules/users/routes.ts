import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, notFound } from '../../lib/httpError.js';
import { hashPassword } from '../../lib/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const userInclude = {
  roles: { include: { role: true } },
  projectAccess: { include: { project: true } },
} as const;

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function serializeUser(user: UserWithRelations) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    employeeId: user.employeeId,
    department: user.department,
    designation: user.designation,
    active: user.active,
    roles: user.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
    projectAccess: user.projectAccess.map((pa) => ({
      projectId: pa.projectId,
      projectName: pa.project.name,
      accessLevel: pa.accessLevel,
    })),
  };
}

usersRouter.get(
  '/',
  requirePermission('user.view'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ include: userInclude, orderBy: { name: 'asc' } });
    res.json(users.map(serializeUser));
  }),
);

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  phone: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  roleIds: z.array(z.string()).default([]),
  projectAccess: z.array(z.object({ projectId: z.string(), accessLevel: z.enum(['FULL', 'READ_ONLY']) })).default([]),
});

usersRouter.post(
  '/',
  requirePermission('user.create'),
  asyncHandler(async (req, res) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid user payload', parsed.error.flatten());
    const { password, roleIds, projectAccess, ...rest } = parsed.data;
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        ...rest,
        email: rest.email.toLowerCase(),
        passwordHash,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        projectAccess: { create: projectAccess.map((pa) => ({ projectId: pa.projectId, accessLevel: pa.accessLevel })) },
      },
      include: userInclude,
    });
    res.status(201).json(serializeUser(user));
  }),
);

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  active: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
  projectAccess: z.array(z.object({ projectId: z.string(), accessLevel: z.enum(['FULL', 'READ_ONLY']) })).optional(),
});

usersRouter.patch(
  '/:id',
  requirePermission('user.edit'),
  asyncHandler(async (req, res) => {
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('User not found');

    const { roleIds, projectAccess, ...rest } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.params.id }, data: rest });
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: req.params.id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: req.params.id, roleId })) });
      }
      if (projectAccess) {
        await tx.userProjectAccess.deleteMany({ where: { userId: req.params.id } });
        await tx.userProjectAccess.createMany({
          data: projectAccess.map((pa) => ({ userId: req.params.id, projectId: pa.projectId, accessLevel: pa.accessLevel })),
        });
      }
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, include: userInclude });
    res.json(serializeUser(user));
  }),
);

usersRouter.post(
  '/:id/deactivate',
  requirePermission('user.deactivate'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { active: false }, include: userInclude });
    res.json(serializeUser(user));
  }),
);

// Directory of engineers usable for assignment pickers, with active-job workload (§27, §44 assignment overload).
// Gated the same as the mutation it feeds (job.assign/job.reassign) — a Requester or other
// non-assigning role has no legitimate use for the engineer roster/workload.
usersRouter.get(
  '/engineers/workload',
  requirePermission('job.assign', 'job.reassign'),
  asyncHandler(async (req, res) => {
    const ctx = req.access!;
    const engineers = await prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: 'SERVICE_ENGINEER' } } } },
      include: userInclude,
    });
    const projectIds = ctx.canViewAllProjects ? undefined : ctx.projectAccess.map((p) => p.projectId);
    const workload = await Promise.all(
      engineers.map(async (e) => {
        const activeJobs = await prisma.jobAssignment.count({
          where: {
            userId: e.id,
            active: true,
            role: 'ENGINEER',
            jobCard: {
              status: { notIn: ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'] },
              ...(projectIds ? { projectId: { in: projectIds } } : {}),
            },
          },
        });
        return { ...serializeUser(e), activeJobs };
      }),
    );
    res.json(workload);
  }),
);

// Directory of valid approvers (users holding a role with approval.decide) usable for the
// Approvals tab's request form. Gated by approval.request, not user.view — someone raising an
// approval needs to see who can decide it without being handed the full user directory
// (user.view is restricted to Service Head/Master Admin — see PERMISSIONS.md).
usersRouter.get(
  '/approvers',
  requirePermission('approval.request'),
  asyncHandler(async (_req, res) => {
    const approvers = await prisma.user.findMany({
      where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: 'approval.decide' } } } } } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(approvers);
  }),
);
