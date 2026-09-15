import type { JobStatus } from '@servicedesk/shared';

export interface JobListItem {
  id: string;
  jobNumber: string;
  project: string;
  locationText: string;
  category: string;
  priority: string;
  status: JobStatus;
  currentOwnerRole: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  engineer: string | null;
  updatedAt: string;
  isOpen: boolean;
}

export interface JobListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: JobListItem[];
}

export interface JobStage {
  id: string;
  stageKey: string;
  name: string;
  sequence: number;
  status: 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED' | 'BLOCKED';
  plannedDueAt: string | null;
  actualStartAt: string | null;
  actualCompletedAt: string | null;
  ownerRole: string | null;
  notes: string | null;
}

export interface JobDetail {
  id: string;
  jobNumber: string;
  status: JobStatus;
  locationText: string;
  currentStageKey: string | null;
  currentOwnerRole: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  targetCompletionAt: string | null;
  createdAt: string;
  closedAt: string | null;
  isEmergency: boolean;
  safetyIssue: boolean;
  reopenCount: number;
  delayResponsibility: string;
  project: { id: string; name: string };
  category: { id: string; name: string };
  subcategory: { id: string; name: string } | null;
  jobType: { id: string; name: string };
  priority: { id: string; name: string };
  serviceRequest: { requesterName: string; narration: string; requestNumber: string };
  stages: JobStage[];
  assignments: { id: string; role: string; user: { id: string; name: string } }[];
  siteVisits: {
    id: string;
    startedAt: string;
    completedAt: string | null;
    notes: string | null;
    diagnosis: string | null;
    engineer: { name: string };
  }[];
  materials: { id: string; item: string; quantity: number; unit: string; status: string; availabilityNote: string | null }[];
  approvals: { id: string; type: string; decision: string; amount: number | null; approver: { name: string }; requestedBy: { name: string } }[];
  holds: { id: string; reasonCode: string; comment: string; startAt: string; endAt: string | null; reviewDueAt: string }[];
  attachments: { id: string; type: string; phase: string | null; path: string; caption: string | null; uploadedBy: { name: string }; uploadedAt: string }[];
  comments: { id: string; body: string; isSystem: boolean; author: { name: string }; createdAt: string }[];
  verifications: { id: string; decision: string; comments: string | null; verifiedBy: { name: string }; verifiedAt: string }[];
  reopenEvents: { id: string; reason: string; reopenedAt: string; severity: string }[];
}
