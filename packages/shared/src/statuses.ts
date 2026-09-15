import { z } from 'zod';

export const JOB_STATUSES = [
  'DRAFT',
  'RAISED',
  'UNDER_TRIAGE',
  'ASSIGNED',
  'SITE_VISIT_PENDING',
  'SITE_VISIT_COMPLETED',
  'DIAGNOSIS_PENDING',
  'SCOPE_PENDING',
  'WAITING_MATERIAL',
  'WAITING_APPROVAL',
  'READY_TO_START',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'WORK_COMPLETED',
  'VERIFICATION_PENDING',
  'CLOSED',
  'REOPENED',
  'ON_HOLD',
  'CANCELLED',
  'CLOSED_NOT_FEASIBLE',
  'CLOSED_DUPLICATE',
  'CLOSED_NO_ACTION',
] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TERMINAL_STATUSES: JobStatus[] = [
  'CLOSED',
  'CLOSED_NOT_FEASIBLE',
  'CLOSED_DUPLICATE',
  'CLOSED_NO_ACTION',
  'CANCELLED',
];

export const isOpenStatus = (status: JobStatus) => !TERMINAL_STATUSES.includes(status);

export const JOB_STAGE_STATUSES = ['PENDING', 'ACTIVE', 'DONE', 'SKIPPED', 'BLOCKED'] as const;
export const JobStageStatusSchema = z.enum(JOB_STAGE_STATUSES);
export type JobStageStatus = z.infer<typeof JobStageStatusSchema>;

export const MATERIAL_STATUSES = [
  'NOT_REQUIRED',
  'REQUIREMENT_RAISED',
  'AVAILABILITY_CHECKING',
  'AVAILABLE',
  'PARTIALLY_AVAILABLE',
  'NOT_AVAILABLE',
  'RESERVED',
  'ISSUED',
  'RECEIVED',
  'CANCELLED',
] as const;
export const MaterialStatusSchema = z.enum(MATERIAL_STATUSES);
export type MaterialStatus = z.infer<typeof MaterialStatusSchema>;

export const APPROVAL_DECISIONS = ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'] as const;
export const ApprovalDecisionSchema = z.enum(APPROVAL_DECISIONS);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const VERIFICATION_DECISIONS = ['VERIFIED', 'REJECTED', 'REWORK_REQUIRED', 'PARTIALLY_ACCEPTED'] as const;
export const VerificationDecisionSchema = z.enum(VERIFICATION_DECISIONS);
export type VerificationDecision = z.infer<typeof VerificationDecisionSchema>;

export const HOLD_REASONS = [
  'WAITING_MATERIAL',
  'WAITING_APPROVAL',
  'WAITING_REQUESTER',
  'SITE_ACCESS_ISSUE',
  'SAFETY_RESTRICTION',
  'EXTERNAL_VENDOR',
  'TECHNICAL_CONSTRAINT',
  'MANAGEMENT_HOLD',
  'WEATHER',
  'DEPENDENCY_ON_OTHER_WORK',
] as const;
export const HoldReasonSchema = z.enum(HOLD_REASONS);
export type HoldReason = z.infer<typeof HoldReasonSchema>;

export const CLOSURE_REASONS = ['COMPLETED', 'NOT_FEASIBLE', 'DUPLICATE', 'NO_ACTION_REQUIRED'] as const;
export const ClosureReasonSchema = z.enum(CLOSURE_REASONS);

export const DELAY_RESPONSIBILITY = [
  'ENGINEER_DELAY',
  'APPROVAL_DELAY',
  'MATERIAL_DELAY',
  'REQUESTER_DELAY',
  'VENDOR_DELAY',
  'MANAGEMENT_HOLD',
  'NONE',
] as const;
export const DelayResponsibilitySchema = z.enum(DELAY_RESPONSIBILITY);
export type DelayResponsibility = z.infer<typeof DelayResponsibilitySchema>;

export const WORKFLOW_TEMPLATE_KEYS = ['SIMPLE_REPAIR', 'MATERIAL_REQUIRED', 'NEW_WORK', 'EMERGENCY'] as const;
export const WorkflowTemplateKeySchema = z.enum(WORKFLOW_TEMPLATE_KEYS);
export type WorkflowTemplateKey = z.infer<typeof WorkflowTemplateKeySchema>;

export const PRIORITY_CODES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export const PriorityCodeSchema = z.enum(PRIORITY_CODES);
