import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { fullJobInclude } from '../modules/jobs/service.js';

type JobWithRelations = Prisma.JobCardGetPayload<{ include: typeof fullJobInclude }>;

/** Renders the Job Card PDF described in §34 directly to the HTTP response stream. */
export function streamJobCardPdf(res: Response, job: JobWithRelations) {
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${job.jobNumber}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`Job Card ${job.jobNumber}`, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#555').text(`Generated ${new Date().toLocaleString('en-IN')}`);
  doc.moveDown();

  const kv = (label: string, value: string | null | undefined) => {
    doc.fontSize(10).fillColor('#111').text(`${label}: `, { continued: true }).fillColor('#333').text(value ?? '-');
  };

  doc.fontSize(13).fillColor('#111').text('Overview');
  kv('Project', job.project.name);
  kv('Location', job.locationText);
  kv('Category', job.category.name + (job.subcategory ? ` / ${job.subcategory.name}` : ''));
  kv('Priority', job.priority.name);
  kv('Status', job.status);
  kv('Created', job.createdAt.toLocaleString('en-IN'));
  kv('Target completion', job.targetCompletionAt?.toLocaleString('en-IN') ?? 'Not set');
  kv('Closed', job.closedAt?.toLocaleString('en-IN') ?? 'Not closed');
  doc.moveDown();

  doc.fontSize(13).text('Request');
  kv('Requester', job.serviceRequest.requesterName);
  kv('Narration', job.serviceRequest.narration);
  doc.moveDown();

  doc.fontSize(13).text('Workflow');
  for (const stage of job.stages) {
    kv(
      `Stage: ${stage.name}`,
      `${stage.status}${stage.actualCompletedAt ? ` (done ${stage.actualCompletedAt.toLocaleDateString('en-IN')})` : ''}${
        stage.plannedDueAt ? ` — planned by ${stage.plannedDueAt.toLocaleDateString('en-IN')}` : ''
      }`,
    );
  }
  doc.moveDown();

  if (job.materials.length > 0) {
    doc.fontSize(13).text('Materials');
    for (const m of job.materials) kv(m.item, `${m.quantity} ${m.unit} — ${m.status}`);
    doc.moveDown();
  }

  if (job.approvals.length > 0) {
    doc.fontSize(13).text('Approvals');
    for (const a of job.approvals) kv(a.type, `${a.decision} (approver: ${a.approver.name})`);
    doc.moveDown();
  }

  if (job.verifications.length > 0) {
    doc.fontSize(13).text('Verification');
    for (const v of job.verifications) kv(v.verifiedBy.name, `${v.decision} — ${v.comments ?? ''}`);
    doc.moveDown();
  }

  doc.fontSize(13).text('Audit summary');
  kv('Reopen count', String(job.reopenCount));
  kv('Source', job.source);

  doc.end();
}
