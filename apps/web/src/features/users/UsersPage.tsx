import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { PageHeader } from '../../ui/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Badge } from '../../ui/Badge';

interface UserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roles: { id: string; key: string; name: string }[];
  projectAccess: { projectId: string; projectName: string; accessLevel: string }[];
}

export function UsersPage() {
  const { data, isLoading } = useQuery({ queryKey: queryKeys.users(), queryFn: async () => (await apiClient.get<UserRow[]>('/users')).data });

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Name', render: (u) => <span className="font-medium text-content dark:text-content-dark">{u.name}</span> },
    { key: 'email', header: 'Email', render: (u) => u.email },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r.id}>{r.name}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'projects',
      header: 'Project Access',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.projectAccess.map((p) => (
            <Badge key={p.projectId} tone={p.accessLevel === 'FULL' ? 'success' : 'neutral'}>
              {p.projectName}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'active', header: 'Status', render: (u) => <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Users" description="Roles and project access for every ServiceDesk user." />
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} emptyTitle="No users yet" emptyReason="Users are seeded by Master Admin." />
    </div>
  );
}
