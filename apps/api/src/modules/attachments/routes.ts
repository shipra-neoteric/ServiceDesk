import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { badRequest, notFound } from '../../lib/httpError.js';
import { canViewProject } from '../../lib/accessContext.js';

export const attachmentsRouter = Router({ mergeParams: true });
attachmentsRouter.use(requireAuth);

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']);
const MAX_SIZE = 25 * 1024 * 1024; // 25MB — §44 "very large attachment"

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  },
});

attachmentsRouter.post(
  '/:jobId/attachments',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const job = await prisma.jobCard.findUnique({ where: { id: req.params.jobId } });
    if (!job) throw notFound('Job Card not found');
    if (!canViewProject(req.access!, job.projectId)) throw notFound('Job Card not found');
    if (!req.file) throw badRequest('No file uploaded');

    const parsed = z
      .object({ phase: z.enum(['BEFORE', 'DURING', 'AFTER']).optional(), caption: z.string().optional(), stageKey: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid attachment metadata', parsed.error.flatten());

    const type = req.file.mimetype.startsWith('video') ? 'VIDEO' : req.file.mimetype === 'application/pdf' ? 'DOC' : 'PHOTO';
    const attachment = await prisma.attachment.create({
      data: {
        jobCardId: job.id,
        type,
        phase: parsed.data.phase ?? null,
        stageKey: parsed.data.stageKey ?? null,
        caption: parsed.data.caption ?? null,
        fileName: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        uploadedById: req.access!.userId,
      },
    });
    res.status(201).json(attachment);
  }),
);

// Multer errors (oversized/unsupported) surface as generic Error, not HttpError — normalize.
attachmentsRouter.use((err: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (err instanceof multer.MulterError || (err instanceof Error && err.message === 'Unsupported file type')) {
    return res.status(400).json({ error: { message: err.message } });
  }
  next(err);
});
