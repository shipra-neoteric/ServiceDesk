import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, conflict, notFound } from '../../lib/httpError.js';
import { mapCsvRow, findHeaderRowIndex, createLegacyImportBatch, processLegacyImportBatch, resolveAmbiguousProjectRows } from './mapping.js';

export const legacyImportRouter = Router();
legacyImportRouter.use(requireAuth, requirePermission('master.create'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

legacyImportRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No CSV file uploaded');

    // Two batches processing the same (or overlapping) legacy rows at once is what actually
    // caused duplicate Job Cards in production: the DUPLICATE check and the create aren't atomic
    // (findFirst-by-legacyRef, then create), so two concurrent runs can both pass the check for
    // the same row before either has written it. Serializing imports closes that race, and also
    // avoids doubling up write-conflict contention on the shared Counter document.
    const inFlight = await prisma.legacyImportBatch.findFirst({ where: { status: 'PROCESSING' } });
    if (inFlight) {
      throw conflict(`Another import ("${inFlight.sourceSheet}") is still processing. Wait for it to finish before starting a new one — check Import History for progress.`);
    }

    let records: string[][];
    try {
      records = parse(req.file.buffer, { skip_empty_lines: true, trim: true });
    } catch (err) {
      throw badRequest(`Could not parse CSV: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    if (records.length < 2) throw badRequest('CSV must have a header row plus at least one data row');

    const headerRowIndex = findHeaderRowIndex(records);
    const headers = records[headerRowIndex];
    const dataRows = records.slice(headerRowIndex + 1);
    const rows = dataRows.map((values) => mapCsvRow(headers, values));

    // Thousands of rows against a hosted Mongo cluster can take far longer than any reasonable
    // HTTP timeout, so the batch is created and returned immediately, and processing continues
    // after the response is sent. The client polls GET /legacy-import/:id for the final counts.
    const batch = await createLegacyImportBatch(req.file.originalname, rows.length);
    const ctx = req.access!;
    processLegacyImportBatch(batch.id, ctx, rows).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`Legacy import batch ${batch.id} failed:`, err);
    });

    res.status(202).json(batch);
  }),
);

legacyImportRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const batches = await prisma.legacyImportBatch.findMany({ orderBy: { importedAt: 'desc' } });
    res.json(batches.map((b) => ({ ...b, warnings: b.warnings ? JSON.parse(b.warnings) : [] })));
  }),
);

legacyImportRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const batch = await prisma.legacyImportBatch.findUnique({ where: { id: req.params.id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
    if (!batch) throw notFound('Import batch not found');
    res.json({ ...batch, warnings: batch.warnings ? JSON.parse(batch.warnings) : [] });
  }),
);

// Resolves every AMBIGUOUS row in this batch whose Property text matched more than one active
// Project master (e.g. "School") to the single Project the user picks from the candidates shown
// for that row, and remembers the choice for the rest of the batch.
legacyImportRouter.post(
  '/:id/resolve-project',
  asyncHandler(async (req, res) => {
    const { rawText, projectId } = req.body ?? {};
    if (typeof rawText !== 'string' || !rawText.trim()) throw badRequest('rawText is required');
    if (typeof projectId !== 'string' || !projectId.trim()) throw badRequest('projectId is required');

    const batch = await prisma.legacyImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) throw notFound('Import batch not found');

    const report = await resolveAmbiguousProjectRows(req.params.id, req.access!, rawText, projectId);
    res.json(report);
  }),
);
