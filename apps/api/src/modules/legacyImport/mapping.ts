import crypto from 'node:crypto';
import { prisma } from '../../lib/db.js';
import { createJobCard } from '../jobs/service.js';
import type { AccessContext } from '../../lib/accessContext.js';

/**
 * Draft mapping against the process description in the master prompt §3/§46 — no real FMS
 * export was available to verify column headers against (see MIGRATION_FMS.md). Header
 * aliases are intentionally generous (several plausible spellings per field) since we don't
 * know the real sheet's exact headers; anything that doesn't confidently match a real Master
 * record is AMBIGUOUS, never guessed.
 */
export interface RawFmsRow {
  reference?: string;
  property?: string;
  workCategory?: string;
  narration?: string;
  typeOfWork?: string;
  requester?: string;
  desiredCompletionDate?: string;
  locationText?: string;
  planned?: string;
  actual?: string;
  status?: string;
  delay?: string;
}

const HEADER_ALIASES: Record<keyof RawFmsRow, string[]> = {
  reference: ['reference', 'ref', 'row ref', 's.no', 'sno', 'id'],
  property: ['property', 'project', 'site'],
  workCategory: ['work category', 'category'],
  narration: ['narration', 'description', 'problem description', 'issue'],
  typeOfWork: ['type of work', 'job type', 'work type'],
  requester: ['requester', 'raised by', 'reported by', 'name'],
  desiredCompletionDate: ['desired completion date', 'desired completion', 'completion date', 'target date'],
  locationText: ['location', 'exact location', 'area'],
  planned: ['planned', 'planned date'],
  actual: ['actual', 'actual date', 'completion'],
  status: ['status'],
  delay: ['time delay', 'delay'],
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

const ALL_ALIASES = Object.values(HEADER_ALIASES).flat();

/** Real spreadsheet exports (e.g. Google Forms/Sheets with a legend block above the data) often
 * have a few non-header rows — titles, "Who/How/When" legends, blank rows — before the actual
 * column header row. Scans the first few rows and picks the one that looks most like a header
 * (most cells matching a known alias), rather than always assuming row 0. Falls back to row 0 if
 * nothing scores above the minimum, so a normal CSV with the header already on row 0 is unaffected. */
export function findHeaderRowIndex(records: string[][], scanLimit = 15): number {
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(records.length, scanLimit); i++) {
    const normalized = records[i].map(normalizeHeader);
    const score = normalized.filter((h) => ALL_ALIASES.includes(h)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : 0;
}

/** Maps a raw CSV header row + data row into RawFmsRow using the alias table above. Columns
 * that don't match any known alias are ignored (not an error — the source sheet may have
 * extra columns we don't use). */
export function mapCsvRow(headers: string[], values: string[]): RawFmsRow {
  const normalizedHeaders = headers.map(normalizeHeader);
  const row: RawFmsRow = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof RawFmsRow, string[]][]) {
    const idx = normalizedHeaders.findIndex((h) => aliases.includes(h));
    if (idx >= 0 && values[idx] !== undefined && values[idx].trim() !== '') {
      row[field] = values[idx].trim();
    }
  }
  return row;
}

