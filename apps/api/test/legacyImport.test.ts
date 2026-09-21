import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { runLegacyImportBatch, mapCsvRow, findHeaderRowIndex, createLegacyImportBatch, processLegacyImportBatch, resolveAmbiguousProjectRows, type RawFmsRow } from '../src/modules/legacyImport/mapping.js';
import { ensurePermissions, makeRole, makeUser, makeProject, makeBaseMasters } from './fixtures.js';
import type { AccessContext } from '../src/lib/accessContext.js';

describe('Legacy FMS import', () => {
  let ctx: AccessContext;
  let project: Awaited<ReturnType<typeof makeProject>>;
  let masters: Awaited<ReturnType<typeof makeBaseMasters>>;

  beforeAll(async () => {
    await ensurePermissions();
    const role = await makeRole('LEGACY_TEST_ROLE', ['job.create', 'job.view', 'job.view_all_projects']);
    project = await makeProject('Legacy Test Property'); // note: makeProject uses `code` as both code+name
    masters = await makeBaseMasters();
    const admin = await makeUser({ roleId: role.id, projectAccess: [] });
    ctx = {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      active: true,
      roleKeys: ['LEGACY_TEST_ROLE'],
      permissions: new Set(['job.view', 'job.view_all_projects']),
      projectAccess: [],
      canViewAllProjects: true,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('maps CSV headers using documented aliases, case-insensitively', () => {
    const headers = ['Ref', 'Property', 'Work Category', 'Narration', 'Location'];
    const row = mapCsvRow(headers, ['R1', 'Legacy Test Property', 'Test Category', 'Leaky tap', 'Block A']);
    expect(row).toEqual({ reference: 'R1', property: 'Legacy Test Property', workCategory: 'Test Category', narration: 'Leaky tap', locationText: 'Block A' });
  });

  it('finds the real header row even when a legend/title block sits above it (real FMS export shape)', () => {
    const records = [
      ['', '', '', 'Site Visit', ''],
      ['Who', 'Akhilesh,Sagar', '', 'Site Engineer', ''],
      ['Timestamp', 'Property', 'Work Category', 'Narration', 'Planned'],
      ['08/07/2022', 'School', 'Others', 'Test issue', '09/07/2022'],
    ];
    expect(findHeaderRowIndex(records)).toBe(2);
  });

  it('treats row 0 as the header when it already looks like one (no legend block)', () => {
    const records = [
      ['Reference', 'Property', 'Work Category', 'Narration'],
      ['R1', 'School', 'Others', 'Test issue'],
    ];
    expect(findHeaderRowIndex(records)).toBe(0);
  });

  it('imports a valid row, marks it source=LEGACY_FMS, and leaves it RAISED with no completion date', async () => {
    const rows: RawFmsRow[] = [
      { reference: 'FMS-001', property: 'Legacy Test Property', workCategory: 'Test Category', narration: 'Corridor light not working', locationText: 'Block A corridor' },
    ];
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.imported).toBe(1);
    expect(report.rows[0].status).toBe('IMPORTED');

    const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: report.rows[0].matchedJobCardId! } });
    expect(job.source).toBe('LEGACY_FMS');
    expect(job.legacyRef).toBe('FMS-001');
    expect(job.status).toBe('RAISED');
    expect(job.closedAt).toBeNull();
  });

  it('imports a row with a completion/actual date as CLOSED', async () => {
    const rows: RawFmsRow[] = [
      {
        reference: 'FMS-002',
        property: 'Legacy Test Property',
        workCategory: 'Test Category',
        narration: 'Plumbing leak fixed',
        locationText: 'Block B',
        actual: '15/03/2025',
      },
    ];
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.imported).toBe(1);
    const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: report.rows[0].matchedJobCardId! } });
    expect(job.status).toBe('CLOSED');
    expect(job.closedAt).not.toBeNull();
    expect(job.legacyActualDate?.toISOString().slice(0, 10)).toBe('2025-03-15');
  });

  it('is idempotent: re-running the exact same rows marks them DUPLICATE, not re-imported', async () => {
    const rows: RawFmsRow[] = [
      { reference: 'FMS-003', property: 'Legacy Test Property', workCategory: 'Test Category', narration: 'Idempotency test row', locationText: 'Block C' },
    ];
    const first = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(first.imported).toBe(1);

    const second = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(second.imported).toBe(0);
    expect(second.duplicate).toBe(1);
    expect(second.rows[0].matchedJobCardId).toBe(first.rows[0].matchedJobCardId);

    const count = await prisma.jobCard.count({ where: { legacyRef: 'FMS-003' } });
    expect(count).toBe(1); // never duplicated
  });

  it('marks a row AMBIGUOUS when the property name matches no Master, rather than guessing', async () => {
    const rows: RawFmsRow[] = [
      { reference: 'FMS-004', property: 'Some Property That Does Not Exist', workCategory: 'Test Category', narration: 'Test', locationText: 'Somewhere' },
    ];
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.ambiguous).toBe(1);
    expect(report.rows[0].reasonText).toMatch(/No unique Project match/);
    expect(report.warnings.some((w) => w.includes('confident'))).toBe(true);
  });

  it('an exact Project name match wins outright even if other Projects contain it as a substring', async () => {
    await prisma.project.upsert({ where: { code: 'SCHOOL' }, create: { code: 'SCHOOL', name: 'School' }, update: { name: 'School', active: true } });
    await prisma.project.upsert({ where: { code: 'CITY_SCHOOL' }, create: { code: 'CITY_SCHOOL', name: 'City School' }, update: { name: 'City School', active: true } });

    const rows: RawFmsRow[] = [{ reference: 'FMS-EXACT-1', property: '  school  ', workCategory: 'Test Category', narration: 'Exact match test', locationText: 'Gate' }];
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.rows[0].status).toBe('IMPORTED');
    const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: report.rows[0].matchedJobCardId! } });
    expect(job.projectId).toBe((await prisma.project.findUniqueOrThrow({ where: { code: 'SCHOOL' } })).id);
  });

  it('surfaces the candidate Projects and lets the user resolve "School" once for the whole batch', async () => {
    const cityCampus = await prisma.project.upsert({ where: { code: 'CAMPUS_SCHOOL_EAST' }, create: { code: 'CAMPUS_SCHOOL_EAST', name: 'Campus School East Wing' }, update: { name: 'Campus School East Wing', active: true } });
    await prisma.project.upsert({ where: { code: 'CAMPUS_SCHOOL_WEST' }, create: { code: 'CAMPUS_SCHOOL_WEST', name: 'Campus School West Wing' }, update: { name: 'Campus School West Wing', active: true } });

    // Neither name is an exact match for "Campus School", and both contain it as a substring —
    // this is the real AMBIGUOUS case: multiple valid candidates, none picked arbitrarily.
    const rows: RawFmsRow[] = [
      { reference: 'FMS-AMB-1', property: 'Campus School', workCategory: 'Test Category', narration: 'Row A', locationText: 'Gate 1' },
      { reference: 'FMS-AMB-2', property: 'campus   school', workCategory: 'Test Category', narration: 'Row B', locationText: 'Gate 2' },
    ];
    const batch = await createLegacyImportBatch('school-ambiguous.csv', rows.length);
    const first = await processLegacyImportBatch(batch.id, ctx, rows);

    expect(first.ambiguous).toBe(2);
    expect(first.rows[0].reasonText).toMatch(/Multiple Projects match/);
    expect(first.rows[0].candidates?.field).toBe('project');
    const candidateNames = first.rows[0].candidates?.options.map((o) => o.name).sort();
    expect(candidateNames).toEqual(['Campus School East Wing', 'Campus School West Wing']);

    // User picks "Campus School East Wing" once — it must resolve BOTH ambiguous rows from this batch,
    // since "Campus School" and "campus   school" normalize to the same text.
    const resolved = await resolveAmbiguousProjectRows(batch.id, ctx, 'Campus School', cityCampus.id);
    expect(resolved.imported).toBe(2);
    expect(resolved.ambiguous).toBe(0);
    for (const r of resolved.rows) {
      const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: r.matchedJobCardId! } });
      expect(job.projectId).toBe(cityCampus.id);
    }
  });

  it('marks a row SKIPPED when a required field is missing', async () => {
    const rows: RawFmsRow[] = [{ reference: 'FMS-005', property: 'Legacy Test Property', workCategory: 'Test Category', locationText: 'Block D' }]; // no narration
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.skipped).toBe(1);
    expect(report.rows[0].status).toBe('SKIPPED');
  });

  it('never fabricates a legacyRef collision across unrelated rows without an explicit reference', async () => {
    const rows: RawFmsRow[] = [
      { property: 'Legacy Test Property', workCategory: 'Test Category', narration: 'No explicit reference row A', locationText: 'Block E' },
      { property: 'Legacy Test Property', workCategory: 'Test Category', narration: 'No explicit reference row B', locationText: 'Block F' },
    ];
    const report = await runLegacyImportBatch(ctx, 'test.csv', rows);
    expect(report.imported).toBe(2);
    expect(report.rows[0].legacyRef).not.toBe(report.rows[1].legacyRef);
  });

  void masters;
});
