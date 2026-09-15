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

async function findUniqueMasterMatch<T extends { id: string; name: string; active: boolean }>(
  rows: T[],
  needle: string | undefined,
): Promise<T | null> {
  if (!needle) return null;
  const norm = needle.trim().toLowerCase();
  const exact = rows.filter((r) => r.active && r.name.trim().toLowerCase() === norm);
  if (exact.length === 1) return exact[0];
  const contains = rows.filter((r) => r.active && r.name.trim().toLowerCase().includes(norm));
  if (contains.length === 1) return contains[0];
  return null; // zero or multiple candidates — ambiguous, never guess
}

export interface RowResult {
  rowNumber: number;
  status: 'IMPORTED' | 'SKIPPED' | 'AMBIGUOUS' | 'DUPLICATE' | 'FAILED';
  legacyRef: string;
  matchedJobCardId?: string;
  reasonText?: string;
}

export async function importLegacyRow(ctx: AccessContext, row: RawFmsRow, rowNumber: number): Promise<RowResult> {
  const legacyRef = row.reference?.trim() || hashRow(row);

  const existing = await prisma.jobCard.findFirst({ where: { legacyRef, source: 'LEGACY_FMS' } });
  if (existing) {
    return { rowNumber, status: 'DUPLICATE', legacyRef, matchedJobCardId: existing.id, reasonText: 'Already imported in a previous run (matched by legacyRef) — idempotent no-op.' };
  }

  if (!row.narration?.trim() || !row.property?.trim() || !row.locationText?.trim()) {
    return { rowNumber, status: 'SKIPPED', legacyRef, reasonText: 'Missing a required field (narration, property, or location).' };
  }

  const [projects, categories, jobTypes] = await Promise.all([
    prisma.project.findMany(),
    prisma.workCategory.findMany(),
    prisma.jobType.findMany(),
  ]);

  const project = await findUniqueMasterMatch(projects, row.property);
  if (!project) return { rowNumber, status: 'AMBIGUOUS', legacyRef, reasonText: `No unique Project match for "${row.property}". Add/rename the Project master, or correct the source data.` };

  const category = await findUniqueMasterMatch(categories, row.workCategory);
  if (!category) return { rowNumber, status: 'AMBIGUOUS', legacyRef, reasonText: `No unique Work Category match for "${row.workCategory ?? '(blank)'}". Add/rename the Category master, or correct the source data.` };

  const jobType = row.typeOfWork ? await findUniqueMasterMatch(jobTypes, row.typeOfWork) : jobTypes.find((jt) => jt.code === 'SIMPLE_REPAIR') ?? null;
  if (!jobType) return { rowNumber, status: 'AMBIGUOUS', legacyRef, reasonText: `No Job Type match for "${row.typeOfWork ?? '(blank, and no SIMPLE_REPAIR default seeded)'}".` };

  const priority = await prisma.priority.findFirst({ where: { code: 'NORMAL' } });
  if (!priority) return { rowNumber, status: 'FAILED', legacyRef, reasonText: 'No NORMAL priority master exists to default legacy rows to.' };

  try {
    const desiredCompletionDate = parseLegacyDate(row.desiredCompletionDate);
    const job = await createJobCard(ctx, {
      projectId: project.id,
      locationId: null,
      locationText: row.locationText,
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

/** Runs a full batch, persisting a LegacyImportBatch + one LegacyImportRow per input row.
 * Idempotent: re-running the same source rows re-detects DUPLICATE via legacyRef and does not
 * create new Job Cards for rows already imported. */
export async function runLegacyImportBatch(ctx: AccessContext, sourceSheet: string, rows: RawFmsRow[]): Promise<ImportReport> {
  const batch = await prisma.legacyImportBatch.create({ data: { sourceSheet } });
  const results: RowResult[] = [];
  const counts = { imported: 0, skipped: 0, ambiguous: 0, duplicate: 0, failed: 0 };

  for (const [i, row] of rows.entries()) {
    const rowNumber = i + 1;
    let result: RowResult;
    try {
      result = await importLegacyRow(ctx, row, rowNumber);
    } catch (err) {
      result = { rowNumber, status: 'FAILED', legacyRef: row.reference ?? `row-${rowNumber}`, reasonText: err instanceof Error ? err.message : 'Unknown error' };
    }
    results.push(result);
    counts[result.status.toLowerCase() as Lowercase<RowResult['status']>] += 1;
    await prisma.legacyImportRow.create({
      data: {
        batchId: batch.id,
        rowNumber,
        rawJson: JSON.stringify(row),
        status: result.status,
        legacyRef: result.legacyRef,
        matchedJobCardId: result.matchedJobCardId ?? null,
        reasonText: result.reasonText ?? null,
      },
    });
  }

  const warnings: string[] = [];
  if (counts.ambiguous > 0) warnings.push(`${counts.ambiguous} row(s) had no confident Project/Category/Job Type match and were NOT imported — fix the source data or add the missing Master, then re-run this same file (it's safe to re-run: already-imported rows are skipped as duplicates).`);
  if (counts.skipped > 0) warnings.push(`${counts.skipped} row(s) were missing a required field (narration/property/location) and were skipped.`);
  if (counts.failed > 0) warnings.push(`${counts.failed} row(s) failed unexpectedly — see each row's reasonText.`);
  if (rows.length > 0 && counts.imported === 0 && counts.duplicate === 0) warnings.push('No rows were imported. Check that the CSV headers match the documented aliases (see MIGRATION_FMS.md).');

  await prisma.legacyImportBatch.update({
    where: { id: batch.id },
    data: { imported: counts.imported, skipped: counts.skipped, ambiguous: counts.ambiguous, duplicate: counts.duplicate, failed: counts.failed, warnings: JSON.stringify(warnings) },
  });

  return { batchId: batch.id, ...counts, warnings, rows: results };
}
