import type { JobStatus } from '@servicedesk/shared';
import { conflict } from './httpError.js';

export type WorkflowCommand =
  | 'assign'
  | 'siteVisitStart'
  | 'siteVisitComplete'
  | 'requestMaterial'
  | 'requestApproval'
  | 'readyToStart'
  | 'start'
  | 'partial'
  | 'complete'
  | 'verify'
  | 'close'
  | 'closeShortCircuit'
  | 'hold'
  | 'resume'
  | 'reopen'
  | 'cancel';

interface Transition {
  command: WorkflowCommand;
  from: JobStatus[];
  to: JobStatus | 'PRESERVE_PRE_HOLD';
}

// See WORKFLOW.md "Transition rules" for the rationale behind each edge.
const TRANSITIONS: Transition[] = [
  { command: 'assign', from: ['RAISED', 'UNDER_TRIAGE'], to: 'ASSIGNED' },
  { command: 'siteVisitStart', from: ['ASSIGNED', 'SITE_VISIT_PENDING'], to: 'SITE_VISIT_PENDING' },
  { command: 'siteVisitComplete', from: ['SITE_VISIT_PENDING'], to: 'SITE_VISIT_COMPLETED' },
  {
    command: 'requestMaterial',
    from: ['SITE_VISIT_COMPLETED', 'DIAGNOSIS_PENDING', 'IN_PROGRESS', 'SCOPE_PENDING'],
    to: 'WAITING_MATERIAL',
  },
  {
    command: 'requestApproval',
    from: ['SITE_VISIT_COMPLETED', 'SCOPE_PENDING', 'WAITING_MATERIAL'],
    to: 'WAITING_APPROVAL',
  },
  {
    command: 'readyToStart',
    from: ['WAITING_MATERIAL', 'WAITING_APPROVAL', 'SITE_VISIT_COMPLETED', 'SCOPE_PENDING'],
    to: 'READY_TO_START',
  },
  { command: 'start', from: ['READY_TO_START', 'ASSIGNED', 'SITE_VISIT_COMPLETED'], to: 'IN_PROGRESS' },
  { command: 'partial', from: ['IN_PROGRESS'], to: 'PARTIALLY_COMPLETED' },
  { command: 'complete', from: ['IN_PROGRESS', 'PARTIALLY_COMPLETED'], to: 'WORK_COMPLETED' },
  { command: 'close', from: ['WORK_COMPLETED', 'VERIFICATION_PENDING'], to: 'CLOSED' },
  {
    command: 'closeShortCircuit',
    from: ['RAISED', 'UNDER_TRIAGE', 'ASSIGNED'],
    to: 'CLOSED_NOT_FEASIBLE',
  },
  { command: 'hold', from: [], to: 'ON_HOLD' }, // "from any non-terminal" — validated separately below
  { command: 'resume', from: ['ON_HOLD'], to: 'PRESERVE_PRE_HOLD' },
  { command: 'reopen', from: ['CLOSED', 'CLOSED_NOT_FEASIBLE'], to: 'REOPENED' },
  { command: 'cancel', from: [], to: 'CANCELLED' }, // "from any non-terminal"
];

export const TERMINAL: JobStatus[] = ['CLOSED', 'CLOSED_NOT_FEASIBLE', 'CLOSED_DUPLICATE', 'CLOSED_NO_ACTION', 'CANCELLED'];

export function assertTransition(command: WorkflowCommand, current: JobStatus): JobStatus | 'PRESERVE_PRE_HOLD' {
  if ((command === 'hold' || command === 'cancel') && TERMINAL.includes(current)) {
    throw conflict(`Cannot ${command} a job in terminal status ${current}`);
  }
  if (command === 'hold' || command === 'cancel') {
    return command === 'hold' ? 'ON_HOLD' : 'CANCELLED';
  }
  const def = TRANSITIONS.find((t) => t.command === command);
  if (!def) throw conflict(`Unknown workflow command ${command}`);
  if (!def.from.includes(current)) {
    throw conflict(`Cannot run "${command}" from status ${current}`, { allowedFrom: def.from });
  }
  return def.to;
}

export type WorkflowTemplateKey = 'SIMPLE_REPAIR' | 'MATERIAL_REQUIRED' | 'NEW_WORK' | 'EMERGENCY';

export function selectTemplateKey(params: {
  jobTypeCode: string;
  isEmergency: boolean;
  vendorRelated: boolean;
}): WorkflowTemplateKey {
  if (params.isEmergency) return 'EMERGENCY';
  if (params.jobTypeCode === 'NEW_WORK') return 'NEW_WORK';
  if (params.jobTypeCode === 'MATERIAL_REQUIRED') return 'MATERIAL_REQUIRED';
  return 'SIMPLE_REPAIR';
}

export const STAGE_KEY_FOR_COMMAND: Partial<Record<WorkflowCommand, string>> = {
  assign: 'ASSIGN',
  siteVisitStart: 'SITE_VISIT',
  siteVisitComplete: 'SITE_VISIT',
  requestMaterial: 'MATERIAL',
  requestApproval: 'APPROVAL',
  start: 'EXECUTION',
  complete: 'EXECUTION',
  close: 'VERIFICATION',
};
