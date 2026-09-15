import { z } from 'zod';
import { HoldReasonSchema, ClosureReasonSchema } from './statuses.js';

export const CreateServiceRequestSchema = z.object({
  projectId: z.string().min(1),
  locationId: z.string().nullable().optional(),
  locationText: z.string().min(1, 'Exact location is required'),
  categoryId: z.string().min(1),
  subcategoryId: z.string().nullable().optional(),
  jobTypeId: z.string().min(1),
  priorityId: z.string().min(1),
  narration: z.string().min(3, 'Please describe the problem'),
  requesterName: z.string().min(1),
  requesterContact: z.string().nullable().optional(),
  desiredCompletionDate: z.string().datetime().nullable().optional(),
  isEmergency: z.boolean().default(false),
  safetyIssue: z.boolean().default(false),
  vendorRelated: z.boolean().default(false),
  assetTag: z.string().nullable().optional(),
  unitNumber: z.string().nullable().optional(),
  linkedJobCardId: z.string().nullable().optional(),
  duplicateAcknowledged: z.boolean().default(false),
});
export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;

export const AssignJobSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['ENGINEER', 'PROCESS_COORDINATOR', 'PROJECT_HEAD', 'VERIFIER']),
});

export const SiteVisitStartSchema = z.object({});
export const SiteVisitCompleteSchema = z.object({
  notes: z.string().min(1),
  diagnosis: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  materialRequired: z.boolean().default(false),
  externalRequired: z.boolean().default(false),
  approvalRequired: z.boolean().default(false),
  safetyConcern: z.boolean().default(false),
  temporaryFixDone: z.boolean().default(false),
  proposedCompletionDate: z.string().datetime().nullable().optional(),
});

export const HoldJobSchema = z.object({
  reasonCode: HoldReasonSchema,
  dependencyOwnerRole: z.string().min(1),
  reviewDueAt: z.string().datetime(),
  comment: z.string().min(1),
  slaPauses: z.boolean().default(true),
});

export const MaterialRequirementSchema = z.object({
  item: z.string().min(1),
  specification: z.string().nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  requiredByDate: z.string().datetime().nullable().optional(),
});

export const ApprovalRequestSchema = z.object({
  type: z.string().min(1),
  approverUserId: z.string().min(1),
  amount: z.number().nullable().optional(),
  comments: z.string().nullable().optional(),
});

export const ApprovalDecisionBodySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  comments: z.string().nullable().optional(),
});

export const CompleteJobSchema = z.object({
  completionNotes: z.string().min(1),
  materialsUsed: z.string().nullable().optional(),
  pendingObservations: z.string().nullable().optional(),
});

export const VerifyJobSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED', 'REWORK_REQUIRED', 'PARTIALLY_ACCEPTED']),
  comments: z.string().nullable().optional(),
});

export const CloseJobSchema = z.object({
  closureReasonCode: ClosureReasonSchema,
  comment: z.string().nullable().optional(),
});

export const ReopenJobSchema = z.object({
  reason: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});

export const AddCommentSchema = z.object({
  body: z.string().min(1),
});

export const ChangeDueDateSchema = z.object({
  newTargetCompletionAt: z.string().datetime(),
  reason: z.string().min(1),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
