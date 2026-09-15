import { prisma } from './db.js';

export interface ProjectAccess {
  projectId: string;
  accessLevel: 'FULL' | 'READ_ONLY';
}

export interface AccessContext {
  userId: string;
  email: string;
  name: string;
  active: boolean;
  roleKeys: string[];
  permissions: Set<string>;
  projectAccess: ProjectAccess[];
  canViewAllProjects: boolean;
}

export async function loadAccessContext(userId: string): Promise<AccessContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      projectAccess: true,
    },
  });
  if (!user) return null;

  const permissions = new Set<string>();
  const roleKeys: string[] = [];
  for (const userRole of user.roles) {
    roleKeys.push(userRole.role.key);
    for (const rp of userRole.role.permissions) {
      permissions.add(rp.permission.key);
    }
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    active: user.active,
    roleKeys,
    permissions,
    projectAccess: user.projectAccess.map((pa) => ({
      projectId: pa.projectId,
      accessLevel: pa.accessLevel as 'FULL' | 'READ_ONLY',
    })),
    canViewAllProjects: permissions.has('job.view_all_projects'),
  };
}

export const accessibleProjectIds = (ctx: AccessContext) => ctx.projectAccess.map((p) => p.projectId);

export const hasFullAccessToProject = (ctx: AccessContext, projectId: string) => {
  if (ctx.canViewAllProjects) return true;
  const access = ctx.projectAccess.find((p) => p.projectId === projectId);
  return access?.accessLevel === 'FULL';
};

export const canViewProject = (ctx: AccessContext, projectId: string) =>
  ctx.canViewAllProjects || ctx.projectAccess.some((p) => p.projectId === projectId);
