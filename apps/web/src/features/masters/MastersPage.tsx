import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { TextField, SelectField } from '../../ui/Field';
import { Badge } from '../../ui/Badge';
import { EmptyState } from '../../ui/EmptyState';
import { IconButton } from '../../ui/IconButton';
import { useToast } from '../../ui/Toast';
import { formatDate } from '../../lib/format';
import { queryKeys } from '../../lib/queryKeys';
import {
  useProjects,
  useCategories,
  useJobTypes,
  usePriorities,
  useHolidays,
  useCreateHoliday,
  useWorkflowTemplates,
  useUpdateWorkflowStage,
  useSlaDefinitions,
  useCreateSlaDefinition,
  useDeleteSlaDefinition,
  useEscalationRules,
  useUpsertEscalationRule,
  useUpdateEscalationRule,
  useReasonCodes,
  useCreateReasonCode,
  useUpdateReasonCode,
  type ReasonCode,
} from './api';

const TABS = ['Organization & Work', 'Holiday Calendar', 'Workflow Templates', 'SLA Rules', 'Escalation Rules', 'Reasons'] as const;
type Tab = (typeof TABS)[number];

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

function OrganizationTab() {
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
        <InlineCreate
          placeholder="New priority name"
          onCreate={(name, code) => createPriority.mutateAsync({ name, code, rank: (priorities?.length ?? 0) + 1 }).then(() => undefined)}
        />
      </Card>
    </div>
  );
}

