import { useState } from 'react';
import { Dices } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { useToast } from '../../ui/Toast';
import { useResetUserPassword, type UserRow } from './api';

function generatePassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12);
}

export function ResetPasswordModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: UserRow | null }) {
  const { push } = useToast();
  const resetPassword = useResetUserPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const onSubmit = async () => {
    if (!user) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      push(`Password reset for ${user.name}.`, 'success');
      close();
    } catch (err) {
      push((err as { message?: string })?.message ?? 'Failed to reset password', 'error');
    }
  };

  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Reset password — ${user.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={resetPassword.isPending}>
            Set New Password
          </Button>
        </>
      }
    >
      <p className="mb-3 text-content-muted dark:text-content-dark-muted">
        This immediately replaces {user.name}&apos;s password. Share the new one with them directly — it is not emailed automatically.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="New Password"
            type="text"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            hint="At least 8 characters."
          />
        </div>
        <Button type="button" variant="secondary" size="md" onClick={() => setPassword(generatePassword())} title="Generate a random password">
          <Dices className="h-4 w-4" /> Generate
        </Button>
      </div>
    </Modal>
  );
}
