import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateServiceRequestInput } from '@servicedesk/shared';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import type { JobDetail, JobListResponse } from '../../types/job';

export interface JobListParams {
  view?: string;
  status?: string;
  projectId?: string;
  categoryId?: string;
  priorityId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const useJobList = (params: JobListParams) =>
  useQuery({
    queryKey: queryKeys.jobs(params),
    queryFn: async () => (await apiClient.get<JobListResponse>('/jobs', { params })).data,
    placeholderData: (prev) => prev,
  });

export const useJobDetail = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.job(id ?? ''),
    queryFn: async () => (await apiClient.get<JobDetail>(`/jobs/${id}`)).data,
    enabled: !!id,
  });

function useInvalidateJob(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['jobs'] });
    if (id) qc.invalidateQueries({ queryKey: queryKeys.job(id) });
  };
}

export const useCreateJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateServiceRequestInput) => (await apiClient.post<JobDetail>('/jobs', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
};

export const useCheckDuplicates = () =>
  useMutation({
    mutationFn: async (params: { projectId: string; locationText: string; categoryId: string }) =>
      (await apiClient.get('/jobs/check-duplicates', { params })).data as { id: string; jobNumber: string; status: string; locationText: string }[],
  });

function useJobAction<TBody = void>(id: string, path: string) {
  const invalidate = useInvalidateJob(id);
  return useMutation({
    mutationFn: async (body?: TBody) => (await apiClient.post<JobDetail>(`/jobs/${id}/${path}`, body ?? {})).data,
    onSuccess: invalidate,
  });
}

export const useAssignJob = (id: string) => useJobAction<{ userId: string; role: string }>(id, 'assign');
export const useSiteVisitStart = (id: string) => useJobAction(id, 'site-visit/start');
export const useSiteVisitComplete = (id: string) =>
  useJobAction<{ notes: string; diagnosis?: string; materialRequired?: boolean; approvalRequired?: boolean }>(id, 'site-visit/complete');
export const useRequestMaterial = (id: string) => useJobAction<{ item: string; quantity: number; unit: string; specification?: string }>(id, 'materials');
export const useRequestApproval = (id: string) => useJobAction<{ type: string; approverUserId: string; amount?: number }>(id, 'approvals');
export const useReadyToStart = (id: string) => useJobAction(id, 'ready-to-start');
export const useStartJob = (id: string) => useJobAction(id, 'start');
export const useCompleteJob = (id: string) => useJobAction<{ completionNotes: string }>(id, 'complete');
export const useVerifyJob = (id: string) => useJobAction<{ decision: string; comments?: string }>(id, 'verify');
export const useCloseJob = (id: string) => useJobAction<{ closureReasonCode: string; comment?: string }>(id, 'close');
export const useReopenJob = (id: string) => useJobAction<{ reason: string; severity?: string }>(id, 'reopen');
export const useHoldJob = (id: string) =>
  useJobAction<{ reasonCode: string; dependencyOwnerRole: string; reviewDueAt: string; comment: string; slaPauses: boolean }>(id, 'hold');
export const useResumeJob = (id: string) => useJobAction(id, 'resume');
export const useAddComment = (id: string) => useJobAction<{ body: string }>(id, 'comments');

export const useUploadAttachment = (id: string) => {
  const invalidate = useInvalidateJob(id);
  return useMutation({
    mutationFn: async (params: { file: File; phase?: string }) => {
      const form = new FormData();
      form.append('file', params.file);
      if (params.phase) form.append('phase', params.phase);
      return (await apiClient.post(`/jobs/${id}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    onSuccess: invalidate,
  });
};
