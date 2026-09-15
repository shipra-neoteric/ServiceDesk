import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { SelectField, TextField, TextareaField } from '../../ui/Field';
import { useReasonCodes } from '../masters/api';

const DEPENDENCY_OWNER_ROLES = ['SERVICE_ENGINEER', 'PROJECT_HEAD', 'PROCESS_COORDINATOR', 'SERVICE_HEAD'];

export function HoldJobModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { reasonCode: string; dependencyOwnerRole: string; reviewDueAt: string; comment: string; slaPauses: boolean }) => void;
  submitting: boolean;
}) {
  const { data: reasons } = useReasonCodes('HOLD');
  const [reasonCode, setReasonCode] = useState('');
  const [dependencyOwnerRole, setDependencyOwnerRole] = useState('PROJECT_HEAD');
  const [reviewInDays, setReviewInDays] = useState('2');
  const [comment, setComment] = useState('');
  const [slaPauses, setSlaPauses] = useState(true);

  const activeReasons = (reasons ?? []).filter((r) => r.active);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Place Job Card on Hold"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            loading={submitting}
            disabled={!reasonCode || !comment.trim()}
            onClick={() =>
              onSubmit({
                reasonCode,
                dependencyOwnerRole,
                reviewDueAt: new Date(Date.now() + Number(reviewInDays) * 86_400_000).toISOString(),
                comment,
                slaPauses,
              })
            }
          >
            Place on Hold
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField label="Hold Reason" required value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          <option value="">Select a reason…</option>
          {activeReasons.map((r) => (
            <option key={r.id} value={r.code}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Dependency Owner" required value={dependencyOwnerRole} onChange={(e) => setDependencyOwnerRole(e.target.value)}>
          {DEPENDENCY_OWNER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Review in (days)"
          type="number"
          min={1}
          required
          value={reviewInDays}
          onChange={(e) => setReviewInDays(e.target.value)}
          hint="The Process Coordinator's attention queue flags this hold once the review date passes with no resume."
        />
        <TextareaField label="Comment" required value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What's blocking this job?" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={slaPauses} onChange={(e) => setSlaPauses(e.target.checked)} />
          Pause SLA clock while on hold
        </label>
      </div>
    </Modal>
  );
}
