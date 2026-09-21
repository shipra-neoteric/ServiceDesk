import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';

export interface Project {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
export interface WorkSubcategory {
  id: string;
  name: string;
  code: string;
}
export interface WorkCategory {
  id: string;
  name: string;
  code: string;
  subcategories: WorkSubcategory[];
}
export interface JobType {
  id: string;
  name: string;
  code: string;
}
export interface Priority {
  id: string;
  name: string;
  code: string;
  rank: number;
}

export const useProjects = () => useQuery({ queryKey: queryKeys.projects(), queryFn: async () => (await apiClient.get<Project[]>('/masters/projects')).data });

export const useCategories = () =>
  useQuery({ queryKey: queryKeys.categories(), queryFn: async () => (await apiClient.get<WorkCategory[]>('/masters/categories')).data });

export const useJobTypes = () => useQuery({ queryKey: queryKeys.jobTypes(), queryFn: async () => (await apiClient.get<JobType[]>('/masters/job-types')).data });

export const usePriorities = () =>
  useQuery({ queryKey: queryKeys.priorities(), queryFn: async () => (await apiClient.get<Priority[]>('/masters/priorities')).data });

export interface Approver {
  id: string;
  name: string;
}
export const useApprovers = () => useQuery({ queryKey: ['users', 'approvers'], queryFn: async () => (await apiClient.get<Approver[]>('/users/approvers')).data });

// ---- Holidays ----
export interface Holiday {
  id: string;
  date: string;
  name: string;
  projectId: string | null;
}
export const useHolidays = () => useQuery({ queryKey: ['masters', 'holidays'], queryFn: async () => (await apiClient.get<Holiday[]>('/masters/holidays')).data });
export const useCreateHoliday = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; name: string; projectId?: string | null }) => (await apiClient.post('/masters/holidays', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'holidays'] }),
  });
};

// ---- Workflow templates ----
export interface WorkflowStageTemplate {
  id: string;
  key: string;
  name: string;
  sequence: number;
  ownerRole: string;
  slaHours: number;
  requiredEvidence: boolean;
}
export interface WorkflowTemplate {
  id: string;
  key: string;
  name: string;
  active: boolean;
  stages: WorkflowStageTemplate[];
}
export const useWorkflowTemplates = () =>
  useQuery({ queryKey: ['masters', 'workflow-templates'], queryFn: async () => (await apiClient.get<WorkflowTemplate[]>('/masters/workflow-templates')).data });
export const useUpdateWorkflowStage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; ownerRole?: string; slaHours?: number; requiredEvidence?: boolean }) =>
      (await apiClient.patch(`/masters/workflow-stage-templates/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'workflow-templates'] }),
  });
};

// ---- SLA definitions ----
export interface SLADefinition {
  id: string;
  scope: 'GLOBAL' | 'PROJECT' | 'CATEGORY' | 'PRIORITY';
  projectId: string | null;
  categoryId: string | null;
  priorityId: string | null;
  stageKey: string | null;
  hours: number;
}
export const useSlaDefinitions = () =>
  useQuery({ queryKey: ['masters', 'sla-definitions'], queryFn: async () => (await apiClient.get<SLADefinition[]>('/masters/sla-definitions')).data });
export const useCreateSlaDefinition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<SLADefinition, 'id'>) => (await apiClient.post('/masters/sla-definitions', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'sla-definitions'] }),
  });
};
export const useDeleteSlaDefinition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/masters/sla-definitions/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'sla-definitions'] }),
  });
};

// ---- Escalation rules ----
export interface EscalationRule {
  id: string;
  triggerType: string;
  thresholdHours: number;
  escalateToRole: string;
  active: boolean;
}
export const useEscalationRules = () =>
  useQuery({ queryKey: ['masters', 'escalation-rules'], queryFn: async () => (await apiClient.get<EscalationRule[]>('/masters/escalation-rules')).data });
export const useUpsertEscalationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<EscalationRule, 'id' | 'active'> & { active?: boolean }) => (await apiClient.post('/masters/escalation-rules', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'escalation-rules'] }),
  });
};
export const useUpdateEscalationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; active?: boolean; thresholdHours?: number; escalateToRole?: string }) =>
      (await apiClient.patch(`/masters/escalation-rules/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'escalation-rules'] }),
  });
};

// ---- Reason codes (Hold / Closure / Cancellation / Reopen) ----
export interface ReasonCode {
  id: string;
  category: 'HOLD' | 'CLOSURE' | 'CANCELLATION' | 'REOPEN';
  code: string;
  label: string;
  active: boolean;
}
export const useReasonCodes = (category?: ReasonCode['category']) =>
  useQuery({
    queryKey: ['masters', 'reason-codes', category ?? 'all'],
    queryFn: async () => (await apiClient.get<ReasonCode[]>('/masters/reason-codes', { params: category ? { category } : {} })).data,
  });
export const useCreateReasonCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: ReasonCode['category']; code: string; label: string }) => (await apiClient.post('/masters/reason-codes', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'reason-codes'] }),
  });
};
// ---- Legacy FMS import ----
export interface LegacyImportRowCandidates {
  field: 'project';
  rawText: string;
  options: { id: string; name: string }[];
}
export interface LegacyImportRow {
  id: string;
  rowNumber: number;
  status: 'PENDING' | 'IMPORTED' | 'SKIPPED' | 'AMBIGUOUS' | 'DUPLICATE' | 'FAILED';
  legacyRef: string | null;
  matchedJobCardId: string | null;
  reasonText: string | null;
  candidatesJson: string | null;
}
export interface LegacyImportBatch {
  id: string;
  sourceSheet: string;
  importedAt: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  imported: number;
  skipped: number;
  ambiguous: number;
  duplicate: number;
  failed: number;
  warnings: string[];
  rows?: LegacyImportRow[];
}
// Batches still being processed change frequently (a real import can run for many minutes), so
// poll while any are in flight; otherwise there's nothing changing and polling would be wasted.
export const useLegacyImportBatches = () =>
  useQuery({
    queryKey: ['legacy-import'],
    queryFn: async () => (await apiClient.get<LegacyImportBatch[]>('/legacy-import')).data,
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'PROCESSING') ? 3000 : false),
  });
export const useUploadLegacyImport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      // The upload only has to wait for the CSV to be parsed and the batch row created — actual
      // row-by-row processing happens after the response, in the background (see routes.ts) — so
      // the default apiClient timeout is fine here; the UI then polls this batch's status.
      //
      // Content-Type is intentionally left unset: multipart/form-data requires a `boundary=...`
      // parameter the browser generates for the actual FormData payload. Setting the header
      // manually (even to the "correct" MIME type) overrides that auto-generation and strips the
      // boundary, so the server can never find the file in the body — the request hangs with no
      // response until the client times out, surfacing as a generic network error.
      return (await apiClient.post<LegacyImportBatch>('/legacy-import', form)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legacy-import'] }),
  });
};

// Resolves every AMBIGUOUS row in a batch whose Property text matched more than one active
// Project master (e.g. "School") to one chosen Project, and remembers that choice for the rest
// of the batch's rows with the same raw text.
export const useResolveLegacyImportProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ batchId, rawText, projectId }: { batchId: string; rawText: string; projectId: string }) =>
      (await apiClient.post<LegacyImportBatch>(`/legacy-import/${batchId}/resolve-project`, { rawText, projectId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['legacy-import'] }),
  });
};

export const useUpdateReasonCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; label?: string; active?: boolean }) => (await apiClient.patch(`/masters/reason-codes/${id}`, data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters', 'reason-codes'] }),
  });
};
