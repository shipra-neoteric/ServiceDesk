import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import type { CreateServiceRequestInput } from '@servicedesk/shared';
import { Drawer } from '../../ui/Drawer';
import { Button } from '../../ui/Button';
import { TextField, TextareaField, SelectField } from '../../ui/Field';
import { useToast } from '../../ui/Toast';
import { useProjects, useCategories, useJobTypes, usePriorities } from '../masters/api';
import { useCheckDuplicates, useCreateJob } from './api';

interface FormValues {
  projectId: string;
  locationText: string;
  categoryId: string;
  subcategoryId: string;
  jobTypeId: string;
  priorityId: string;
  narration: string;
  requesterName: string;
  requesterContact: string;
  desiredCompletionDate: string;
  isEmergency: boolean;
  safetyIssue: boolean;
  vendorRelated: boolean;
}

export function CreateJobDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { push } = useToast();
  const { data: projects } = useProjects();
  const { data: categories } = useCategories();
  const { data: jobTypes } = useJobTypes();
  const { data: priorities } = usePriorities();
  const checkDuplicates = useCheckDuplicates();
  const createJob = useCreateJob();
  const [duplicates, setDuplicates] = useState<{ id: string; jobNumber: string; status: string; locationText: string }[] | null>(null);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { isEmergency: false, safetyIssue: false, vendorRelated: false } });

  const selectedCategoryId = watch('categoryId');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  const submitJob = async (values: FormValues, duplicateAcknowledged: boolean) => {
    const payload: CreateServiceRequestInput = {
      projectId: values.projectId,
      locationId: null,
      locationText: values.locationText,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId || null,
      jobTypeId: values.jobTypeId,
      priorityId: values.priorityId,
      narration: values.narration,
      requesterName: values.requesterName,
      requesterContact: values.requesterContact || null,
      desiredCompletionDate: values.desiredCompletionDate ? new Date(values.desiredCompletionDate).toISOString() : null,
      isEmergency: values.isEmergency,
      safetyIssue: values.safetyIssue,
      vendorRelated: values.vendorRelated,
      assetTag: null,
      unitNumber: null,
      linkedJobCardId: null,
      duplicateAcknowledged,
    };
    try {
      const job = await createJob.mutateAsync(payload);
      push(`Job Card ${job.jobNumber} created.`, 'success');
      reset();
      setDuplicates(null);
      setPendingValues(null);
      onCreated(job.id);
    } catch (err) {
      push((err as { message?: string })?.message ?? 'Failed to create Job Card', 'error');
    }
  };

  const onSubmit = async (values: FormValues) => {
    const dupes = await checkDuplicates.mutateAsync({ projectId: values.projectId, locationText: values.locationText, categoryId: values.categoryId });
    if (dupes.length > 0) {
      setDuplicates(dupes);
      setPendingValues(values);
      return;
    }
    await submitJob(values, false);
  };

  return (
    <Drawer
      open={open}
      onClose={() => {
        onClose();
        setDuplicates(null);
      }}
      title="New Job Card"
      description="Raise a new service issue. It will be triaged and assigned automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button form="create-job-form" type="submit" loading={isSubmitting || createJob.isPending}>
            Create Job Card
          </Button>
        </>
      }
    >
      {duplicates && duplicates.length > 0 && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="h-4 w-4" /> Possible duplicate Job Cards found
          </p>
          <ul className="mb-2 flex flex-col gap-1">
            {duplicates.map((d) => (
              <li key={d.id} className="text-content dark:text-content-dark">
                {d.jobNumber} — {d.locationText} ({d.status})
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDuplicates(null)}>
              Go back and edit
            </Button>
            <Button size="sm" onClick={() => pendingValues && submitJob(pendingValues, true)}>
              Continue creating anyway
            </Button>
          </div>
        </div>
      )}

      <form id="create-job-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <SelectField label="Project / Property" required error={errors.projectId?.message} {...register('projectId', { required: 'Project is required' })}>
          <option value="">Select project…</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        <TextField label="Exact Location" required placeholder="e.g. Block C, 2nd Floor Corridor" error={errors.locationText?.message} {...register('locationText', { required: 'Location is required' })} />

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Work Category" required error={errors.categoryId?.message} {...register('categoryId', { required: 'Category is required' })}>
            <option value="">Select…</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Subcategory" {...register('subcategoryId')}>
            <option value="">None</option>
            {selectedCategory?.subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Job Type" required error={errors.jobTypeId?.message} {...register('jobTypeId', { required: 'Job type is required' })}>
            <option value="">Select…</option>
            {jobTypes?.map((jt) => (
              <option key={jt.id} value={jt.id}>
                {jt.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Priority" required error={errors.priorityId?.message} {...register('priorityId', { required: 'Priority is required' })}>
            <option value="">Select…</option>
            {priorities?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>

        <TextareaField label="Problem Description" required error={errors.narration?.message} {...register('narration', { required: 'Please describe the problem', minLength: { value: 3, message: 'Please add more detail' } })} />

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Requester Name" required error={errors.requesterName?.message} {...register('requesterName', { required: 'Requester name is required' })} />
          <TextField label="Requester Contact" {...register('requesterContact')} />
        </div>

        <TextField label="Desired Completion Date" type="datetime-local" {...register('desiredCompletionDate')} />

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isEmergency')} /> Emergency
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('safetyIssue')} /> Safety issue
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('vendorRelated')} /> Vendor related
          </label>
        </div>
      </form>
    </Drawer>
  );
}
