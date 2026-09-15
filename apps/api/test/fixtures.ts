import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';
import { PERMISSION_KEYS } from '@servicedesk/shared';

export async function ensurePermissions() {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
}

export async function makeRole(key: string, permissionKeys: string[]) {
  const role = await prisma.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  const perms = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  return role;
}

let counter = 0;
export async function makeUser(params: { roleId: string; projectAccess: { projectId: string; accessLevel: 'FULL' | 'READ_ONLY' }[] }) {
  counter += 1;
  const email = `test.user.${Date.now()}.${counter}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Test User ${counter}`,
      passwordHash: await hashPassword('Password123!'),
      roles: { create: [{ roleId: params.roleId }] },
      projectAccess: { create: params.projectAccess },
    },
  });
  return { ...user, password: 'Password123!' };
}

export async function makeProject(code: string) {
  return prisma.project.upsert({ where: { code }, create: { code, name: code }, update: {} });
}

export async function makeBaseMasters() {
  const category = await prisma.workCategory.upsert({ where: { code: 'TESTCAT' }, create: { code: 'TESTCAT', name: 'Test Category' }, update: {} });
  const jobType = await prisma.jobType.upsert({ where: { code: 'SIMPLE_REPAIR' }, create: { code: 'SIMPLE_REPAIR', name: 'Simple Repair' }, update: {} });
  const priority = await prisma.priority.upsert({ where: { code: 'NORMAL' }, create: { code: 'NORMAL', name: 'Normal', rank: 2 }, update: {} });

  let template = await prisma.workflowTemplate.findUnique({ where: { key: 'SIMPLE_REPAIR' } });
  if (!template) {
    template = await prisma.workflowTemplate.create({ data: { key: 'SIMPLE_REPAIR', name: 'Simple Repair' } });
    // TRIAGE deliberately has no dedicated closing command (mirrors the real seed template) —
    // it must still get closed when a later stage's command runs. See advanceStage().
    await prisma.workflowStageTemplate.create({
      data: { workflowTemplateId: template.id, key: 'TRIAGE', name: 'Triage', sequence: 1, ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
    });
    await prisma.workflowStageTemplate.create({
      data: { workflowTemplateId: template.id, key: 'ASSIGN', name: 'Assign', sequence: 2, ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
    });
    await prisma.workflowStageTemplate.create({
      data: { workflowTemplateId: template.id, key: 'EXECUTION', name: 'Execution', sequence: 3, ownerRole: 'SERVICE_ENGINEER', slaHours: 24, requiredEvidence: true },
    });
    await prisma.workflowStageTemplate.create({
      data: { workflowTemplateId: template.id, key: 'VERIFICATION', name: 'Verification', sequence: 4, ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    });
  }

  return { category, jobType, priority, template };
}
