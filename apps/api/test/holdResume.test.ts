import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { ensurePermissions, makeRole, makeUser, makeProject, makeBaseMasters } from './fixtures.js';

const app = createApp();

/**
 * Regression coverage for a real defect found while verifying the MongoDB migration: Hold and
 * SLAPause were created without an explicit `endAt: null`, so on MongoDB (unlike SQLite/Postgres)
 * the "find the open hold/pause" lookups in POST /:id/resume — which filter `endAt: null` — never
 * matched them. Resume would still flip the Job Card's status back, but silently leave the Hold
 * and SLAPause rows open forever, permanently breaking SLA-pause accounting and the
 * HOLD_REVIEW_EXPIRED attention rule for that record. See jobs/routes.ts's /hold and /resume
 * handlers for the fix (explicit `endAt: null` at creation).
 */
describe('Hold and Resume actually end-date their Hold/SLAPause records', () => {
  let project: Awaited<ReturnType<typeof makeProject>>;
  let masters: Awaited<ReturnType<typeof makeBaseMasters>>;
  let adminToken: string;
  let jobId: string;

  beforeAll(async () => {
    await ensurePermissions();
    const role = await makeRole('HOLD_RESUME_TEST_ADMIN', ['job.create', 'job.view', 'job.view_all_projects', 'job.hold', 'job.resume']);
    project = await makeProject('HOLD_RESUME_TEST_PROJECT');
    masters = await makeBaseMasters();
    const admin = await makeUser({ roleId: role.id, projectAccess: [] });
    adminToken = (await request(app).post('/auth/login').send({ email: admin.email, password: admin.password })).body.accessToken;

    const create = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: project.id,
        locationText: 'Hold/resume test location',
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: 'Hold/resume regression test',
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        duplicateAcknowledged: false,
      });
    jobId = create.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('hold creates an open Hold + SLAPause, resume end-dates both', async () => {
    const holdRes = await request(app)
      .post(`/jobs/${jobId}/hold`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reasonCode: 'TECHNICAL_CONSTRAINT', dependencyOwnerRole: 'PROJECT_HEAD', reviewDueAt: new Date(Date.now() + 86_400_000).toISOString(), comment: 'Waiting on parts', slaPauses: true });
    expect(holdRes.status).toBe(200);
    expect(holdRes.body.status).toBe('ON_HOLD');

    const openHoldBeforeResume = await prisma.hold.findFirst({ where: { jobCardId: jobId, endAt: null } });
    expect(openHoldBeforeResume).not.toBeNull();
    const openPauseBeforeResume = await prisma.sLAPause.findFirst({ where: { jobCardId: jobId, endAt: null } });
    expect(openPauseBeforeResume).not.toBeNull();

    const resumeRes = await request(app).post(`/jobs/${jobId}/resume`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(resumeRes.status).toBe(200);

    const openHoldAfterResume = await prisma.hold.findFirst({ where: { jobCardId: jobId, endAt: null } });
    expect(openHoldAfterResume).toBeNull();
    const closedHold = await prisma.hold.findUnique({ where: { id: openHoldBeforeResume!.id } });
    expect(closedHold?.endAt).not.toBeNull();

    const openPauseAfterResume = await prisma.sLAPause.findFirst({ where: { jobCardId: jobId, endAt: null } });
    expect(openPauseAfterResume).toBeNull();
    const closedPause = await prisma.sLAPause.findUnique({ where: { id: openPauseBeforeResume!.id } });
    expect(closedPause?.endAt).not.toBeNull();
  });
});
