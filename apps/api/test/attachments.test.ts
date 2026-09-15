import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { ensurePermissions, makeRole, makeUser, makeProject, makeBaseMasters } from './fixtures.js';

const app = createApp();

describe('Attachment access control (job/project scoped, not just "does the file exist")', () => {
  let projectA: Awaited<ReturnType<typeof makeProject>>;
  let projectB: Awaited<ReturnType<typeof makeProject>>;
  let masters: Awaited<ReturnType<typeof makeBaseMasters>>;
  let adminToken: string;
  let scopedAToken: string;
  let scopedBToken: string;
  let jobAId: string;
  let jobBId: string;
  let attachmentId: string;

  beforeAll(async () => {
    await ensurePermissions();
    const adminRole = await makeRole('ATTACH_TEST_ADMIN', ['job.create', 'job.view', 'job.view_all_projects', 'job.edit', 'job.complete']);
    const scopedRole = await makeRole('ATTACH_TEST_SCOPED', ['job.create', 'job.view', 'job.edit', 'job.complete']);
    projectA = await makeProject('ATTACH_A');
    projectB = await makeProject('ATTACH_B');
    masters = await makeBaseMasters();

    const admin = await makeUser({ roleId: adminRole.id, projectAccess: [] });
    const scopedA = await makeUser({ roleId: scopedRole.id, projectAccess: [{ projectId: projectA.id, accessLevel: 'FULL' }] });
    const scopedB = await makeUser({ roleId: scopedRole.id, projectAccess: [{ projectId: projectB.id, accessLevel: 'FULL' }] });

    adminToken = (await request(app).post('/auth/login').send({ email: admin.email, password: admin.password })).body.accessToken;
    scopedAToken = (await request(app).post('/auth/login').send({ email: scopedA.email, password: scopedA.password })).body.accessToken;
    scopedBToken = (await request(app).post('/auth/login').send({ email: scopedB.email, password: scopedB.password })).body.accessToken;

    const jobA = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: projectA.id,
        locationText: 'Attachment test location A',
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: 'Attachment access control test job A',
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        duplicateAcknowledged: false,
      });
    jobAId = jobA.body.id;

    const jobB = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: projectB.id,
        locationText: 'Attachment test location B',
        categoryId: masters.category.id,
        jobTypeId: masters.jobType.id,
        priorityId: masters.priority.id,
        narration: 'Attachment access control test job B',
        requesterName: 'Tester',
        isEmergency: false,
        safetyIssue: false,
        vendorRelated: false,
        duplicateAcknowledged: false,
      });
    jobBId = jobB.body.id;

    const upload = await request(app)
      .post(`/jobs/${jobAId}/attachments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'evidence.jpg', contentType: 'image/jpeg' })
      .field('phase', 'AFTER');
    expect(upload.status).toBe(201);
    attachmentId = upload.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects an unauthenticated request for the file', async () => {
    const res = await request(app).get(`/jobs/${jobAId}/attachments/${attachmentId}/file`);
    expect(res.status).toBe(401);
  });

  it('serves the file to a user with access to the owning project', async () => {
    const res = await request(app).get(`/jobs/${jobAId}/attachments/${attachmentId}/file`).set('Authorization', `Bearer ${scopedAToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.body.toString()).toContain('fake-jpeg-bytes');
  });

  it('returns 404 (not 403) for a user without access to the owning project', async () => {
    const res = await request(app).get(`/jobs/${jobAId}/attachments/${attachmentId}/file`).set('Authorization', `Bearer ${scopedBToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the attachment id is copied onto a different job id the caller CAN access (no cross-job guessing)', async () => {
    // scopedB has access to projectB / jobB, but the attachment actually belongs to jobA.
    const res = await request(app).get(`/jobs/${jobBId}/attachments/${attachmentId}/file`).set('Authorization', `Bearer ${scopedBToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a well-formed but nonexistent attachment id on a real, accessible job', async () => {
    const res = await request(app).get(`/jobs/${jobAId}/attachments/nonexistent-id/file`).set('Authorization', `Bearer ${scopedAToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects an unsupported file type on upload', async () => {
    const res = await request(app)
      .post(`/jobs/${jobAId}/attachments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('not an allowed type'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
  });
});
