import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { useDeleteUser, useUpdateUser, type UserRow } from './api';
import type { NormalizedApiError } from '../../lib/apiClient';

export function DeleteUserModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: UserRow | null }) {
  const { push } = useToast();
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const close = () => {
    setConflictMessage(null);
    onClose();
  };

  if (!user) return null;

  const onDelete = async () => {
    try {
      await deleteUser.mutateAsync(user.id);
      push(`${user.name} deleted.`, 'success');
      close();
    } catch (err) {
      const apiErr = err as NormalizedApiError;
      if (apiErr.status === 409) {
        setConflictMessage(apiErr.message);
      } else {
        push(apiErr.message ?? 'Failed to delete user', 'error');
      }
    }
  };

  const onDeactivateInstead = async () => {
    try {
      await updateUser.mutateAsync({ id: user.id, active: false });
      push(`${user.name} deactivated.`, 'success');
      close();
    } catch (err) {
      push((err as { message?: string })?.message ?? 'Failed to deactivate user', 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Delete ${user.name}?`}
      footer={
        conflictMessage ? (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={onDeactivateInstead} loading={updateUser.isPending}>
              Deactivate Instead
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onDelete} loading={deleteUser.isPending}>
              Delete Permanently
            </Button>
          </>
        )
      }
    >
      {conflictMessage ? (
        <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p>{conflictMessage}</p>
        </div>
      ) : (
        <p>
          This permanently removes {user.name}&apos;s account and cannot be undone. If they've ever created a Job Card, commented, uploaded evidence, or
          taken any other action, this will be blocked — deactivate them instead to preserve that history.
        </p>
      )}
    </Modal>
  );
}
