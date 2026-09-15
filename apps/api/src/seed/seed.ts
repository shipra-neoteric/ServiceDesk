import 'dotenv/config';
import { prisma } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { PERMISSION_KEYS } from '@servicedesk/shared';
import { createJobCard } from '../modules/jobs/service.js';
import type { AccessContext } from '../lib/accessContext.js';

const ROLE_PERMISSIONS: Record<string, string[]> = {
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

const PROJECTS = [
  { code: 'REGAL', name: 'Regal Garden' },
  { code: 'GARDENCITY', name: 'Garden City' },
  { code: 'GCCLUB', name: 'Garden City Club' },
  { code: 'NEOMERIDIAN', name: 'Neo Meridian' },
  { code: 'RESERVE', name: 'Neoteric Reserve' },
  { code: 'SCHOOL', name: 'School' },
  { code: 'OBC', name: 'One Business Center' },
  { code: 'EASTPARK', name: 'East Park Avenue' },
];

const CATEGORIES = [
  { code: 'ELEC', name: 'Electrical', subs: ['Lighting', 'Wiring', 'DB/Panel'] },
  { code: 'PLUMB', name: 'Plumbing', subs: ['Leakage', 'Drainage', 'Fittings'] },
  { code: 'CIVIL', name: 'Civil', subs: ['Structural', 'Waterproofing', 'Painting'] },
  { code: 'HVAC', name: 'HVAC', subs: ['AC Repair', 'Ventilation'] },
  { code: 'CARPENTRY', name: 'Carpentry', subs: ['Doors', 'Furniture'] },
];

const JOB_TYPES = [
  { code: 'SIMPLE_REPAIR', name: 'Simple Repair' },
  { code: 'MATERIAL_REQUIRED', name: 'Material-Dependent Repair' },
  { code: 'NEW_WORK', name: 'New Work / Installation' },
  { code: 'PREVENTIVE', name: 'Preventive Maintenance' },
];

const PRIORITIES = [
  { code: 'LOW', name: 'Low', rank: 1, hours: 96 },
  { code: 'NORMAL', name: 'Normal', rank: 2, hours: 48 },
  { code: 'HIGH', name: 'High', rank: 3, hours: 24 },
  { code: 'CRITICAL', name: 'Critical', rank: 4, hours: 4 },
];

const WORKFLOW_TEMPLATES: Record<string, { name: string; stages: { key: string; name: string; ownerRole: string; slaHours: number; requiredEvidence?: boolean }[] }> = {
  SIMPLE_REPAIR: {
    name: 'Simple Repair',
    stages: [
      { key: 'TRIAGE', name: 'Triage', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'ASSIGN', name: 'Assign Engineer', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'SITE_VISIT', name: 'Site Visit & Repair', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'EXECUTION', name: 'Repair Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Close', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  MATERIAL_REQUIRED: {
    name: 'Material Required',
    stages: [
      { key: 'TRIAGE', name: 'Triage', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'SITE_VISIT', name: 'Site Visit', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'DIAGNOSIS', name: 'Diagnosis', ownerRole: 'SERVICE_ENGINEER', slaHours: 12 },
      { key: 'MATERIAL', name: 'Material Requirement & Availability', ownerRole: 'PROJECT_HEAD', slaHours: 72 },
      { key: 'EXECUTION', name: 'Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Close', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  NEW_WORK: {
    name: 'New Work',
    stages: [
      { key: 'SITE_VISIT', name: 'Site Visit', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'SCOPE', name: 'Scope & Estimate', ownerRole: 'PROJECT_HEAD', slaHours: 48 },
      { key: 'APPROVAL', name: 'Approval', ownerRole: 'SERVICE_HEAD', slaHours: 72 },
      { key: 'MATERIAL', name: 'Material', ownerRole: 'PROJECT_HEAD', slaHours: 72 },
      { key: 'EXECUTION', name: 'Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 48, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Closure', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  EMERGENCY: {
    name: 'Critical Emergency',
    stages: [
      { key: 'ASSIGN', name: 'Immediate Assignment', ownerRole: 'PROCESS_COORDINATOR', slaHours: 1 },
      { key: 'EXECUTION', name: 'Emergency Action / Temporary Resolution', ownerRole: 'SERVICE_ENGINEER', slaHours: 4, requiredEvidence: true },
      { key: 'PERMANENT_RESOLUTION', name: 'Permanent Resolution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'ROOT_CAUSE', name: 'Root Cause Analysis', ownerRole: 'PROJECT_HEAD', slaHours: 48 },
      { key: 'VERIFICATION', name: 'Verification & Closure', ownerRole: 'SERVICE_HEAD', slaHours: 24 },
    ],
  },
};

async function main() {
  console.log('Seeding permissions & roles...');
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

  console.log('Seeding projects...');
  const projectRecords: Record<string, { id: string }> = {};
  for (const p of PROJECTS) {
    projectRecords[p.code] = await prisma.project.upsert({ where: { code: p.code }, create: p, update: {} });
  }

  console.log('Seeding categories...');
  const categoryRecords: Record<string, { id: string }> = {};
  const subcategoryRecords: Record<string, { id: string }> = {};
  for (const c of CATEGORIES) {
    const category = await prisma.workCategory.upsert({ where: { code: c.code }, create: { code: c.code, name: c.name }, update: {} });
    categoryRecords[c.code] = category;
    for (const subName of c.subs) {
      const subCode = `${c.code}_${subName.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`;
      subcategoryRecords[subCode] = await prisma.workSubcategory.upsert({
        where: { categoryId_code: { categoryId: category.id, code: subCode } },
        create: { categoryId: category.id, code: subCode, name: subName },
        update: {},
      });
    }
  }

  console.log('Seeding job types & priorities...');
  const jobTypeRecords: Record<string, { id: string }> = {};
  for (const jt of JOB_TYPES) {
    jobTypeRecords[jt.code] = await prisma.jobType.upsert({ where: { code: jt.code }, create: { code: jt.code, name: jt.name }, update: {} });
  }
  const priorityRecords: Record<string, { id: string }> = {};
  for (const p of PRIORITIES) {
    priorityRecords[p.code] = await prisma.priority.upsert({ where: { code: p.code }, create: { code: p.code, name: p.name, rank: p.rank }, update: {} });
    await prisma.sLADefinition.deleteMany({ where: { scope: 'PRIORITY', priorityId: priorityRecords[p.code].id, stageKey: null } });
    await prisma.sLADefinition.create({ data: { scope: 'PRIORITY', priorityId: priorityRecords[p.code].id, hours: p.hours } });
  }
  await prisma.sLADefinition.deleteMany({ where: { scope: 'GLOBAL', projectId: null, categoryId: null, priorityId: null, stageKey: null } });
  await prisma.sLADefinition.create({ data: { scope: 'GLOBAL', hours: 48 } });

  console.log('Seeding workflow templates...');
  const templateRecords: Record<string, { id: string }> = {};
  for (const [key, def] of Object.entries(WORKFLOW_TEMPLATES)) {
    const template = await prisma.workflowTemplate.upsert({ where: { key }, create: { key, name: def.name }, update: { name: def.name } });
    templateRecords[key] = template;
    await prisma.workflowStageTemplate.deleteMany({ where: { workflowTemplateId: template.id } });
    for (const [i, stage] of def.stages.entries()) {
      await prisma.workflowStageTemplate.create({
        data: {
          workflowTemplateId: template.id,
          key: stage.key,
          name: stage.name,
          sequence: i + 1,
          ownerRole: stage.ownerRole,
          slaHours: stage.slaHours,
          requiredEvidence: stage.requiredEvidence ?? false,
        },
      });
    }
  }

  console.log('Seeding users...');
  const password = await hashPassword('Password123!');
  async function upsertUser(email: string, name: string, roleKeys: string[], projectAccess: { projectCode: string; accessLevel: 'FULL' | 'READ_ONLY' }[]) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash: password, active: true },
      update: { name },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    for (const roleKey of roleKeys) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleRecords[roleKey].id } });
    }
    await prisma.userProjectAccess.deleteMany({ where: { userId: user.id } });
    for (const pa of projectAccess) {
      await prisma.userProjectAccess.create({ data: { userId: user.id, projectId: projectRecords[pa.projectCode].id, accessLevel: pa.accessLevel } });
    }
    return user;
  }

  const admin = await upsertUser('admin@neotericgrp.in', 'Master Admin', ['MASTER_ADMIN'], PROJECTS.map((p) => ({ projectCode: p.code, accessLevel: 'FULL' as const })));
  const serviceHead = await upsertUser('servicehead@neotericgrp.in', 'Anita Rao (Service Head)', ['SERVICE_HEAD'], PROJECTS.map((p) => ({ projectCode: p.code, accessLevel: 'FULL' as const })));
  const pc = await upsertUser('coordinator@neotericgrp.in', 'Ritika Sharma (Process Coordinator)', ['PROCESS_COORDINATOR'], PROJECTS.map((p) => ({ projectCode: p.code, accessLevel: 'FULL' as const })));
  const projectHeadGC = await upsertUser('ph.gardencity@neotericgrp.in', 'Vikram Nair (Project Head)', ['PROJECT_HEAD'], [{ projectCode: 'GARDENCITY', accessLevel: 'FULL' }, { projectCode: 'GCCLUB', accessLevel: 'FULL' }]);
  const engineerArun = await upsertUser('arun.engineer@neotericgrp.in', 'Arun Kumar (Engineer)', ['SERVICE_ENGINEER'], [{ projectCode: 'GARDENCITY', accessLevel: 'FULL' }, { projectCode: 'REGAL', accessLevel: 'FULL' }]);
  const engineerMeera = await upsertUser('meera.engineer@neotericgrp.in', 'Meera Iyer (Engineer)', ['SERVICE_ENGINEER'], [{ projectCode: 'RESERVE', accessLevel: 'FULL' }]);
  const requester = await upsertUser('requester@neotericgrp.in', 'Gaurav Mehta (Requester)', ['REQUESTER'], [{ projectCode: 'GARDENCITY', accessLevel: 'READ_ONLY' }]);

  console.log('Seeding holidays...');
  await prisma.holiday.deleteMany({});
  await prisma.holiday.create({ data: { date: new Date(`${new Date().getFullYear()}-10-02`), name: 'Gandhi Jayanti' } });
  await prisma.holiday.create({ data: { date: new Date(`${new Date().getFullYear()}-12-25`), name: 'Christmas' } });

  console.log('Seeding demo Job Cards...');
  const ctxFor = (userId: string): AccessContext => ({
    userId,
    email: '',
    name: '',
    active: true,
    roleKeys: [],
    permissions: new Set(PERMISSION_KEYS as unknown as string[]),
    projectAccess: PROJECTS.map((p) => ({ projectId: projectRecords[p.code].id, accessLevel: 'FULL' as const })),
    canViewAllProjects: true,
  });

  // Demo jobs below splice JobCard.status directly instead of driving the real workflow
  // commands (to land them in interesting mid-workflow states in one step), so they must also
  // sync JobStage rows by hand — otherwise the stage tracker shows a stage stuck ACTIVE forever
  // (the same bug advanceStage() fixes for real command-driven jobs; see WORKFLOW.md).
  async function syncStageToStatus(jobCardId: string, targetStageKey: string) {
    const stages = await prisma.jobStage.findMany({ where: { jobCardId } });
    const target = stages.find((s) => s.stageKey === targetStageKey);
    if (!target) return;
    for (const s of stages) {
      if (s.sequence < target.sequence && s.status !== 'DONE') {
        await prisma.jobStage.update({ where: { id: s.id }, data: { status: 'DONE', actualCompletedAt: s.actualStartAt ?? new Date() } });
      }
    }
    await prisma.jobStage.update({
      where: { id: target.id },
      data: { status: 'ACTIVE', actualStartAt: target.actualStartAt ?? new Date(), actualCompletedAt: null },
    });
  }

  const existingDemo = await prisma.jobCard.findFirst({ where: { source: 'SERVICEDESK' } });
  if (!existingDemo) {
    const simple = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.GARDENCITY.id,
      locationId: null,
      locationText: 'Block C, Corridor 2nd Floor',
      categoryId: categoryRecords.ELEC.id,
      subcategoryId: subcategoryRecords.ELEC_LIGHTING.id,
      jobTypeId: jobTypeRecords.SIMPLE_REPAIR.id,
      priorityId: priorityRecords.NORMAL.id,
      narration: 'Two tube lights not working in common corridor.',
      requesterName: 'Gaurav Mehta',
      requesterContact: '+91-9800000000',
      desiredCompletionDate: null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.jobAssignment.create({ data: { jobCardId: simple.id, userId: engineerArun.id, role: 'ENGINEER', assignedById: pc.id } });
    await prisma.jobCard.update({ where: { id: simple.id }, data: { status: 'IN_PROGRESS', currentOwnerUserId: engineerArun.id, currentOwnerRole: 'SERVICE_ENGINEER' } });
    await syncStageToStatus(simple.id, 'EXECUTION');

    const materialBlocked = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.REGAL.id,
      locationId: null,
      locationText: 'Tower B, Flat 502 bathroom',
      categoryId: categoryRecords.PLUMB.id,
      subcategoryId: subcategoryRecords.PLUMB_LEAKAGE.id,
      jobTypeId: jobTypeRecords.MATERIAL_REQUIRED.id,
      priorityId: priorityRecords.HIGH.id,
      narration: 'Persistent leakage from bathroom ceiling below flat 602.',
      requesterName: 'Resident - Flat 502',
      requesterContact: null,
      desiredCompletionDate: null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: '502',
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.jobAssignment.create({ data: { jobCardId: materialBlocked.id, userId: engineerArun.id, role: 'ENGINEER', assignedById: pc.id } });
    await prisma.materialRequirement.create({
      data: { jobCardId: materialBlocked.id, item: 'CPVC pipe fittings', quantity: 6, unit: 'pcs', status: 'REQUIREMENT_RAISED', createdById: engineerArun.id, createdAt: new Date(Date.now() - 60 * 3_600_000) },
    });
    await prisma.jobCard.update({ where: { id: materialBlocked.id }, data: { status: 'WAITING_MATERIAL', currentOwnerUserId: engineerArun.id, currentOwnerRole: 'PROJECT_HEAD' } });
    await syncStageToStatus(materialBlocked.id, 'MATERIAL');

    const approvalBlocked = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.OBC.id,
      locationId: null,
      locationText: 'Ground floor lobby',
      categoryId: categoryRecords.CIVIL.id,
      subcategoryId: subcategoryRecords.CIVIL_STRUCTURAL.id,
      jobTypeId: jobTypeRecords.NEW_WORK.id,
      priorityId: priorityRecords.NORMAL.id,
      narration: 'New signage and lobby flooring upgrade requested by facility management.',
      requesterName: 'Facility Manager',
      requesterContact: null,
      desiredCompletionDate: null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: true,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.approval.create({
      data: { jobCardId: approvalBlocked.id, type: 'CAPEX_ESTIMATE', requestedById: projectHeadGC.id, approverUserId: serviceHead.id, amount: 185000, requestedAt: new Date(Date.now() - 30 * 3_600_000) },
    });
    await prisma.jobCard.update({ where: { id: approvalBlocked.id }, data: { status: 'WAITING_APPROVAL', currentOwnerRole: 'SERVICE_HEAD' } });
    await syncStageToStatus(approvalBlocked.id, 'APPROVAL');

    const overdue = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.SCHOOL.id,
      locationId: null,
      locationText: 'Main building, Room 14',
      categoryId: categoryRecords.HVAC.id,
      subcategoryId: null,
      jobTypeId: jobTypeRecords.SIMPLE_REPAIR.id,
      priorityId: priorityRecords.HIGH.id,
      narration: 'Classroom AC not cooling.',
      requesterName: 'School Admin Office',
      requesterContact: null,
      desiredCompletionDate: null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.jobCard.update({
      where: { id: overdue.id },
      data: { nextActionDueAt: new Date(Date.now() - 20 * 3_600_000), status: 'ASSIGNED', currentOwnerUserId: engineerMeera.id, currentOwnerRole: 'SERVICE_ENGINEER' },
    });
    await prisma.jobAssignment.create({ data: { jobCardId: overdue.id, userId: engineerMeera.id, role: 'ENGINEER', assignedById: pc.id } });
    await syncStageToStatus(overdue.id, 'ASSIGN');

    const emergency = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.RESERVE.id,
      locationId: null,
      locationText: 'Basement electrical room',
      categoryId: categoryRecords.ELEC.id,
      subcategoryId: subcategoryRecords.ELEC_DBPANEL.id,
      jobTypeId: jobTypeRecords.SIMPLE_REPAIR.id,
      priorityId: priorityRecords.CRITICAL.id,
      narration: 'Main DB panel sparking — power tripped across tower.',
      requesterName: 'Security Desk',
      requesterContact: null,
      desiredCompletionDate: null,
      isEmergency: true,
      safetyIssue: true,
      vendorRelated: false,
      assetTag: 'DB-RESERVE-01',
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.jobAssignment.create({ data: { jobCardId: emergency.id, userId: engineerMeera.id, role: 'ENGINEER', assignedById: pc.id } });

    // Reopened example: create, close, then reopen so history is realistic.
    const reopenSample = await createJobCard(ctxFor(pc.id), {
      projectId: projectRecords.EASTPARK.id,
      locationId: null,
      locationText: 'Clubhouse washroom',
      categoryId: categoryRecords.PLUMB.id,
      subcategoryId: subcategoryRecords.PLUMB_FITTINGS.id,
      jobTypeId: jobTypeRecords.SIMPLE_REPAIR.id,
      priorityId: priorityRecords.LOW.id,
      narration: 'Tap handle loose in clubhouse washroom.',
      requesterName: 'Clubhouse Staff',
      requesterContact: null,
      desiredCompletionDate: null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
    await prisma.jobAssignment.create({ data: { jobCardId: reopenSample.id, userId: engineerArun.id, role: 'ENGINEER', assignedById: pc.id } });
    await prisma.jobCard.update({ where: { id: reopenSample.id }, data: { status: 'CLOSED', closedAt: new Date(Date.now() - 5 * 86_400_000) } });
    await prisma.reopenEvent.create({
      data: { jobCardId: reopenSample.id, reason: 'Tap started leaking again after 3 days.', reopenedById: requester.id, previousClosedAt: new Date(Date.now() - 5 * 86_400_000) },
    });
    // Mirror the /jobs/:id/reopen endpoint's behavior (WORKFLOW.md "Reopen"): land back in an
    // actionable state with the EXECUTION stage reactivated, not a REOPENED dead end.
    await prisma.jobStage.updateMany({ where: { jobCardId: reopenSample.id, stageKey: 'VERIFICATION' }, data: { status: 'PENDING', actualCompletedAt: null } });
    await syncStageToStatus(reopenSample.id, 'EXECUTION');
    const executionStage = await prisma.jobStage.findFirst({ where: { jobCardId: reopenSample.id, stageKey: 'EXECUTION' } });
    await prisma.jobCard.update({
      where: { id: reopenSample.id },
      data: {
        status: 'IN_PROGRESS',
        reopenCount: 1,
        closedAt: null,
        currentStageKey: 'EXECUTION',
        nextAction: executionStage?.name ?? 'Re-investigate and resolve',
        currentOwnerUserId: engineerArun.id,
        currentOwnerRole: 'SERVICE_ENGINEER',
      },
    });
  }

  console.log('Seed complete.');
  console.log('Demo logins (password: Password123!):');
  console.log(`  ${admin.email} (Master Admin)`);
  console.log(`  ${serviceHead.email} (Service Head)`);
  console.log(`  ${pc.email} (Process Coordinator)`);
  console.log(`  ${projectHeadGC.email} (Project Head)`);
  console.log(`  ${engineerArun.email} / ${engineerMeera.email} (Service Engineers)`);
  console.log(`  ${requester.email} (Requester)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
