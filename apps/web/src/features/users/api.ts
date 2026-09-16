import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import type { AccessLevel } from '@servicedesk/shared';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  employeeId: string | null;
  department: string | null;
  designation: string | null;
  active: boolean;
  roles: { id: string; key: string; name: string }[];
  projectAccess: { projectId: string; projectName: string; accessLevel: AccessLevel }[];
}

export interface RoleOption {
  id: string;
  key: string;
  name: string;
}

export interface ProjectAccessInput {
  projectId: string;
  accessLevel: AccessLevel;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  roleIds: string[];
  projectAccess: ProjectAccessInput[];
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  phone?: string | null;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  active?: boolean;
  roleIds?: string[];
  projectAccess?: ProjectAccessInput[];
}

export const useUsers = () => useQuery({ queryKey: queryKeys.users(), queryFn: async () => (await apiClient.get<UserRow[]>('/users')).data });

// Roles live under /masters (Master Admin's role/permission surface), but this feature only ever
// needs id/key/name to populate the role-assignment picker.
export const useRoleOptions = () =>
  useQuery({
    queryKey: ['masters', 'roles'],
    queryFn: async () => (await apiClient.get<RoleOption[]>('/masters/roles')).data,
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await apiClient.post<UserRow>('/users', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users() }),
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateUserInput) => (await apiClient.patch<UserRow>(`/users/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users() }),
  });
};

export const useResetUserPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => (await apiClient.patch(`/users/${id}/password`, { password })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users() }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/users/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users() }),
  });
};