export function hashRow(row: RawFmsRow): string {
  const basis = `${row.property ?? ''}|${row.locationText ?? ''}|${row.narration ?? ''}|${row.planned ?? ''}`;
  return `hash:${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

/** Accepts common Indian/ISO date formats found in spreadsheet exports (DD/MM/YYYY, DD-MM-YYYY,
 * YYYY-MM-DD); returns null (never a guessed date) if the format isn't recognized. */
export function parseLegacyDate(value: string | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = new Date(trimmed);
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !Number.isNaN(iso.getTime())) return iso;
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

/** Case/space/punctuation-insensitive normalization so "St. Xavier's School", "st xaviers school"
 * and "ST XAVIERS  SCHOOL" all compare equal — minor formatting differences between the legacy
 * sheet and the Master name should never cause an avoidable AMBIGUOUS. */
function normalizeMasterName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

export interface MasterMatchResult<T> {
  match: T | null;
  /** Populated only when zero-or-multiple candidates made the match ambiguous, so the caller can
   * surface exactly these options for a human to pick from rather than guessing. */
  candidates: T[];
}

/** Exact (normalized) name match always wins outright, even if some other Master's name merely
 * *contains* the needle as a substring — e.g. an exact Master named "School" must resolve on its
 * own even if "City School" and "Old School Building" also exist and would otherwise turn a
 * same-text "contains" search ambiguous. Only when there is no exact match do we fall back to a
 * substring search, and only a single substring hit is accepted; two or more are returned as
 * candidates for human resolution rather than guessed. */
function findUniqueMasterMatch<T extends { id: string; name: string; active: boolean }>(
  rows: T[],
  needle: string | undefined,
): MasterMatchResult<T> {
  if (!needle) return { match: null, candidates: [] };
  const norm = normalizeMasterName(needle);
  if (!norm) return { match: null, candidates: [] };
  const active = rows.filter((r) => r.active);

  const exact = active.filter((r) => normalizeMasterName(r.name) === norm);
  if (exact.length >= 1) return { match: exact.length === 1 ? exact[0] : null, candidates: exact.length === 1 ? [] : exact };

  const contains = active.filter((r) => normalizeMasterName(r.name).includes(norm));
  if (contains.length === 1) return { match: contains[0], candidates: [] };
  return { match: null, candidates: contains }; // zero or multiple candidates — ambiguous, never guess
}

export interface RowResult {
  rowNumber: number;
  status: 'IMPORTED' | 'SKIPPED' | 'AMBIGUOUS' | 'DUPLICATE' | 'FAILED';
  legacyRef: string;
  matchedJobCardId?: string;
  reasonText?: string;
  /** Set only when AMBIGUOUS because a field matched more than one active Master — the exact
   * options a human can pick from via the resolve-project endpoint. */
  candidates?: { field: 'project'; rawText: string; options: { id: string; name: string }[] };
}

interface MasterCache {
  projects: Awaited<ReturnType<typeof prisma.project.findMany>>;
  categories: Awaited<ReturnType<typeof prisma.workCategory.findMany>>;
  jobTypes: Awaited<ReturnType<typeof prisma.jobType.findMany>>;
  normalPriority: Awaited<ReturnType<typeof prisma.priority.findFirst>>;
}

async function loadMasterCache(): Promise<MasterCache> {
  const [projects, categories, jobTypes, normalPriority] = await Promise.all([
    prisma.project.findMany(),
    prisma.workCategory.findMany(),
    prisma.jobType.findMany(),
    prisma.priority.findFirst({ where: { code: 'NORMAL' } }),
  ]);
  return { projects, categories, jobTypes, normalPriority };
}

export async function importLegacyRow(
  ctx: AccessContext,
  row: RawFmsRow,
  rowNumber: number,
  masters: MasterCache,
  propertyMappings: Record<string, string> = {},
): Promise<RowResult> {
  const legacyRef = row.reference?.trim() || hashRow(row);

  const existing = await prisma.jobCard.findFirst({ where: { legacyRef, source: 'LEGACY_FMS' } });
  if (existing) {
    return { rowNumber, status: 'DUPLICATE', legacyRef, matchedJobCardId: existing.id, reasonText: 'Already imported in a previous run (matched by legacyRef) — idempotent no-op.' };
  }

  if (!row.narration?.trim() || !row.property?.trim()) {
    return { rowNumber, status: 'SKIPPED', legacyRef, reasonText: 'Missing a required field (narration or property).' };
  }
  // The real FIR Card / Work Capture sheet has no structured location column (only an "Image of
  // Location" photo link), so locationText is routinely absent from source data. It's a required
  // field on JobCard, but leaving it blank here would skip every legacy row outright — falling
  // back to a clearly-marked placeholder lets the row import for human triage instead.
  const locationText = row.locationText?.trim() || 'Not specified (legacy import — no location column in source sheet)';

  const { projects, categories, jobTypes, normalPriority } = masters;

  // A prior AMBIGUOUS row in this same batch may already have been resolved by the user (see
  // resolve-project route) — reuse that exact choice for every row whose property text
  // normalizes the same way, instead of asking again or re-running the auto-match.
  const mappedProjectId = row.property ? propertyMappings[normalizeMasterName(row.property)] : undefined;
  const mappedProject = mappedProjectId ? projects.find((p) => p.id === mappedProjectId && p.active) : undefined;

  const projectMatch = mappedProject ? { match: mappedProject, candidates: [] } : findUniqueMasterMatch(projects, row.property);
  if (!projectMatch.match) {
    const reasonText = projectMatch.candidates.length > 1
      ? `Multiple Projects match "${row.property}": ${projectMatch.candidates.map((p) => p.name).join(', ')}. Select the correct one to map this text for the rest of the import.`
      : `No unique Project match for "${row.property}". Add/rename the Project master, or correct the source data.`;
    return {
      rowNumber,
      status: 'AMBIGUOUS',
      legacyRef,
      reasonText,
      ...(projectMatch.candidates.length > 1
        ? { candidates: { field: 'project' as const, rawText: row.property ?? '', options: projectMatch.candidates.map((p) => ({ id: p.id, name: p.name })) } }
        : {}),
    };
  }
  const project = projectMatch.match;

  const categoryMatch = findUniqueMasterMatch(categories, row.workCategory);
  if (!categoryMatch.match) return { rowNumber, status: 'AMBIGUOUS', legacyRef, reasonText: `No unique Work Category match for "${row.workCategory ?? '(blank)'}". Add/rename the Category master, or correct the source data.` };
  const category = categoryMatch.match;

  const jobType = row.typeOfWork ? findUniqueMasterMatch(jobTypes, row.typeOfWork).match : jobTypes.find((jt) => jt.code === 'SIMPLE_REPAIR') ?? null;
  if (!jobType) return { rowNumber, status: 'AMBIGUOUS', legacyRef, reasonText: `No Job Type match for "${row.typeOfWork ?? '(blank, and no SIMPLE_REPAIR default seeded)'}".` };

  const priority = normalPriority;
  if (!priority) return { rowNumber, status: 'FAILED', legacyRef, reasonText: 'No NORMAL priority master exists to default legacy rows to.' };

  try {
    const desiredCompletionDate = parseLegacyDate(row.desiredCompletionDate);
    const job = await createJobCard(ctx, {
      projectId: project.id,
      locationId: null,
      locationText,
      categoryId: category.id,
      subcategoryId: null,
      jobTypeId: jobType.id,
      priorityId: priority.id,
      narration: row.narration,
      requesterName: row.requester?.trim() || 'Unknown (legacy import)',
      requesterContact: null,
      desiredCompletionDate: desiredCompletionDate ? desiredCompletionDate.toISOString() : null,
      isEmergency: false,
      safetyIssue: false,
      vendorRelated: false,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged: true, // legacy rows aren't subject to live duplicate-detection UX
    });

    const plannedDate = parseLegacyDate(row.planned);
    const actualDate = parseLegacyDate(row.actual);

    await prisma.jobCard.update({
      where: { id: job.id },
      data: {
        source: 'LEGACY_FMS',
        legacyRef,
        legacyPlannedDate: plannedDate,
        legacyActualDate: actualDate,
        legacyStatusText: row.status ?? null,
        legacyDelayText: row.delay ?? null,
        // §46: never claim the legacy status was structured. A completion date is the only
        // signal treated as authoritative; everything else stays RAISED for human triage.
        ...(actualDate ? { status: 'CLOSED', closedAt: actualDate } : {}),
      },
    });
    await prisma.serviceRequest.update({ where: { id: job.serviceRequest.id }, data: { source: 'LEGACY_FMS' } });
    await prisma.comment.create({
      data: {
        jobCardId: job.id,
        authorId: ctx.userId,
        isSystem: true,
        body: actualDate
          ? `Imported from Legacy FMS, closed (original status text: "${row.status ?? 'unknown'}").`
          : `Imported from Legacy FMS — no completion date found (original status text: "${row.status ?? 'unknown'}"). Needs human triage.`,
      },
    });

    return { rowNumber, status: 'IMPORTED', legacyRef, matchedJobCardId: job.id };
  } catch (err) {
    return { rowNumber, status: 'FAILED', legacyRef, reasonText: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface ImportReport {
  batchId: string;
  imported: number;
  skipped: number;
  ambiguous: number;
  duplicate: number;
  failed: number;
  warnings: string[];
  rows: RowResult[];
}

/** Creates the batch row synchronously (so the caller gets an id to return/poll immediately),
 * without running any of the actual per-row work yet. */
export async function createLegacyImportBatch(sourceSheet: string, totalRows: number) {
  return prisma.legacyImportBatch.create({ data: { sourceSheet, totalRows, status: 'PROCESSING' } });
}

/** Processes every row of an already-created batch. A real FMS export can be thousands of rows,
 * each needing several sequential DB round trips (duplicate check, master lookups, job creation,
 * audit comment) — far too slow to run inside one HTTP request/response cycle against a hosted
 * Mongo cluster. Callers should invoke this without awaiting it from the request handler (see
 * routes.ts) and let the UI poll the batch's `status` field instead.
 *
 * Idempotent: re-running the same source rows re-detects DUPLICATE via legacyRef and does not
 * create new Job Cards for rows already imported. */
export async function processLegacyImportBatch(batchId: string, ctx: AccessContext, rows: RawFmsRow[]): Promise<ImportReport> {
  const counts = { imported: 0, skipped: 0, ambiguous: 0, duplicate: 0, failed: 0 };
  const results: RowResult[] = [];
  const masters = await loadMasterCache();
  const batch = await prisma.legacyImportBatch.findUnique({ where: { id: batchId } });
  const propertyMappings: Record<string, string> = batch?.propertyMappings ? JSON.parse(batch.propertyMappings) : {};

  try {
    for (const [i, row] of rows.entries()) {
      const rowNumber = i + 1;
      let result: RowResult;
      try {
        result = await importLegacyRow(ctx, row, rowNumber, masters, propertyMappings);
      } catch (err) {
        result = { rowNumber, status: 'FAILED', legacyRef: row.reference ?? `row-${rowNumber}`, reasonText: err instanceof Error ? err.message : 'Unknown error' };
      }
      results.push(result);
      counts[result.status.toLowerCase() as Lowercase<RowResult['status']>] += 1;
      // Persist progress periodically (not every row — that would double the DB round trips this
      // whole refactor exists to cut down on) so the UI's poll shows real movement on a long run.
      if (rowNumber % 20 === 0) {
        await prisma.legacyImportBatch.update({ where: { id: batchId }, data: counts });
      }
      await prisma.legacyImportRow.create({
        data: {
          batchId,
          rowNumber,
          rawJson: JSON.stringify(row),
          status: result.status,
          legacyRef: result.legacyRef,
          matchedJobCardId: result.matchedJobCardId ?? null,
          reasonText: result.reasonText ?? null,
          candidatesJson: result.candidates ? JSON.stringify(result.candidates) : null,
        },
      });
    }

    const warnings: string[] = [];
    if (counts.ambiguous > 0) warnings.push(`${counts.ambiguous} row(s) had no confident Project/Category/Job Type match and were NOT imported — fix the source data or add the missing Master, then re-run this same file (it's safe to re-run: already-imported rows are skipped as duplicates).`);
    if (counts.skipped > 0) warnings.push(`${counts.skipped} row(s) were missing a required field (narration/property) and were skipped.`);
    if (counts.failed > 0) warnings.push(`${counts.failed} row(s) failed unexpectedly — see each row's reasonText.`);
    if (rows.length > 0 && counts.imported === 0 && counts.duplicate === 0) warnings.push('No rows were imported. Check that the CSV headers match the documented aliases.');

    await prisma.legacyImportBatch.update({
      where: { id: batchId },
      data: { status: 'COMPLETED', ...counts, warnings: JSON.stringify(warnings) },
    });

    return { batchId, ...counts, warnings, rows: results };
  } catch (err) {
    await prisma.legacyImportBatch.update({
      where: { id: batchId },
      data: { status: 'FAILED', ...counts, warnings: JSON.stringify([`Import crashed: ${err instanceof Error ? err.message : 'Unknown error'}`]) },
    });
    throw err;
  }
}

