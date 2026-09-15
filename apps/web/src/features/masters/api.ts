import { useQuery } from '@tanstack/react-query';
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
