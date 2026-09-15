import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Download, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '../../ui/Card';
import { StatusBadge } from '../../ui/StatusBadge';
import { Button } from '../../ui/Button';
import { PermissionGate } from '../../ui/PermissionGate';
import { useToast } from '../../ui/Toast';
import { formatDateTime } from '../../lib/format';
import { apiClient } from '../../lib/apiClient';
import {
  useJobDetail,
  useSiteVisitStart,
  useSiteVisitComplete,
  useRequestMaterial,
  useReadyToStart,
  useStartJob,
  useCompleteJob,
  useVerifyJob,
  useCloseJob,
  useReopenJob,
  useHoldJob,
  useResumeJob,
  useAddComment,
  useUploadAttachment,
} from './api';
import { EmptyState } from '../../ui/EmptyState';

const TABS = ['Overview', 'Workflow', 'Materials', 'Approvals', 'Evidence', 'Communication', 'History'] as const;
type Tab = (typeof TABS)[number];

const STAGE_ICON = { DONE: CheckCircle2, ACTIVE: Clock, BLOCKED: PauseCircle, PENDING: Circle, SKIPPED: XCircle };
const STAGE_COLOR = { DONE: 'text-success', ACTIVE: 'text-warning', BLOCKED: 'text-danger', PENDING: 'text-content-muted dark:text-content-dark-muted', SKIPPED: 'text-content-muted' };

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useJobDetail(id);
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('Overview');

  const siteVisitStart = useSiteVisitStart(id!);
  const siteVisitComplete = useSiteVisitComplete(id!);
  const requestMaterial = useRequestMaterial(id!);
  const readyToStart = useReadyToStart(id!);
  const startJob = useStartJob(id!);
  const completeJob = useCompleteJob(id!);
  const verifyJob = useVerifyJob(id!);
  const closeJob = useCloseJob(id!);
  const reopenJob = useReopenJob(id!);
  const holdJob = useHoldJob(id!);
  const resumeJob = useResumeJob(id!);
  const addComment = useAddComment(id!);
  const uploadAttachment = useUploadAttachment(id!);

  const [commentBody, setCommentBody] = useState('');
  const [materialForm, setMaterialForm] = useState({ item: '', quantity: '1', unit: 'pcs' });
  const [visitNotes, setVisitNotes] = useState('');

  if (isLoading) return <p className="text-sm text-content-muted">Loading Job Card…</p>;
  if (!job) return <EmptyState title="Job Card not found" reason="It may not exist, or you may not have access to its project." />;

  const run = async (fn: () => Promise<unknown>, successMsg: string) => {
    try {
      await fn();
      push(successMsg, 'success');
    } catch (err) {
      push((err as { message?: string })?.message ?? 'Action failed', 'error');
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await apiClient.get(`/jobs/${job.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      push('Failed to generate PDF', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-content dark:text-content-dark">{job.jobNumber}</h1>
              <StatusBadge status={job.status} />
              {job.isEmergency && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">EMERGENCY</span>}
            </div>
            <p className="mt-1 text-sm text-content-muted dark:text-content-dark-muted">
              {job.project.name} — {job.locationText} · {job.category.name}
              {job.subcategory ? ` / ${job.subcategory.name}` : ''} · {job.priority.name}
            </p>
          </div>
          <button onClick={downloadPdf} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Download className="h-4 w-4" /> Job Card PDF
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Current Owner" value={job.currentOwnerRole ?? '—'} />
          <Field label="Next Action" value={job.nextAction ?? '—'} />
          <Field label="Next Action Due" value={formatDateTime(job.nextActionDueAt)} />
          <Field label="Target Completion" value={formatDateTime(job.targetCompletionAt)} />
          <Field label="Created" value={formatDateTime(job.createdAt)} />
          <Field label="Closed" value={formatDateTime(job.closedAt)} />
          <Field label="Reopen Count" value={String(job.reopenCount)} />
          <Field label="Delay Responsibility" value={job.delayResponsibility.replace(/_/g, ' ')} />
        </div>
      </Card>

      {/* Stage tracker (§11) */}
      <Card header={<h2 className="text-base font-semibold text-content dark:text-content-dark">Workflow Stages</h2>}>
        <div className="flex flex-wrap gap-4">
          {job.stages.map((stage) => {
            const Icon = STAGE_ICON[stage.status];
            return (
              <div key={stage.id} className="flex min-w-[140px] flex-col items-center gap-1 text-center">
                <Icon className={clsx('h-6 w-6', STAGE_COLOR[stage.status])} aria-hidden />
                <span className="text-xs font-medium text-content dark:text-content-dark">{stage.name}</span>
                <span className="text-[11px] text-content-muted dark:text-content-dark-muted">
                  {stage.actualCompletedAt ? `Done ${formatDateTime(stage.actualCompletedAt)}` : stage.plannedDueAt ? `Due ${formatDateTime(stage.plannedDueAt)}` : stage.status}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Action panel */}
      <Card header={<h2 className="text-base font-semibold text-content dark:text-content-dark">Actions</h2>}>
        <div className="flex flex-wrap gap-2">
          {job.status === 'ASSIGNED' && (
            <PermissionGate permissions={['job.edit']}>
              <Button size="sm" onClick={() => run(() => siteVisitStart.mutateAsync(undefined), 'Site visit started')}>
                <PlayCircle className="h-4 w-4" /> Start Site Visit
              </Button>
            </PermissionGate>
          )}
          {job.status === 'SITE_VISIT_PENDING' && (
            <PermissionGate permissions={['job.edit']}>
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  placeholder="Site visit notes…"
                  className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
                />
                <Button
                  size="sm"
                  onClick={() => run(() => siteVisitComplete.mutateAsync({ notes: visitNotes || 'Site visit completed.' }), 'Site visit completed')}
                >
                  Complete Site Visit
                </Button>
              </div>
            </PermissionGate>
          )}
          {['WAITING_MATERIAL', 'WAITING_APPROVAL', 'SITE_VISIT_COMPLETED'].includes(job.status) && (
            <PermissionGate permissions={['job.edit']}>
              <Button size="sm" variant="secondary" onClick={() => run(() => readyToStart.mutateAsync(undefined), 'Marked ready to start')}>
                Ready to Start
              </Button>
            </PermissionGate>
          )}
          {['READY_TO_START', 'ASSIGNED', 'SITE_VISIT_COMPLETED'].includes(job.status) && (
            <PermissionGate permissions={['job.edit']}>
              <Button size="sm" onClick={() => run(() => startJob.mutateAsync(undefined), 'Work started')}>
                <PlayCircle className="h-4 w-4" /> Start Work
              </Button>
            </PermissionGate>
          )}
          {['IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(job.status) && (
            <PermissionGate permissions={['job.complete']}>
              <Button size="sm" onClick={() => run(() => completeJob.mutateAsync({ completionNotes: 'Work completed.' }), 'Marked completed')}>
                Mark Work Completed
              </Button>
            </PermissionGate>
          )}
          {job.status === 'WORK_COMPLETED' && (
            <PermissionGate permissions={['job.verify']}>
              <Button size="sm" onClick={() => run(() => verifyJob.mutateAsync({ decision: 'VERIFIED' }), 'Verified and closed')}>
                Verify &amp; Close
              </Button>
              <Button size="sm" variant="secondary" onClick={() => run(() => verifyJob.mutateAsync({ decision: 'REWORK_REQUIRED' }), 'Sent back for rework')}>
                Request Rework
              </Button>
            </PermissionGate>
          )}
          {(job.status === 'CLOSED' || job.status === 'CLOSED_NOT_FEASIBLE') && (
            <PermissionGate permissions={['job.reopen']}>
              <Button size="sm" variant="secondary" onClick={() => run(() => reopenJob.mutateAsync({ reason: 'Issue recurred.' }), 'Job reopened')}>
                Reopen
              </Button>
            </PermissionGate>
          )}
          {job.status === 'ON_HOLD' ? (
            <PermissionGate permissions={['job.resume']}>
              <Button size="sm" onClick={() => run(() => resumeJob.mutateAsync(undefined), 'Resumed')}>
                Resume
              </Button>
            </PermissionGate>
          ) : (
            !['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'].includes(job.status) && (
              <PermissionGate permissions={['job.hold']}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run(
                      () =>
                        holdJob.mutateAsync({
                          reasonCode: 'TECHNICAL_CONSTRAINT',
                          dependencyOwnerRole: 'PROJECT_HEAD',
                          reviewDueAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
                          comment: 'Placed on hold.',
                          slaPauses: true,
                        }),
                      'Job placed on hold',
                    )
                  }
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </Button>
              </PermissionGate>
            )
          )}
          {job.status !== 'WORK_COMPLETED' && ['WORK_COMPLETED', 'VERIFICATION_PENDING'].includes(job.status) && (
            <PermissionGate permissions={['job.close']}>
              <Button size="sm" onClick={() => run(() => closeJob.mutateAsync({ closureReasonCode: 'COMPLETED' }), 'Closed')}>
                Close
              </Button>
            </PermissionGate>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border dark:border-border-dark">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-content-muted hover:text-content dark:text-content-dark-muted',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <Card>
          <p className="text-sm font-semibold text-content dark:text-content-dark">Requester</p>
          <p className="mb-3 text-sm text-content-muted dark:text-content-dark-muted">
            {job.serviceRequest.requesterName} ({job.serviceRequest.requestNumber})
          </p>
          <p className="text-sm font-semibold text-content dark:text-content-dark">Narration</p>
          <p className="text-sm text-content-muted dark:text-content-dark-muted">{job.serviceRequest.narration}</p>
        </Card>
      )}

      {tab === 'Workflow' && (
        <Card>
          {job.siteVisits.length === 0 ? (
            <EmptyState title="No site visits yet" reason="Once an engineer starts a site visit it will appear here." />
          ) : (
            <ul className="flex flex-col gap-3">
              {job.siteVisits.map((v) => (
                <li key={v.id} className="rounded-md border border-border p-3 text-sm dark:border-border-dark">
                  <p className="font-medium text-content dark:text-content-dark">{v.engineer.name}</p>
                  <p className="text-content-muted dark:text-content-dark-muted">
                    {formatDateTime(v.startedAt)} → {v.completedAt ? formatDateTime(v.completedAt) : 'in progress'}
                  </p>
                  {v.notes && <p className="mt-1">{v.notes}</p>}
                  {v.diagnosis && <p className="mt-1 text-content-muted dark:text-content-dark-muted">Diagnosis: {v.diagnosis}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Materials' && (
        <Card>
          <PermissionGate permissions={['material.create']}>
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <input
                value={materialForm.item}
                onChange={(e) => setMaterialForm((f) => ({ ...f, item: e.target.value }))}
                placeholder="Item"
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
              />
              <input
                type="number"
                min={1}
                value={materialForm.quantity}
                onChange={(e) => setMaterialForm((f) => ({ ...f, quantity: e.target.value }))}
                className="h-9 w-20 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
              />
              <input
                value={materialForm.unit}
                onChange={(e) => setMaterialForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="Unit"
                className="h-9 w-20 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
              />
              <Button
                size="sm"
                disabled={!materialForm.item}
                onClick={() =>
                  run(
                    () => requestMaterial.mutateAsync({ item: materialForm.item, quantity: Number(materialForm.quantity), unit: materialForm.unit }),
                    'Material requirement added',
                  ).then(() => setMaterialForm({ item: '', quantity: '1', unit: 'pcs' }))
                }
              >
                Add Requirement
              </Button>
            </div>
          </PermissionGate>
          {job.materials.length === 0 ? (
            <EmptyState title="No materials required" reason="This job has no material dependency." />
          ) : (
            <ul className="flex flex-col gap-2">
              {job.materials.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm dark:border-border-dark">
                  <span>
                    {m.item} — {m.quantity} {m.unit}
                  </span>
                  <span className="font-medium text-content dark:text-content-dark">{m.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Approvals' && (
        <Card>
          {job.approvals.length === 0 ? (
            <EmptyState title="No approvals requested" reason="This job has no approval dependency." />
          ) : (
            <ul className="flex flex-col gap-2">
              {job.approvals.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm dark:border-border-dark">
                  <span>
                    {a.type} — approver {a.approver.name}
                    {a.amount ? ` — ₹${a.amount.toLocaleString('en-IN')}` : ''}
                  </span>
                  <span className="font-medium text-content dark:text-content-dark">{a.decision}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Evidence' && (
        <Card>
          <PermissionGate permissions={['job.edit', 'job.complete']}>
            <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm dark:border-border-dark">
              Upload photo (AFTER)
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) run(() => uploadAttachment.mutateAsync({ file, phase: 'AFTER' }), 'Attachment uploaded');
                  e.target.value = '';
                }}
              />
            </label>
          </PermissionGate>
          {job.attachments.length === 0 ? (
            <EmptyState title="No evidence uploaded yet" reason="Photos/videos from site visits and completion will appear here." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {job.attachments.map((a) => (
                <a key={a.id} href={`${import.meta.env.VITE_API_BASE_URL}${a.path}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-border dark:border-border-dark">
                  {a.type === 'PHOTO' ? (
                    <img src={`${import.meta.env.VITE_API_BASE_URL}${a.path}`} alt={a.caption ?? a.phase ?? 'attachment'} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center text-xs">{a.type}</div>
                  )}
                  <p className="p-1 text-[11px] text-content-muted dark:text-content-dark-muted">{a.phase ?? ''}</p>
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'Communication' && (
        <Card>
          <div className="mb-4 flex gap-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment…"
              className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm dark:border-border-dark dark:bg-surface-dark"
            />
            <Button
              size="sm"
              disabled={!commentBody.trim()}
              onClick={() => run(() => addComment.mutateAsync({ body: commentBody }), 'Comment added').then(() => setCommentBody(''))}
            >
              Post
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {job.comments.map((c) => (
              <li key={c.id} className={clsx('rounded-md border p-2 text-sm dark:border-border-dark', c.isSystem ? 'border-border bg-surface-muted dark:bg-surface-dark-muted' : 'border-border')}>
                <p className="text-xs text-content-muted dark:text-content-dark-muted">
                  {c.author.name} · {formatDateTime(c.createdAt)}
                </p>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'History' && (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {job.reopenEvents.map((r) => (
              <li key={r.id} className="text-content-muted dark:text-content-dark-muted">
                {formatDateTime(r.reopenedAt)} — Reopened: {r.reason}
              </li>
            ))}
            {job.verifications.map((v) => (
              <li key={v.id} className="text-content-muted dark:text-content-dark-muted">
                {formatDateTime(v.verifiedAt)} — Verification: {v.decision} by {v.verifiedBy.name}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-content-muted dark:text-content-dark-muted">{label}</p>
      <p className="font-medium text-content dark:text-content-dark">{value}</p>
    </div>
  );
}
