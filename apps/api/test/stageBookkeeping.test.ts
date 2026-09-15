import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { ensurePermissions, makeRole, makeUser, makeProject } from './fixtures.js';

const app = createApp();

/**
 * Regression coverage for a real defect found while wiring up the Masters "Evidence
 * Requirements" toggle: commands that merely *start* a stage (siteVisitStart, start) were
 * wrongly wired to close it immediately, and requestMaterial/requestApproval never activated
 * the MATERIAL/APPROVAL stage at all. See workflowEngine.ts's STAGE_KEY_FOR_COMMAND /
 * DYNAMIC_STAGE_CLOSE_COMMANDS doc comments and service.ts's activateStageIfPresent.
 */
describe('Stage bookkeeping across a full MATERIAL_REQUIRED-shaped workflow', () => {
  let project: Awaited<ReturnType<typeof makeProject>>;
  let adminToken: string;
  let jobId: string;
  let engineerId: string;

  beforeAll(async () => {
    await ensurePermissions();
    const role = await makeRole('STAGE_TEST_ADMIN', [
      'job.create', 'job.view', 'job.view_all_projects', 'job.edit', 'job.complete', 'job.assign', 'material.create',
    ]);
    project = await makeProject('STAGE_TEST_PROJECT');
    const admin = await makeUser({ roleId: role.id, projectAccess: [] });
    const engineer = await makeUser({ roleId: role.id, projectAccess: [{ projectId: project.id, accessLevel: 'FULL' }] });
    engineerId = engineer.id;
    adminToken = (await request(app).post('/auth/login').send({ email: admin.email, password: admin.password })).body.accessToken;

    const category = await prisma.workCategory.upsert({ where: { code: 'STAGE_TEST_CAT' }, create: { code: 'STAGE_TEST_CAT', name: 'Stage Test Category' }, update: {} });
    const jobType = await prisma.jobType.upsert({ where: { code: 'MATERIAL_REQUIRED' }, create: { code: 'MATERIAL_REQUIRED', name: 'Material-Dependent Repair' }, update: {} });
    const priority = await prisma.priority.upsert({ where: { code: 'STAGE_TEST_PRIORITY' }, create: { code: 'STAGE_TEST_PRIORITY', name: 'Test Priority', rank: 9 }, update: {} });

    let template = await prisma.workflowTemplate.findUnique({ where: { key: 'MATERIAL_REQUIRED' } });
    if (!template) {
      template = await prisma.workflowTemplate.create({ data: { key: 'MATERIAL_REQUIRED', name: 'Material Required' } });
      const stages = [
        { key: 'TRIAGE', name: 'Triage', ownerRole: 'PROCESS_COORDINATOR' },
        { key: 'SITE_VISIT', name: 'Site Visit', ownerRole: 'SERVICE_ENGINEER' },
        { key: 'DIAGNOSIS', name: 'Diagnosis', ownerRole: 'SERVICE_ENGINEER' },
        { key: 'MATERIAL', name: 'Material Requirement & Availability', ownerRole: 'PROJECT_HEAD' },
        { key: 'EXECUTION', name: 'Execution', ownerRole: 'SERVICE_ENGINEER' },
        { key: 'VERIFICATION', name: 'Verification & Close', ownerRole: 'PROJECT_HEAD' },
      ];
      for (const [i, s] of stages.entries()) {
        await prisma.workflowStageTemplate.create({ data: { workflowTemplateId: template.id, key: s.key, name: s.name, sequence: i + 1, ownerRole: s.ownerRole, slaHours: 24 } });
      }
    }

    const create = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: project.id,
        locationText: 'Stage bookkeeping test location',
        categoryId: category.id,
        jobTypeId: jobType.id,
        priorityId: priority.id,
        narration: 'Stage bookkeeping regression test',
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

  function stageStatus(stages: { stageKey: string; status: string }[], key: string) {
    return stages.find((s) => s.stageKey === key)?.status;
  }

  it('assign closes TRIAGE and activates SITE_VISIT (not further)', async () => {
    const res = await request(app).post(`/jobs/${jobId}/assign`).set('Authorization', `Bearer ${adminToken}`).send({ userId: engineerId, role: 'ENGINEER' });
    expect(res.status).toBe(200);
    expect(stageStatus(res.body.stages, 'TRIAGE')).toBe('DONE');
    expect(stageStatus(res.body.stages, 'SITE_VISIT')).toBe('ACTIVE');
  });

  it('siteVisitStart does NOT close SITE_VISIT (it just begins)', async () => {
    const res = await request(app).post(`/jobs/${jobId}/site-visit/start`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(200);
    expect(stageStatus(res.body.stages, 'SITE_VISIT')).toBe('ACTIVE');
  });

  it('siteVisitComplete closes SITE_VISIT and activates DIAGNOSIS', async () => {
    const res = await request(app).post(`/jobs/${jobId}/site-visit/complete`).set('Authorization', `Bearer ${adminToken}`).send({ notes: 'Visited site.' });
    expect(res.status).toBe(200);
    expect(stageStatus(res.body.stages, 'SITE_VISIT')).toBe('DONE');
    expect(stageStatus(res.body.stages, 'DIAGNOSIS')).toBe('ACTIVE');
  });

  it('requesting material closes DIAGNOSIS and activates MATERIAL (§28 bottleneck visibility)', async () => {
    const res = await request(app)
      .post(`/jobs/${jobId}/materials`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ item: 'Test part', quantity: 1, unit: 'pcs' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('WAITING_MATERIAL');
    expect(stageStatus(res.body.stages, 'DIAGNOSIS')).toBe('DONE');
    expect(stageStatus(res.body.stages, 'MATERIAL')).toBe('ACTIVE');
  });

  it('the job list stageKey filter (dashboard Bottleneck View drill-down, §28) finds this job while active on MATERIAL', async () => {
    const onMaterial = await request(app).get('/jobs').query({ stageKey: 'MATERIAL' }).set('Authorization', `Bearer ${adminToken}`);
    expect(onMaterial.status).toBe(200);
    expect(onMaterial.body.items.some((j: { id: string }) => j.id === jobId)).toBe(true);

    const onSiteVisit = await request(app).get('/jobs').query({ stageKey: 'SITE_VISIT' }).set('Authorization', `Bearer ${adminToken}`);
    expect(onSiteVisit.body.items.some((j: { id: string }) => j.id === jobId)).toBe(false);
  });

  it('readyToStart closes MATERIAL (whatever is currently active) and activates EXECUTION', async () => {
    const res = await request(app).post(`/jobs/${jobId}/ready-to-start`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(200);
    expect(stageStatus(res.body.stages, 'MATERIAL')).toBe('DONE');
    expect(stageStatus(res.body.stages, 'EXECUTION')).toBe('ACTIVE');
  });

  it('start does NOT close EXECUTION', async () => {
    const res = await request(app).post(`/jobs/${jobId}/start`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(stageStatus(res.body.stages, 'EXECUTION')).toBe('ACTIVE');
  });

  it('completion is allowed without evidence when the stage template says requiredEvidence=false', async () => {
    // This template's EXECUTION stage was created above with the default requiredEvidence
    // (false) — completion must succeed without an AFTER attachment.
    const res = await request(app).post(`/jobs/${jobId}/complete`).set('Authorization', `Bearer ${adminToken}`).send({ completionNotes: 'Done, no evidence required by this template.' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WORK_COMPLETED');
    expect(stageStatus(res.body.stages, 'EXECUTION')).toBe('DONE');
  });
});
