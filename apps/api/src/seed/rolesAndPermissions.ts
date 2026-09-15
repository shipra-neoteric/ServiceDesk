import { prisma } from '../lib/db.js';
import { PERMISSION_KEYS } from '@servicedesk/shared';

/** The default role -> permission matrix documented in PERMISSIONS.md. Shared by the demo
 * seed script and the production bootstrap script so both grant identical baseline access. */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SERVICE_ENGINEER: ['job.create', 'job.view', 'job.edit', 'job.hold', 'job.resume', 'job.complete', 'material.create', 'material.update', 'approval.request'],
  PROJECT_HEAD: [
    'job.create', 'job.view', 'job.edit', 'job.assign', 'job.reassign', 'job.change_priority', 'job.hold', 'job.resume',
    'job.verify', 'job.close', 'job.reopen', 'job.cancel', 'material.create', 'material.update', 'approval.request',
    'approval.decide', 'report.view', 'report.export', 'audit.view',
  ],
  PROCESS_COORDINATOR: [
    'job.create', 'job.view', 'job.view_all_projects', 'job.edit', 'job.assign', 'job.reassign', 'job.change_priority',
    'job.hold', 'job.resume', 'job.verify', 'job.close', 'job.reopen', 'job.cancel', 'material.create', 'material.update',
    'approval.request', 'report.view', 'report.export', 'audit.view',
  ],
  SERVICE_HEAD: [
    'job.create', 'job.view', 'job.view_all_projects', 'job.edit', 'job.assign', 'job.reassign', 'job.change_priority',
    'job.hold', 'job.resume', 'job.verify', 'job.close', 'job.reopen', 'job.cancel', 'approval.decide', 'report.view',
    'report.export', 'user.view', 'audit.view',
  ],
  MASTER_ADMIN: PERMISSION_KEYS as unknown as string[],
  REQUESTER: ['job.create', 'job.view', 'job.verify', 'job.reopen'],
};

/** Idempotent: upserts every Permission row and every Role's grants. Safe to run on every
 * deploy (production bootstrap) or every local reseed (demo seed) without duplicating rows. */
export async function seedRolesAndPermissions() {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  const roleRecords: Record<string, { id: string }> = {};
  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({ where: { key: roleKey }, create: { key: roleKey, name: roleKey.replace(/_/g, ' ') }, update: {} });
    roleRecords[roleKey] = role;
    const permissionRows = await prisma.permission.findMany({ where: { key: { in: perms } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
  return roleRecords;
}
