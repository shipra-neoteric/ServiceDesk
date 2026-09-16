import { useMemo, useState } from 'react';
import { Pencil, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '../../ui/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { KpiCard } from '../../ui/KpiCard';
import { Toolbar } from '../../ui/Toolbar';
import { PermissionGate } from '../../ui/PermissionGate';
import { useUsers, type UserRow } from './api';
import { UserFormDrawer } from './UserFormDrawer';
import { ResetPasswordModal } from './ResetPasswordModal';
import { DeleteUserModal } from './DeleteUserModal';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function UsersPage() {
  const { data, isLoading } = useUsers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [formUser, setFormUser] = useState<UserRow | null | undefined>(undefined); // undefined = closed, null = create, UserRow = edit
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const users = useMemo(() => data ?? [], [data]);
  const activeCount = users.filter((u) => u.active).length;
  const inactiveCount = users.length - activeCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'ACTIVE' && !u.active) return false;
      if (statusFilter === 'INACTIVE' && u.active) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roles.some((r) => r.name.toLowerCase().includes(q));
    });
  }, [users, search, statusFilter]);

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
          {u.projectAccess.length === 0 ? (
            <span className="text-xs text-content-muted dark:text-content-dark-muted">—</span>
          ) : (
            u.projectAccess.map((p) => (
              <Badge key={p.projectId} tone={p.accessLevel === 'FULL' ? 'success' : 'neutral'}>
                {p.projectName}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    { key: 'active', header: 'Status', render: (u) => <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'px-4 py-3 text-right',
      render: (u) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permissions={['user.edit']}>
            <IconButton label={`Edit ${u.name}`} size="sm" onClick={() => setFormUser(u)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          </PermissionGate>
          <PermissionGate permissions={['user.reset_password']}>
            <IconButton label={`Reset password for ${u.name}`} size="sm" onClick={() => setPasswordUser(u)}>
              <KeyRound className="h-3.5 w-3.5" />
            </IconButton>
          </PermissionGate>
          <PermissionGate permissions={['user.delete']}>
            <IconButton label={`Delete ${u.name}`} size="sm" onClick={() => setDeleteUser(u)}>
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </IconButton>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Users"
        description="Create, edit, deactivate, and manage roles and project access for every ServiceDesk user."
        action={
          <PermissionGate permissions={['user.create']}>
            <Button onClick={() => setFormUser(null)}>
              <UserPlus className="h-4 w-4" /> Add User
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total Users" value={users.length} onClick={() => setStatusFilter('ALL')} />
        <KpiCard label="Active" value={activeCount} accent="success" onClick={() => setStatusFilter('ACTIVE')} />
        <KpiCard label="Inactive" value={inactiveCount} accent="danger" onClick={() => setStatusFilter('INACTIVE')} />
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or role…"
        activeFilterCount={statusFilter === 'ALL' ? 0 : 1}
        onClearFilters={() => setStatusFilter('ALL')}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        loading={isLoading}
        emptyTitle="No users found"
        emptyReason={search || statusFilter !== 'ALL' ? 'Try adjusting your search or filters.' : 'Add your first user to get started.'}
      />

      <UserFormDrawer open={formUser !== undefined} onClose={() => setFormUser(undefined)} user={formUser ?? null} />
      <ResetPasswordModal open={!!passwordUser} onClose={() => setPasswordUser(null)} user={passwordUser} />
      <DeleteUserModal open={!!deleteUser} onClose={() => setDeleteUser(null)} user={deleteUser} />
    </div>
  );
}
