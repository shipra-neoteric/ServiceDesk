import { z } from 'zod';

export const ROLE_KEYS = [
  'SERVICE_ENGINEER',
  'PROJECT_HEAD',
  'PROCESS_COORDINATOR',
  'SERVICE_HEAD',
  'MASTER_ADMIN',
  'REQUESTER',
] as const;
export const RoleKeySchema = z.enum(ROLE_KEYS);
export type RoleKey = z.infer<typeof RoleKeySchema>;

export const PERMISSION_KEYS = [
  'job.create',
  'job.view',
  'job.view_all_projects',
  'job.edit',
  'job.assign',
  'job.reassign',
  'job.change_priority',
  'job.hold',
  'job.resume',
  'job.complete',
  'job.verify',
  'job.close',
  'job.reopen',
  'job.cancel',
  'material.create',
  'material.update',
  'approval.request',
  'approval.decide',
  'report.view',
  'report.export',
  'master.view',
  'master.create',
  'master.edit',
  'master.delete',
  'user.view',
  'user.create',
  'user.edit',
  'user.deactivate',
  'audit.view',
] as const;
export const PermissionKeySchema = z.enum(PERMISSION_KEYS);
export type PermissionKey = z.infer<typeof PermissionKeySchema>;

export const ACCESS_LEVELS = ['FULL', 'READ_ONLY'] as const;
export const AccessLevelSchema = z.enum(ACCESS_LEVELS);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;
