import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Badge } from '../../ui/Badge';
import { useToast } from '../../ui/Toast';
import { useProjects, useCategories, useJobTypes, usePriorities } from './api';
import { queryKeys } from '../../lib/queryKeys';

function InlineCreate({ onCreate, placeholder }: { onCreate: (name: string, code: string) => Promise<void>; placeholder: string }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="flex gap-2">
      <TextField
        label={placeholder}
        id={placeholder.replace(/\s+/g, '-').toLowerCase()}
        hideLabel
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-9"
      />
      <Button
        size="sm"
        disabled={!name.trim() || submitting}
        onClick={async () => {
          setSubmitting(true);
          const code = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
          await onCreate(name.trim(), code);
          setName('');
          setSubmitting(false);
        }}
      >
        Add
      </Button>
    </div>
  );
}

export function MastersPage() {
  const { push } = useToast();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: categories } = useCategories();
  const { data: jobTypes } = useJobTypes();
  const { data: priorities } = usePriorities();

  const createProject = useMutation({
    mutationFn: async (input: { name: string; code: string }) => apiClient.post('/masters/projects', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects() });
      push('Project added', 'success');
    },
    onError: (e) => push((e as { message?: string })?.message ?? 'Failed to add project', 'error'),
  });
  const createCategory = useMutation({
    mutationFn: async (input: { name: string; code: string }) => apiClient.post('/masters/categories', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories() });
      push('Category added', 'success');
    },
    onError: (e) => push((e as { message?: string })?.message ?? 'Failed to add category', 'error'),
  });
  const createJobType = useMutation({
    mutationFn: async (input: { name: string; code: string }) => apiClient.post('/masters/job-types', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobTypes() });
      push('Job type added', 'success');
    },
    onError: (e) => push((e as { message?: string })?.message ?? 'Failed to add job type', 'error'),
  });
  const createPriority = useMutation({
    mutationFn: async (input: { name: string; code: string; rank: number }) => apiClient.post('/masters/priorities', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.priorities() });
      push('Priority added', 'success');
    },
    onError: (e) => push((e as { message?: string })?.message ?? 'Failed to add priority', 'error'),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Masters" description="Projects, categories, job types and priorities that drive Job Card creation and workflow selection." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card header={<h2 className="text-base font-semibold">Projects / Properties</h2>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {projects?.map((p) => (
              <Badge key={p.id} tone={p.active ? 'success' : 'neutral'}>
                {p.name}
              </Badge>
            ))}
          </div>
          <InlineCreate placeholder="New project name" onCreate={(name, code) => createProject.mutateAsync({ name, code }).then(() => undefined)} />
        </Card>

        <Card header={<h2 className="text-base font-semibold">Work Categories</h2>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {categories?.map((c) => (
              <Badge key={c.id}>{c.name}</Badge>
            ))}
          </div>
          <InlineCreate placeholder="New category name" onCreate={(name, code) => createCategory.mutateAsync({ name, code }).then(() => undefined)} />
        </Card>

        <Card header={<h2 className="text-base font-semibold">Job Types</h2>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {jobTypes?.map((jt) => (
              <Badge key={jt.id}>{jt.name}</Badge>
            ))}
          </div>
          <InlineCreate placeholder="New job type name" onCreate={(name, code) => createJobType.mutateAsync({ name, code }).then(() => undefined)} />
          <p className="mt-2 text-xs text-content-muted dark:text-content-dark-muted">
            Codes <code>NEW_WORK</code>, <code>MATERIAL_REQUIRED</code> and <code>SIMPLE_REPAIR</code> control which workflow template is selected — see WORKFLOW.md.
          </p>
        </Card>

        <Card header={<h2 className="text-base font-semibold">Priorities</h2>}>
          <div className="mb-3 flex flex-wrap gap-2">
            {priorities?.map((p) => (
              <Badge key={p.id}>
                {p.name} (rank {p.rank})
              </Badge>
            ))}
          </div>
          <InlineCreate placeholder="New priority name" onCreate={(name, code) => createPriority.mutateAsync({ name, code, rank: (priorities?.length ?? 0) + 1 }).then(() => undefined)} />
        </Card>
      </div>
    </div>
  );
}
