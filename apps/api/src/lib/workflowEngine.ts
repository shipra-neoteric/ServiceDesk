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

/**
 * Only commands that represent a stage genuinely *finishing* close it — this is a fixed
 * command -> stageKey map, not "whatever command happens to be associated with that stage".
 * Getting this wrong is a real class of bug: mapping `start` to `EXECUTION` (as an earlier
 * version of this file did) makes *starting* work immediately mark that stage DONE and jump
 * the tracker to Verification before any work happens, and mapping `siteVisitStart` to
 * `SITE_VISIT` does the same to the site-visit stage. `siteVisitStart`/`start`/`partial` and
 * the material/approval *request* commands intentionally have no entry here — they change
 * `JobCard.status` but happen *inside* a stage that is already ACTIVE, not at its boundary.
 */
export const STAGE_KEY_FOR_COMMAND: Partial<Record<WorkflowCommand, string>> = {
  assign: 'ASSIGN',
  siteVisitComplete: 'SITE_VISIT',
  complete: 'EXECUTION',
  close: 'VERIFICATION',
};

/**
 * Commands that close whichever stage is *currently* ACTIVE, rather than only a fixed key.
 * `readyToStart` is reachable from a material-blocked, approval-blocked, or post-site-visit
 * state depending on the template, so "which stage does this close" can only be answered by
 * looking at `JobCard.currentStageKey` at call time. `assign` is here too as a *fallback*:
 * SIMPLE_REPAIR/EMERGENCY have a dedicated ASSIGN stage (closed via the fixed key above), but
 * MATERIAL_REQUIRED/NEW_WORK go straight from TRIAGE to SITE_VISIT with no ASSIGN stage at
 * all — for those, assign must still close whatever's active (TRIAGE) or it silently no-ops
 * and leaves TRIAGE stuck ACTIVE forever. See resolveStageKeyToClose in jobs/service.ts, which
 * tries the fixed key first and only falls back to "current active" when that stage doesn't
 * exist in this job's template.
 */
export const DYNAMIC_STAGE_CLOSE_COMMANDS: ReadonlySet<WorkflowCommand> = new Set(['readyToStart', 'assign']);
