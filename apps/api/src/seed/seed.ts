import 'dotenv/config';
import { prisma } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { PERMISSION_KEYS } from '@servicedesk/shared';
import { createJobCard } from '../modules/jobs/service.js';
import { computeStageDueDate } from '../lib/slaEngine.js';
import { seedRolesAndPermissions } from './rolesAndPermissions.js';
import { seedJobTypesAndPriorities, seedWorkflowTemplates, seedReasonCodes } from './systemDefaults.js';
import type { AccessContext } from '../lib/accessContext.js';

const DEFAULT_CANCELLATION_REASONS = [
  ['REQUESTER_WITHDREW', 'Requester Withdrew Request'],
  ['RAISED_IN_ERROR', 'Raised in Error'],
];
const DEFAULT_REOPEN_REASONS = [
  ['ISSUE_RECURRED', 'Issue Recurred'],
  ['INCOMPLETE_FIX', 'Original Fix Was Incomplete'],
];

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

async function main() {
  console.log('Seeding permissions & roles...');
  const roleRecords = await seedRolesAndPermissions();

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
  const { jobTypeRecords, priorityRecords } = await seedJobTypesAndPriorities();

  console.log('Seeding workflow templates...');
  await seedWorkflowTemplates();

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
  // projectId: null explicit, not omitted — slaEngine's business-hours calendar matches global
  // holidays via `OR: [{projectId}, {projectId: null}]`, which on MongoDB only matches
  // present-and-null fields, not fields that were simply never written.
  await prisma.holiday.create({ data: { date: new Date(`${new Date().getFullYear()}-10-02`), name: 'Gandhi Jayanti', projectId: null } });
  await prisma.holiday.create({ data: { date: new Date(`${new Date().getFullYear()}-12-25`), name: 'Christmas', projectId: null } });

  console.log('Seeding reason codes...');
  await seedReasonCodes();
  for (const [code, label] of DEFAULT_CANCELLATION_REASONS) {
    await prisma.reasonCode.upsert({ where: { category_code: { category: 'CANCELLATION', code } }, create: { category: 'CANCELLATION', code, label }, update: {} });
  }
  for (const [code, label] of DEFAULT_REOPEN_REASONS) {
    await prisma.reasonCode.upsert({ where: { category_code: { category: 'REOPEN', code } }, create: { category: 'REOPEN', code, label }, update: {} });
  }

  console.log('Seeding escalation rules...');
  const escalationDefaults: { triggerType: string; thresholdHours: number; escalateToRole: string }[] = [
    { triggerType: 'APPROVAL_OVERDUE', thresholdHours: 24, escalateToRole: 'SERVICE_HEAD' },
    { triggerType: 'MATERIAL_BLOCKED', thresholdHours: 48, escalateToRole: 'PROJECT_HEAD' },
    { triggerType: 'NO_UPDATE', thresholdHours: 24, escalateToRole: 'PROCESS_COORDINATOR' },
  ];
  for (const rule of escalationDefaults) {
    await prisma.escalationRule.upsert({ where: { triggerType: rule.triggerType }, create: rule, update: {} });
  }

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
    // Fresh due date, same as the real activateStageIfPresent()/advanceStage() would compute —
    // keeps JobCard.currentStageKey/nextAction/nextActionDueAt in sync with JobStage, which is
    // what the Overdue KPI, attention queue and stage tracker all actually read.
    const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
    const plannedDueAt = await computeStageDueDate({
      projectId: job.projectId,
      categoryId: job.categoryId,
      priorityId: job.priorityId,
      stageKey: target.stageKey,
      startAt: new Date(),
    });
    await prisma.jobStage.update({
      where: { id: target.id },
      data: { status: 'ACTIVE', actualStartAt: target.actualStartAt ?? new Date(), actualCompletedAt: null, plannedDueAt },
    });
    await prisma.jobCard.update({
      where: { id: jobCardId },
      data: { currentStageKey: target.stageKey, nextAction: target.name, nextActionDueAt: plannedDueAt },
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