/** Applies a user-chosen "this raw property text means this Project" mapping to a batch, then
 * re-runs every row still AMBIGUOUS on the project field whose raw text normalizes the same way
 * as `rawText` — so picking "School" -> "City School" once resolves every "School" row from the
 * same import in one go, without re-asking or silently guessing for the rest. The mapping is
 * saved on the batch so any *later* AMBIGUOUS-with-candidates row (e.g. rows processed after this
 * call, or a fully independent re-run of resolve-project) reuses it too. */
export async function resolveAmbiguousProjectRows(batchId: string, ctx: AccessContext, rawText: string, projectId: string): Promise<ImportReport> {
  const batch = await prisma.legacyImportBatch.findUnique({ where: { id: batchId }, include: { rows: true } });
  if (!batch) throw new Error('Import batch not found');

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !project.active) throw new Error('Selected Project master not found or inactive');

  const norm = normalizeMasterName(rawText);
  const propertyMappings: Record<string, string> = batch.propertyMappings ? JSON.parse(batch.propertyMappings) : {};
  propertyMappings[norm] = projectId;
  await prisma.legacyImportBatch.update({ where: { id: batchId }, data: { propertyMappings: JSON.stringify(propertyMappings) } });

  const masters = await loadMasterCache();
  const affected = batch.rows.filter((r) => r.status === 'AMBIGUOUS' && r.candidatesJson && JSON.parse(r.candidatesJson).field === 'project' && normalizeMasterName(JSON.parse(r.rawJson).property ?? '') === norm);

  const results: RowResult[] = [];
  const delta = { imported: 0, skipped: 0, ambiguous: 0, duplicate: 0, failed: 0 };
  for (const legacyRow of affected) {
    const row: RawFmsRow = JSON.parse(legacyRow.rawJson);
    let result: RowResult;
    try {
      result = await importLegacyRow(ctx, row, legacyRow.rowNumber, masters, propertyMappings);
    } catch (err) {
      result = { rowNumber: legacyRow.rowNumber, status: 'FAILED', legacyRef: row.reference ?? `row-${legacyRow.rowNumber}`, reasonText: err instanceof Error ? err.message : 'Unknown error' };
    }
    results.push(result);
    delta.ambiguous -= 1; // this row was already counted as ambiguous
    delta[result.status.toLowerCase() as Lowercase<RowResult['status']>] += 1;
    await prisma.legacyImportRow.update({
      where: { id: legacyRow.id },
      data: {
        status: result.status,
        matchedJobCardId: result.matchedJobCardId ?? null,
        reasonText: result.reasonText ?? null,
        candidatesJson: result.candidates ? JSON.stringify(result.candidates) : null,
      },
    });
  }

  const updated = await prisma.legacyImportBatch.update({
    where: { id: batchId },
    data: {
      imported: { increment: delta.imported },
      skipped: { increment: delta.skipped },
      ambiguous: { increment: delta.ambiguous },
      duplicate: { increment: delta.duplicate },
      failed: { increment: delta.failed },
    },
  });

  return {
    batchId,
    imported: updated.imported,
    skipped: updated.skipped,
    ambiguous: updated.ambiguous,
    duplicate: updated.duplicate,
    failed: updated.failed,
    warnings: updated.warnings ? JSON.parse(updated.warnings) : [],
    rows: results,
  };
}

/** Convenience wrapper for callers (tests, scripts) that want create+process as one synchronous
 * call. The HTTP endpoint does NOT use this — see routes.ts, which returns as soon as the batch
 * is created and lets processLegacyImportBatch run in the background. */
export async function runLegacyImportBatch(ctx: AccessContext, sourceSheet: string, rows: RawFmsRow[]): Promise<ImportReport> {
  const batch = await createLegacyImportBatch(sourceSheet, rows.length);
  return processLegacyImportBatch(batch.id, ctx, rows);
}
