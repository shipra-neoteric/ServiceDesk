import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { computeAttentionItems } from '../src/modules/attention/rules.js';
import { ensurePermissions, makeRole, makeUser, makeProject, makeBaseMasters } from './fixtures.js';
import { createJobCard } from '../src/modules/jobs/service.js';
import type { AccessContext } from '../src/lib/accessContext.js';

describe('Process Coordinator attention rules (computeAttentionItems)', () => {
  let ctx: AccessContext;
  let projectA: Awaited<ReturnType<typeof makeProject>>;
  let masters: Awaited<ReturnType<typeof makeBaseMasters>>;
  let engineerId: string;

  beforeAll(async () => {
    await ensurePermissions();
    const role = await makeRole('ATTN_TEST_ROLE', ['job.create', 'job.view', 'job.view_all_projects']);
    // The ENGINEER_OVERLOAD rule specifically queries users with a role keyed SERVICE_ENGINEER
    // (see attention/rules.ts), so the test engineer needs that exact role, not just any role.
    const engineerRole = await makeRole('SERVICE_ENGINEER', ['job.create', 'job.view']);
    projectA = await makeProject('ATTN_TEST_PROJECT');
    masters = await makeBaseMasters();
    const admin = await makeUser({ roleId: role.id, projectAccess: [] });
    const engineer = await makeUser({ roleId: engineerRole.id, projectAccess: [{ projectId: projectA.id, accessLevel: 'FULL' }] });
    engineerId = engineer.id;
    ctx = {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      active: true,
      roleKeys: ['ATTN_TEST_ROLE'],
      permissions: new Set(['job.view', 'job.view_all_projects']),
      projectAccess: [],
      canViewAllProjects: true,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeJob(overrides: Partial<{ narration: string }> = {}) {
    return createJobCard(ctx, {
      projectId: projectA.id,
      locationId: null,
      locationText: `Attention rule test ${Date.now()}-${Math.random()}`,
      categoryId: masters.category.id,
      jobTypeId: masters.jobType.id,
      priorityId: masters.priority.id,
      narration: overrides.narration ?? 'Attention rule test job',
      requesterName: 'Tester',
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: false,
    });
  }

  it('flags a job with an overdue next-action date as OVERDUE, and exposes owner/nextAction/dueBy/link', async () => {
    const job = await makeJob();
    await prisma.jobCard.update({ where: { id: job.id }, data: { nextActionDueAt: new Date(Date.now() - 5 * 3_600_000), status: 'ASSIGNED' } });

    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.jobCardId === job.id && i.type === 'OVERDUE');
    expect(found).toBeDefined();
    expect(found!.link).toBe(`/jobs/${job.id}`);
    expect(found!.hoursLate).toBeGreaterThan(0);
    expect(found!.why).toBeTruthy();
    expect(found!.recommendedAction).toBeTruthy();
  });

  it('flags an unassigned RAISED job as NO_OWNER', async () => {
    const job = await makeJob();
    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.jobCardId === job.id && i.type === 'NO_OWNER');
    expect(found).toBeDefined();
    expect(found!.currentOwner).toBeNull();
  });

  it('does NOT flag a job with no due date and recent activity as OVERDUE or NO_UPDATE', async () => {
    const job = await makeJob();
    await prisma.jobAssignment.create({ data: { jobCardId: job.id, userId: engineerId, role: 'ENGINEER', assignedById: ctx.userId } });
    await prisma.jobCard.update({ where: { id: job.id }, data: { status: 'ASSIGNED', currentOwnerUserId: engineerId } });

    const items = await computeAttentionItems(ctx);
    expect(items.some((i) => i.jobCardId === job.id && i.type === 'OVERDUE')).toBe(false);
    expect(items.some((i) => i.jobCardId === job.id && i.type === 'NO_UPDATE')).toBe(false);
  });

  it('flags a material requirement pending beyond the configured threshold as MATERIAL_BLOCKED', async () => {
    const job = await makeJob();
    await prisma.materialRequirement.create({
      data: {
        jobCardId: job.id,
        item: 'Test part',
        quantity: 1,
        unit: 'pcs',
        status: 'REQUIREMENT_RAISED',
        createdById: ctx.userId,
        createdAt: new Date(Date.now() - 50 * 3_600_000), // > 48h default threshold
      },
    });
    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.jobCardId === job.id && i.type === 'MATERIAL_BLOCKED');
    expect(found).toBeDefined();
    expect(found!.severity).toBe('MEDIUM');
  });

  it('respects a configured EscalationRule threshold instead of the hardcoded default', async () => {
    const job = await makeJob();
    // Configure a much shorter threshold (2h) for MATERIAL_BLOCKED.
    await prisma.escalationRule.upsert({
      where: { triggerType: 'MATERIAL_BLOCKED' },
      create: { triggerType: 'MATERIAL_BLOCKED', thresholdHours: 2, escalateToRole: 'PROJECT_HEAD' },
      update: { thresholdHours: 2, active: true },
    });
    await prisma.materialRequirement.create({
      data: {
        jobCardId: job.id,
        item: 'Test part 2',
        quantity: 1,
        unit: 'pcs',
        status: 'REQUIREMENT_RAISED',
        createdById: ctx.userId,
        createdAt: new Date(Date.now() - 3 * 3_600_000), // > 2h configured, < 48h default
      },
    });
    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.jobCardId === job.id && i.type === 'MATERIAL_BLOCKED');
    expect(found).toBeDefined();
    expect(found!.title).toContain('> 2h');

    await prisma.escalationRule.update({ where: { triggerType: 'MATERIAL_BLOCKED' }, data: { active: false } });
  });

  it('flags a hold whose review date has passed as HOLD_REVIEW_EXPIRED', async () => {
    const job = await makeJob();
    await prisma.hold.create({
      data: {
        jobCardId: job.id,
        reasonCode: 'TECHNICAL_CONSTRAINT',
        heldByUserId: ctx.userId,
        dependencyOwnerRole: 'PROJECT_HEAD',
        reviewDueAt: new Date(Date.now() - 3_600_000),
        comment: 'Test hold',
        statusBeforeHold: 'RAISED',
      },
    });
    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.jobCardId === job.id && i.type === 'HOLD_REVIEW_EXPIRED');
    expect(found).toBeDefined();
  });

  it('flags an engineer at/above the overload threshold as ENGINEER_OVERLOAD, with a filtered-list link (not a single Job Card)', async () => {
    const overloadedEngineer = await prisma.user.findUniqueOrThrow({ where: { id: engineerId } });
    for (let i = 0; i < 6; i++) {
      const job = await makeJob();
      await prisma.jobAssignment.create({ data: { jobCardId: job.id, userId: overloadedEngineer.id, role: 'ENGINEER', assignedById: ctx.userId } });
    }
    const items = await computeAttentionItems(ctx);
    const found = items.find((i) => i.type === 'ENGINEER_OVERLOAD' && i.currentOwner === overloadedEngineer.name);
    expect(found).toBeDefined();
    expect(found!.jobCardId).toBeNull();
    expect(found!.link).toBe(`/jobs?engineerId=${overloadedEngineer.id}`);
  });

  it('flags 2+ Job Cards at the same project/location/category as REPEAT_COMPLAINT', async () => {
    const sharedLocation = `Repeat complaint test ${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await createJobCard(ctx, {
        projectId: projectA.id,
        locationId: null,
        locationText: sharedLocation,
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: `Repeat complaint ${i}`,
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        assetTag: null,
        unitNumber: null,
        linkedJobCardId: null,
        duplicateAcknowledged: false,
      });
    }
    const items = await computeAttentionItems(ctx);
    expect(items.some((i) => i.type === 'REPEAT_COMPLAINT')).toBe(true);
  });
});
