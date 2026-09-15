import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, notFound } from '../../lib/httpError.js';
import { mapCsvRow, runLegacyImportBatch } from './mapping.js';

export const legacyImportRouter = Router();
legacyImportRouter.use(requireAuth, requirePermission('master.create'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

legacyImportRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No CSV file uploaded');

    let records: string[][];
    try {
      records = parse(req.file.buffer, { skip_empty_lines: true, trim: true });
    } catch (err) {
      throw badRequest(`Could not parse CSV: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    if (records.length < 2) throw badRequest('CSV must have a header row plus at least one data row');

    const [headers, ...dataRows] = records;
    const rows = dataRows.map((values) => mapCsvRow(headers, values));

    const report = await runLegacyImportBatch(req.access!, req.file.originalname, rows);
    res.status(201).json(report);
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
