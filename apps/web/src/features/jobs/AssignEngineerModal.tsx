import { useQuery } from '@tanstack/react-query';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { Badge } from '../../ui/Badge';

interface EngineerWorkload {
  id: string;
  name: string;
  activeJobs: number;
}

/**
 * Lets the Process Coordinator / Project Head pick an engineer with visibility into their
 * current active-job count (§27, §44 "show engineer active workload during assignment" — so
 * assignment doesn't quietly overload one engineer). Backed by the existing
 * GET /users/engineers/workload endpoint that already existed but had no UI consumer.
 */
export function AssignEngineerModal({
  open,
  onClose,
  onAssign,
  assigning,
}: {
  open: boolean;
  onClose: () => void;
  onAssign: (userId: string) => void;
  assigning: boolean;
}) {
  const { data: engineers, isLoading } = useQuery({
    queryKey: queryKeys.engineers(),
    queryFn: async () => (await apiClient.get<EngineerWorkload[]>('/users/engineers/workload')).data,
    enabled: open,
  });

  return (
    <Modal open={open} onClose={onClose} title="Assign Engineer">
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading engineers…</p>
      ) : !engineers || engineers.length === 0 ? (
        <p className="text-sm text-content-muted dark:text-content-dark-muted">No engineers available for this project.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {engineers.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-md border border-border p-2 dark:border-border-dark">
              <div>
                <p className="font-medium text-content dark:text-content-dark">{e.name}</p>
                <Badge tone={e.activeJobs >= 6 ? 'warning' : 'neutral'}>{e.activeJobs} active jobs</Badge>
              </div>
              <Button size="sm" loading={assigning} onClick={() => onAssign(e.id)}>
                Assign
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