function HolidayCalendarTab() {
  const { push } = useToast();
  const { data: holidays, isLoading } = useHolidays();
  const { data: projects } = useProjects();
  const createHoliday = useCreateHoliday();
  const [form, setForm] = useState({ date: '', name: '', projectId: '' });

  return (
    <Card header={<h2 className="text-base font-semibold">Holiday Calendar</h2>}>
      <p className="mb-4 text-sm text-content-muted dark:text-content-dark-muted">
        Excluded from SLA business-hour calculations (SLA_RULES.md "Calendar"). Leave project blank for a company-wide holiday.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <TextField label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali" />
        <SelectField label="Project (optional)" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <Button
          size="sm"
          disabled={!form.date || !form.name}
          onClick={async () => {
            try {
              await createHoliday.mutateAsync({ date: new Date(form.date).toISOString(), name: form.name, projectId: form.projectId || null });
              push('Holiday added', 'success');
              setForm({ date: '', name: '', projectId: '' });
            } catch (e) {
              push((e as { message?: string })?.message ?? 'Failed to add holiday', 'error');
            }
          }}
        >
          Add Holiday
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : !holidays || holidays.length === 0 ? (
        <EmptyState title="No holidays configured" reason="SLA calculations will only exclude weekends until holidays are added." />
      ) : (
        <ul className="divide-y divide-border text-sm dark:divide-border-dark">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>{h.name}</span>
              <span className="text-content-muted dark:text-content-dark-muted">
                {formatDate(h.date)} {h.projectId ? '' : '· All projects'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WorkflowTemplatesTab() {
  const { push } = useToast();
  const { data: templates, isLoading } = useWorkflowTemplates();
  const updateStage = useUpdateWorkflowStage();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm text-content-muted dark:text-content-dark-muted">
          Templates and stage sequence are seed/API-managed for L1 (ARCHITECTURE.md §6). Owner role, SLA hours, and whether a stage requires
          completion evidence are editable here — the Evidence toggle directly controls whether <code>/jobs/:id/complete</code> blocks without an
          AFTER photo (WORKFLOW.md "Stage tracker").
        </p>
      </Card>
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : (
        templates?.map((t) => (
          <Card key={t.id} header={<h2 className="text-base font-semibold">{t.name}</h2>}>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${t.name} stages table, scroll horizontally for more columns`}>
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-content-muted dark:text-content-dark-muted">
                  <tr>
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Stage</th>
                    <th className="py-2 pr-4">Owner Role</th>
                    <th className="py-2 pr-4">SLA (hrs)</th>
                    <th className="py-2 pr-4">Requires Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-border-dark">
                  {t.stages.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-4 text-content-muted dark:text-content-dark-muted">{s.sequence}</td>
                      <td className="py-2 pr-4 font-medium text-content dark:text-content-dark">{s.name}</td>
                      <td className="py-2 pr-4">
                        <select
                          aria-label={`Owner role for ${s.name}`}
                          value={s.ownerRole}
                          onChange={(e) =>
                            updateStage.mutate(
                              { id: s.id, ownerRole: e.target.value },
                              { onSuccess: () => push('Stage owner updated', 'success'), onError: () => push('Failed to update', 'error') },
                            )
                          }
                          className="h-8 rounded-md border border-border bg-surface px-2 text-xs dark:border-border-dark dark:bg-surface-dark"
                        >
                          {['SERVICE_ENGINEER', 'PROJECT_HEAD', 'PROCESS_COORDINATOR', 'SERVICE_HEAD'].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          aria-label={`SLA hours for ${s.name}`}
                          type="number"
                          min={1}
                          defaultValue={s.slaHours}
                          onBlur={(e) => {
                            const hours = Number(e.target.value);
                            if (hours > 0 && hours !== s.slaHours) {
                              updateStage.mutate(
                                { id: s.id, slaHours: hours },
                                { onSuccess: () => push('SLA hours updated', 'success'), onError: () => push('Failed to update', 'error') },
                              );
                            }
                          }}
                          className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-xs dark:border-border-dark dark:bg-surface-dark"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.requiredEvidence}
                            onChange={(e) =>
                              updateStage.mutate(
                                { id: s.id, requiredEvidence: e.target.checked },
                                { onSuccess: () => push('Evidence requirement updated', 'success'), onError: () => push('Failed to update', 'error') },
                              )
                            }
                          />
                          Required
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function SlaRulesTab() {
  const { push } = useToast();
  const { data: slaRules, isLoading } = useSlaDefinitions();
  const { data: projects } = useProjects();
  const { data: categories } = useCategories();
  const { data: priorities } = usePriorities();
  const createSla = useCreateSlaDefinition();
  const deleteSla = useDeleteSlaDefinition();
  const [form, setForm] = useState<{ scope: 'GLOBAL' | 'PROJECT' | 'CATEGORY' | 'PRIORITY'; refId: string; stageKey: string; hours: string }>({
    scope: 'GLOBAL',
    refId: '',
    stageKey: '',
    hours: '48',
  });

  const nameFor = (rule: NonNullable<typeof slaRules>[number]) => {
    if (rule.scope === 'PROJECT') return projects?.find((p) => p.id === rule.projectId)?.name ?? rule.projectId;
    if (rule.scope === 'CATEGORY') return categories?.find((c) => c.id === rule.categoryId)?.name ?? rule.categoryId;
    if (rule.scope === 'PRIORITY') return priorities?.find((p) => p.id === rule.priorityId)?.name ?? rule.priorityId;
    return 'All jobs';
  };

  return (
    <Card header={<h2 className="text-base font-semibold">SLA Rules</h2>}>
      <p className="mb-4 text-sm text-content-muted dark:text-content-dark-muted">
        Resolution order is Priority → Category → Project → Global → a 48h fallback (SLA_RULES.md "SLA scope resolution order"). Leave Stage blank
        for a whole-job SLA.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SelectField label="Scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as typeof f.scope, refId: '' }))}>
          <option value="GLOBAL">Global</option>
          <option value="PROJECT">Project</option>
          <option value="CATEGORY">Category</option>
          <option value="PRIORITY">Priority</option>
        </SelectField>
        {form.scope !== 'GLOBAL' && (
          <SelectField label="Applies to" value={form.refId} onChange={(e) => setForm((f) => ({ ...f, refId: e.target.value }))}>
            <option value="">Select…</option>
            {form.scope === 'PROJECT' && projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {form.scope === 'CATEGORY' && categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {form.scope === 'PRIORITY' && priorities?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        )}
        <TextField label="Stage key (optional)" value={form.stageKey} onChange={(e) => setForm((f) => ({ ...f, stageKey: e.target.value }))} placeholder="e.g. SITE_VISIT" />
        <TextField label="Hours" type="number" min={1} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
        <Button
          size="sm"
          disabled={form.scope !== 'GLOBAL' && !form.refId}
          onClick={async () => {
            try {
              await createSla.mutateAsync({
                scope: form.scope,
                projectId: form.scope === 'PROJECT' ? form.refId : null,
                categoryId: form.scope === 'CATEGORY' ? form.refId : null,
                priorityId: form.scope === 'PRIORITY' ? form.refId : null,
                stageKey: form.stageKey || null,
                hours: Number(form.hours),
              });
              push('SLA rule added', 'success');
              setForm({ scope: 'GLOBAL', refId: '', stageKey: '', hours: '48' });
            } catch (e) {
              push((e as { message?: string })?.message ?? 'Failed to add SLA rule', 'error');
            }
          }}
        >
          Add Rule
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : !slaRules || slaRules.length === 0 ? (
        <EmptyState title="No SLA rules configured" reason="Jobs fall back to the documented 48-hour default." />
      ) : (
        <ul className="divide-y divide-border text-sm dark:divide-border-dark">
          {slaRules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                <Badge>{r.scope}</Badge> {nameFor(r)} {r.stageKey ? `· stage ${r.stageKey}` : '· whole job'}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium text-content dark:text-content-dark">{r.hours}h</span>
                <IconButton
                  label="Delete SLA rule"
                  size="sm"
                  onClick={async () => {
                    try {
                      await deleteSla.mutateAsync(r.id);
                      push('SLA rule removed', 'success');
                    } catch (e) {
                      push((e as { message?: string })?.message ?? 'Failed to delete', 'error');
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const ESCALATION_TRIGGER_TYPES = ['APPROVAL_OVERDUE', 'MATERIAL_BLOCKED', 'NO_UPDATE', 'HOLD_REVIEW'];

function EscalationRulesTab() {
  const { push } = useToast();
  const { data: rules, isLoading } = useEscalationRules();
  const upsert = useUpsertEscalationRule();
  const update = useUpdateEscalationRule();
  const [form, setForm] = useState({ triggerType: 'APPROVAL_OVERDUE', thresholdHours: '24', escalateToRole: 'PROCESS_COORDINATOR' });

  return (
    <Card header={<h2 className="text-base font-semibold">Escalation Rules</h2>}>
      <p className="mb-4 text-sm text-content-muted dark:text-content-dark-muted">
        Thresholds the Process Coordinator attention queue reads at query time (see <code>attention/rules.ts</code>{' '}
        <code>resolveThresholdHours</code>) — a documented default applies until a rule exists for a trigger type.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SelectField label="Trigger" value={form.triggerType} onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value }))}>
          {ESCALATION_TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
        <TextField label="Threshold (hrs)" type="number" min={1} value={form.thresholdHours} onChange={(e) => setForm((f) => ({ ...f, thresholdHours: e.target.value }))} />
        <SelectField label="Escalate to" value={form.escalateToRole} onChange={(e) => setForm((f) => ({ ...f, escalateToRole: e.target.value }))}>
          {['PROCESS_COORDINATOR', 'PROJECT_HEAD', 'SERVICE_HEAD'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await upsert.mutateAsync({ triggerType: form.triggerType, thresholdHours: Number(form.thresholdHours), escalateToRole: form.escalateToRole });
              push('Escalation rule saved', 'success');
            } catch (e) {
              push((e as { message?: string })?.message ?? 'Failed to save', 'error');
            }
          }}
        >
          Save Rule
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : !rules || rules.length === 0 ? (
        <EmptyState title="No custom thresholds" reason="Attention rules use their documented defaults (24h/48h) until you add one here." />
      ) : (
        <ul className="divide-y divide-border text-sm dark:divide-border-dark">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                {r.triggerType} → escalate to <strong>{r.escalateToRole}</strong> after <strong>{r.thresholdHours}h</strong>
              </span>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => update.mutate({ id: r.id, active: e.target.checked }, { onSuccess: () => push('Updated', 'success') })}
                />
                Active
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const REASON_CATEGORIES: { key: ReasonCode['category']; label: string; enumBacked: boolean; suggestions: string[] }[] = [
  { key: 'HOLD', label: 'Hold Reasons', enumBacked: true, suggestions: ['WAITING_MATERIAL', 'WAITING_APPROVAL', 'WAITING_REQUESTER', 'SITE_ACCESS_ISSUE', 'SAFETY_RESTRICTION', 'EXTERNAL_VENDOR', 'TECHNICAL_CONSTRAINT', 'MANAGEMENT_HOLD', 'WEATHER', 'DEPENDENCY_ON_OTHER_WORK'] },
  { key: 'CLOSURE', label: 'Closure Reasons', enumBacked: true, suggestions: ['COMPLETED', 'NOT_FEASIBLE', 'DUPLICATE', 'NO_ACTION_REQUIRED'] },
  { key: 'CANCELLATION', label: 'Cancellation Reasons', enumBacked: false, suggestions: [] },
  { key: 'REOPEN', label: 'Reopen Reasons', enumBacked: false, suggestions: [] },
];

interface ReasonCategoryCardProps {
  category: ReasonCode['category'];
  label: string;
  enumBacked: boolean;
  suggestions: string[];
}

function ReasonCategoryCard({ category, label, enumBacked, suggestions }: ReasonCategoryCardProps) {
  const { push } = useToast();
  const { data: reasons, isLoading } = useReasonCodes(category);
  const createReason = useCreateReasonCode();
  const updateReason = useUpdateReasonCode();
  const [form, setForm] = useState({ code: '', label: '' });

  const existingCodes = new Set((reasons ?? []).map((r) => r.code));
  const availableSuggestions = suggestions.filter((s) => !existingCodes.has(s));

  return (
    <div data-testid={`reason-card-${category}`}>
    <Card header={<h2 className="text-base font-semibold">{label}</h2>}>
      {enumBacked && (
        <p className="mb-3 text-xs text-content-muted dark:text-content-dark-muted">
          The API only accepts these exact codes for {category === 'HOLD' ? 'the Hold action' : 'closure'} — this list curates their labels and
          active state, matching <code>packages/shared/src/statuses.ts</code>.
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {enumBacked ? (
          <SelectField
            label="Code"
            id={`reason-code-${category}`}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value, label: f.label || e.target.value }))}
          >
            <option value="">Select…</option>
            {availableSuggestions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField
            label="Code"
            id={`reason-code-${category}`}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_') }))}
            placeholder="e.g. CHANGED_MIND"
          />
        )}
        <TextField
          label="Label"
          id={`reason-label-${category}`}
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Shown to users"
        />
        <Button
          size="sm"
          disabled={!form.code || !form.label}
          onClick={async () => {
            try {
              await createReason.mutateAsync({ category, code: form.code, label: form.label });
              push('Reason added', 'success');
              setForm({ code: '', label: '' });
            } catch (e) {
              push((e as { message?: string })?.message ?? 'Failed to add reason', 'error');
            }
          }}
        >
          Add
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : !reasons || reasons.length === 0 ? (
        <EmptyState title="No reasons configured yet" reason="Add one above." />
      ) : (
        <ul className="divide-y divide-border text-sm dark:divide-border-dark">
          {reasons.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                {r.label} <span className="text-content-muted dark:text-content-dark-muted">({r.code})</span>
              </span>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => updateReason.mutate({ id: r.id, active: e.target.checked }, { onSuccess: () => push('Updated', 'success') })}
                />
                Active
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </div>
  );
}

function ReasonsTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {REASON_CATEGORIES.map((c) => (
        <ReasonCategoryCard key={c.key} category={c.key} label={c.label} enumBacked={c.enumBacked} suggestions={c.suggestions} />
      ))}
    </div>
  );
}

export function MastersPage() {
  const [tab, setTab] = useState<Tab>('Organization & Work');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Masters" description="Organization, workflow, SLA, escalation and reason-code configuration for ServiceDesk." />
      <div className="flex gap-1 overflow-x-auto border-b border-border dark:border-border-dark">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast',
              tab === t ? 'border-primary text-primary-strong dark:text-primary' : 'border-transparent text-content-muted hover:text-content dark:text-content-dark-muted',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Organization & Work' && <OrganizationTab />}
      {tab === 'Holiday Calendar' && <HolidayCalendarTab />}
      {tab === 'Workflow Templates' && <WorkflowTemplatesTab />}
      {tab === 'SLA Rules' && <SlaRulesTab />}
      {tab === 'Escalation Rules' && <EscalationRulesTab />}
      {tab === 'Reasons' && <ReasonsTab />}
    </div>
  );
}
