import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { AccessLevel } from '@servicedesk/shared';
import { Drawer } from '../../ui/Drawer';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { useToast } from '../../ui/Toast';
import { useProjects } from '../masters/api';
import { useCreateUser, useUpdateUser, useRoleOptions, type ProjectAccessInput, type UserRow } from './api';

interface FormValues {
  name: string;
  email: string;
  password: string;
  phone: string;
  employeeId: string;
  department: string;
  designation: string;
  active: boolean;
}

export function UserFormDrawer({ open, onClose, user }: { open: boolean; onClose: () => void; user: UserRow | null }) {
  const isEdit = !!user;
  const { push } = useToast();
  const { data: projects } = useProjects();
  const { data: roleOptions } = useRoleOptions();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [projectAccess, setProjectAccess] = useState<Record<string, AccessLevel | undefined>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { active: true } });

  useEffect(() => {
    if (!open) return;
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        password: '',
        phone: user.phone ?? '',
        employeeId: user.employeeId ?? '',
        department: user.department ?? '',
        designation: user.designation ?? '',
        active: user.active,
      });
      setSelectedRoleIds(user.roles.map((r) => r.id));
      setProjectAccess(Object.fromEntries(user.projectAccess.map((pa) => [pa.projectId, pa.accessLevel])));
    } else {
      reset({ name: '', email: '', password: '', phone: '', employeeId: '', department: '', designation: '', active: true });
      setSelectedRoleIds([]);
      setProjectAccess({});
    }
  }, [open, user, reset]);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  };

  const toggleProject = (projectId: string) => {
    setProjectAccess((prev) => {
      const next = { ...prev };
      if (next[projectId]) delete next[projectId];
      else next[projectId] = 'FULL';
      return next;
    });
  };

  const setProjectLevel = (projectId: string, level: AccessLevel) => {
    setProjectAccess((prev) => ({ ...prev, [projectId]: level }));
  };

  const onSubmit = async (values: FormValues) => {
    const projectAccessInput: ProjectAccessInput[] = Object.entries(projectAccess)
      .filter((entry): entry is [string, AccessLevel] => !!entry[1])
      .map(([projectId, accessLevel]) => ({ projectId, accessLevel }));

    try {
      if (isEdit && user) {
        await updateUser.mutateAsync({
          id: user.id,
          name: values.name,
          phone: values.phone || null,
          employeeId: values.employeeId || null,
          department: values.department || null,
          designation: values.designation || null,
          active: values.active,
          roleIds: selectedRoleIds,
          projectAccess: projectAccessInput,
        });
        push(`${values.name} updated.`, 'success');
      } else {
        if (selectedRoleIds.length === 0) {
          push('Select at least one role.', 'error');
          return;
        }
        await createUser.mutateAsync({
          name: values.name,
          email: values.email,
          password: values.password,
          phone: values.phone || null,
          employeeId: values.employeeId || null,
          department: values.department || null,
          designation: values.designation || null,
          roleIds: selectedRoleIds,
          projectAccess: projectAccessInput,
        });
        push(`${values.name} created.`, 'success');
      }
      onClose();
    } catch (err) {
      push((err as { message?: string })?.message ?? 'Failed to save user', 'error');
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit User' : 'Add New User'}
      description={isEdit ? `Update ${user?.name}'s details, roles, and project access.` : 'Create a new ServiceDesk login.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button form="user-form" type="submit" loading={isSubmitting || createUser.isPending || updateUser.isPending}>
            {isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Full Name" required placeholder="e.g. Rahul Sharma" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
          <TextField
            label="Email Address"
            required
            type="email"
            placeholder="e.g. rahul@neotericgrp.in"
            disabled={isEdit}
            error={errors.email?.message}
            {...register('email', { required: 'Email is required' })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Mobile" placeholder="e.g. 9876543210" {...register('phone')} />
          <TextField label="Employee ID" {...register('employeeId')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Department" placeholder="e.g. Facilities" {...register('department')} />
          <TextField label="Designation" placeholder="e.g. Site Engineer" {...register('designation')} />
        </div>

        {!isEdit && (
          <TextField
            label="Password"
            required
            type="password"
            hint="At least 6 characters."
            error={errors.password?.message}
            {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'At least 6 characters' } })}
          />
        )}

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('active')} /> Account active (unchecking blocks login, but keeps their history)
          </label>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-content dark:text-content-dark">
            Role(s) <span className="text-danger">*</span>
          </legend>
          <div className="flex flex-wrap gap-3 rounded-md border border-border p-3 dark:border-border-dark">
            {roleOptions?.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedRoleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
                {role.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-content dark:text-content-dark">Project Access</legend>
          <p className="text-xs text-content-muted dark:text-content-dark-muted">
            Leave every project unchecked for a role like Process Coordinator or Service Head that already sees all projects (<code>job.view_all_projects</code>).
          </p>
          <div className="flex flex-col gap-2 rounded-md border border-border p-3 dark:border-border-dark">
            {projects?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!projectAccess[p.id]} onChange={() => toggleProject(p.id)} />
                  {p.name}
                </label>
                {projectAccess[p.id] && (
                  <select
                    aria-label={`${p.name} access level`}
                    value={projectAccess[p.id]}
                    onChange={(e) => setProjectLevel(p.id, e.target.value as AccessLevel)}
                    className="h-8 rounded-md border border-border bg-surface px-2 text-xs dark:border-border-dark dark:bg-surface-dark"
                  >
                    <option value="FULL">Full</option>
                    <option value="READ_ONLY">Read Only</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      </form>
    </Drawer>
  );
}
