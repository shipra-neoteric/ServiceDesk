import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, notFound, conflict } from '../../lib/httpError.js';
import { hashPassword } from '../../lib/auth.js';
import { writeAudit } from '../../lib/audit.js';

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
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) throw conflict('A user with this email already exists.');
    const { password, roleIds, projectAccess, ...rest } = parsed.data;
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...rest,
          email: rest.email.toLowerCase(),
          passwordHash,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
          projectAccess: { create: projectAccess.map((pa) => ({ projectId: pa.projectId, accessLevel: pa.accessLevel })) },
        },
        include: userInclude,
      });
      await writeAudit(tx, {
        entityType: 'User',
        entityId: created.id,
        action: 'USER_CREATED',
        actorId: req.access!.userId,
        newValue: { email: created.email, name: created.name, roles: created.roles.map((r) => r.role.key) },
      });
      return created;
    });
    res.status(201).json(serializeUser(user));
  }),
);

const UpdateUserSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
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
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, include: userInclude });
    if (!existing) throw notFound('User not found');
    if (existing.id === req.access!.userId && parsed.data.active === false) {
      throw badRequest('You cannot deactivate your own account.');
    }

    const { roleIds, projectAccess, ...rest } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.params.id }, data: rest });
      // createMany with an empty `data` array throws on MongoDB ("No documents provided to
      // insert_many") instead of the harmless no-op it is on SQL databases — guard every call
      // with a length check rather than relying on deleteMany-then-createMany always having
      // something to insert (unchecking every role/project in the edit form is a valid action).
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: req.params.id } });
        if (roleIds.length > 0) {
          await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: req.params.id, roleId })) });
        }
      }
      if (projectAccess) {
        await tx.userProjectAccess.deleteMany({ where: { userId: req.params.id } });
        if (projectAccess.length > 0) {
          await tx.userProjectAccess.createMany({
            data: projectAccess.map((pa) => ({ userId: req.params.id, projectId: pa.projectId, accessLevel: pa.accessLevel })),
          });
        }
      }
      await writeAudit(tx, {
        entityType: 'User',
        entityId: req.params.id,
        action: 'USER_UPDATED',
        actorId: req.access!.userId,
        oldValue: serializeUser(existing),
        newValue: parsed.data,
      });
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, include: userInclude });
    res.json(serializeUser(user));
  }),
);

usersRouter.post(
  '/:id/deactivate',
  requirePermission('user.deactivate'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.access!.userId) throw badRequest('You cannot deactivate your own account.');
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: req.params.id }, data: { active: false }, include: userInclude });
      await writeAudit(tx, { entityType: 'User', entityId: updated.id, action: 'USER_DEACTIVATED', actorId: req.access!.userId });
      return updated;
    });
    res.json(serializeUser(user));
  }),
);

const ResetPasswordSchema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') });

// Admin-driven password reset (distinct from a self-service "forgot password" flow, which
// doesn't exist yet — see ARCHITECTURE.md §4 on auth being a documented Nexora-SSO seam).
// Deliberately its own permission (not folded into user.edit) since resetting someone else's
// credential is a more sensitive action than editing their name/department.
usersRouter.patch(
  '/:id/password',
  requirePermission('user.reset_password'),
  asyncHandler(async (req, res) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid payload', parsed.error.flatten());
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('User not found');
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.params.id }, data: { passwordHash } });
      await writeAudit(tx, { entityType: 'User', entityId: req.params.id, action: 'USER_PASSWORD_RESET', actorId: req.access!.userId });
    });
    res.status(204).end();
  }),
);

// Hard delete — only allowed when the user has left no trace elsewhere in the system (created no
// Job Cards, comments, attachments, audit events, assignments, site visits, materials, approvals,
// verifications, or reopen events). MongoDB has no foreign-key constraints to stop this from
// silently orphaning references the way a relational DB would refuse the delete outright, so this
// check is what actually protects data integrity here. Anyone with real history should be
// deactivated instead (POST /:id/deactivate) — that's a reversible, audit-preserving action.
usersRouter.delete(
  '/:id',
  requirePermission('user.delete'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.access!.userId) throw badRequest('You cannot delete your own account.');
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('User not found');

    const userId = req.params.id;
    const [
      jobsCreated,
      comments,
      attachments,
      auditEvents,
      assignments,
      siteVisits,
      materials,
      approvals,
      verifications,
      reopenEvents,
    ] = await Promise.all([
      prisma.jobCard.count({ where: { createdById: userId } }),
      prisma.comment.count({ where: { authorId: userId } }),
      prisma.attachment.count({ where: { uploadedById: userId } }),
      prisma.auditEvent.count({ where: { actorId: userId } }),
      prisma.jobAssignment.count({ where: { userId } }),
      prisma.siteVisit.count({ where: { engineerId: userId } }),
      prisma.materialRequirement.count({ where: { createdById: userId } }),
      prisma.approval.count({ where: { OR: [{ requestedById: userId }, { approverUserId: userId }] } }),
      prisma.verification.count({ where: { verifiedById: userId } }),
      prisma.reopenEvent.count({ where: { reopenedById: userId } }),
    ]);
    const totalHistory = jobsCreated + comments + attachments + auditEvents + assignments + siteVisits + materials + approvals + verifications + reopenEvents;
    if (totalHistory > 0) {
      throw conflict(
        'This user has activity history (Job Cards, comments, attachments, approvals, or other records) and cannot be permanently deleted. Deactivate the account instead to preserve that history.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, { entityType: 'User', entityId: userId, action: 'USER_DELETED', actorId: req.access!.userId, oldValue: { email: existing.email, name: existing.name } });
      await tx.user.delete({ where: { id: userId } });
    });
    res.status(204).end();
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
