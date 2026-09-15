import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { ensurePermissions, makeRole, makeUser, makeProject, makeBaseMasters } from './fixtures.js';

const app = createApp();

describe('Job Card lifecycle and project scoping', () => {
  let projectA: Awaited<ReturnType<typeof makeProject>>;
  let projectB: Awaited<ReturnType<typeof makeProject>>;
  let masters: Awaited<ReturnType<typeof makeBaseMasters>>;
  let adminToken: string;
  let scopedUserToken: string;
  let jobId: string;

  beforeAll(async () => {
    await ensurePermissions();
    const adminRole = await makeRole('TEST_ADMIN', ['job.create', 'job.view', 'job.view_all_projects', 'job.complete', 'job.edit', 'job.verify', 'job.close', 'job.reopen', 'job.assign']);
    projectA = await makeProject('TEST_A');
    projectB = await makeProject('TEST_B');
    masters = await makeBaseMasters();

    const scopedRole = await makeRole('TEST_SCOPED', ['job.create', 'job.view']);
    const admin = await makeUser({ roleId: adminRole.id, projectAccess: [] });
    const scopedUser = await makeUser({ roleId: scopedRole.id, projectAccess: [{ projectId: projectA.id, accessLevel: 'FULL' }] });

    const adminLogin = await request(app).post('/auth/login').send({ email: admin.email, password: admin.password });
    adminToken = adminLogin.body.accessToken;
    const scopedLogin = await request(app).post('/auth/login').send({ email: scopedUser.email, password: scopedUser.password });
    scopedUserToken = scopedLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects login with a bad password', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('assigning past an earlier stage with no closing command (TRIAGE) closes it too, not just the stage the command targets', async () => {
    const createRes = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: projectB.id,
        locationText: 'Stage-advance regression test',
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: 'Regression test for orphaned TRIAGE stage bug',
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        duplicateAcknowledged: false,
      });
    const stagesBefore: { stageKey: string; status: string }[] = createRes.body.stages;
    expect(stagesBefore.find((s) => s.stageKey === 'TRIAGE')?.status).toBe('ACTIVE');

    const assignRes = await request(app)
      .post(`/jobs/${createRes.body.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: (await prisma.user.findFirstOrThrow()).id, role: 'ENGINEER' });
    expect(assignRes.status).toBe(200);

    const detail = await request(app).get(`/jobs/${createRes.body.id}`).set('Authorization', `Bearer ${adminToken}`);
    const triage = detail.body.stages.find((s: { stageKey: string }) => s.stageKey === 'TRIAGE');
    const assign = detail.body.stages.find((s: { stageKey: string }) => s.stageKey === 'ASSIGN');
    expect(triage.status).toBe('DONE');
    expect(assign.status).toBe('DONE');
  });

  it('creates a Job Card in project B as admin', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: projectB.id,
        locationText: 'Test Location',
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: 'Test narration for job creation',
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        duplicateAcknowledged: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.jobNumber).toMatch(/^JC-\d{4}-\d{6}$/);
    expect(res.body.status).toBe('RAISED');
    expect(res.body.stages.length).toBeGreaterThan(0);
    jobId = res.body.id;
  });

  it('denies a project-B job to a user scoped only to project A (404, not 403)', async () => {
    const res = await request(app).get(`/jobs/${jobId}`).set('Authorization', `Bearer ${scopedUserToken}`);
    expect(res.status).toBe(404);
  });

  it('excludes project-B jobs from a project-A-scoped list', async () => {
    const res = await request(app).get('/jobs').set('Authorization', `Bearer ${scopedUserToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.find((j: { id: string }) => j.id === jobId)).toBeUndefined();
  });

  it('rejects an impossible workflow transition (Raised -> Start, §6 no impossible transitions)', async () => {
    const res = await request(app).post(`/jobs/${jobId}/start`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.details.allowedFrom).toContain('READY_TO_START');
  });

  it('rejects verifying a job that has not been completed yet', async () => {
    const res = await request(app).post(`/jobs/${jobId}/verify`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'VERIFIED' });
    expect(res.status).toBe(409);
  });

  it('blocks completion without an AFTER evidence attachment (§17)', async () => {
    await prisma.jobCard.update({ where: { id: jobId }, data: { status: 'IN_PROGRESS' } });
    const res = await request(app)
      .post(`/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ completionNotes: 'Done' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/evidence/i);
  });

  it('allows completion once evidence exists, then verifies and closes', async () => {
    await prisma.attachment.create({
      data: { jobCardId: jobId, type: 'PHOTO', phase: 'AFTER', fileName: 'after.jpg', path: '/uploads/after.jpg', uploadedById: (await prisma.user.findFirstOrThrow()).id },
    });
    const complete = await request(app)
      .post(`/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ completionNotes: 'Done with evidence' });
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('WORK_COMPLETED');
  });

  it('verifies, closes, then reopens into an actionable state (not a REOPENED dead end)', async () => {
    const verify = await request(app).post(`/jobs/${jobId}/verify`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'VERIFIED' });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('CLOSED');

    const reopen = await request(app)
      .post(`/jobs/${jobId}/reopen`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Issue recurred after closure.' });
    expect(reopen.status).toBe(200);
    expect(reopen.body.status).toBe('IN_PROGRESS');
    expect(reopen.body.reopenCount).toBe(1);
    expect(reopen.body.nextAction).toBeTruthy();
    expect(reopen.body.currentOwnerRole).toBe('SERVICE_ENGINEER');
  });
});
