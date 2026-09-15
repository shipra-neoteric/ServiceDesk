import { prisma } from './db.js';
import { addBusinessHours, businessHoursBetween } from './businessCalendar.js';

const FALLBACK_SLA_HOURS = 48;

export interface SlaResolutionInput {
  projectId: string;
  categoryId: string;
  priorityId: string;
  stageKey?: string | null;
}

/** Resolution order documented in SLA_RULES.md "SLA scope resolution order". */
export async function resolveSlaHours(input: SlaResolutionInput): Promise<number> {
  const candidates = await prisma.sLADefinition.findMany({
    where: {
      OR: [
        { scope: 'PRIORITY', priorityId: input.priorityId },
        { scope: 'CATEGORY', categoryId: input.categoryId },
        { scope: 'PROJECT', projectId: input.projectId },
        { scope: 'GLOBAL', projectId: null, categoryId: null, priorityId: null },
      ],
    },
  });

  const withStage = input.stageKey ? candidates.filter((c) => c.stageKey === input.stageKey) : [];
  const withoutStage = candidates.filter((c) => !c.stageKey);

  const priorityOrder = ['PRIORITY', 'CATEGORY', 'PROJECT', 'GLOBAL'];
  for (const scope of priorityOrder) {
    const hit = withStage.find((c) => c.scope === scope) ?? withoutStage.find((c) => c.scope === scope);
    if (hit) return hit.hours;
  }
  return FALLBACK_SLA_HOURS;
}

async function projectHolidayDates(projectId: string): Promise<string[]> {
  const holidays = await prisma.holiday.findMany({ where: { OR: [{ projectId }, { projectId: null }] } });
  return holidays.map((h) => h.date.toISOString().slice(0, 10));
}

export async function computeStageDueDate(params: {
  projectId: string;
  categoryId: string;
  priorityId: string;
  stageKey: string;
  startAt: Date;
}): Promise<Date> {
  const hours = await resolveSlaHours(params);
  const holidayDates = await projectHolidayDates(params.projectId);
  return addBusinessHours(params.startAt, hours, holidayDates);
}

export interface StageDelay {
  stageKey: string;
  ownerRole: string | null;
  delayHours: number;
}

/** Delay per stage in business hours; 0 if not yet overdue or not yet closed. */
export async function computeStageDelays(jobCardId: string): Promise<StageDelay[]> {
  const stages = await prisma.jobStage.findMany({ where: { jobCardId } });
  const job = await prisma.jobCard.findUniqueOrThrow({ where: { id: jobCardId } });
  const holidayDates = await projectHolidayDates(job.projectId);
  const now = new Date();
  return stages.map((s) => {
    if (!s.plannedDueAt) return { stageKey: s.stageKey, ownerRole: s.ownerRole, delayHours: 0 };
    const compareEnd = s.actualCompletedAt ?? (s.status === 'DONE' ? s.actualCompletedAt! : now);
    const delay = businessHoursBetween(s.plannedDueAt, compareEnd ?? now, holidayDates);
    return { stageKey: s.stageKey, ownerRole: s.ownerRole, delayHours: Math.max(0, delay) };
  });
}

export type DelayResponsibility =
  | 'ENGINEER_DELAY'
  | 'APPROVAL_DELAY'
  | 'MATERIAL_DELAY'
  | 'REQUESTER_DELAY'
  | 'VENDOR_DELAY'
  | 'MANAGEMENT_HOLD'
  | 'NONE';

const ROLE_TO_BUCKET: Record<string, DelayResponsibility> = {
  SERVICE_ENGINEER: 'ENGINEER_DELAY',
  PROJECT_HEAD: 'APPROVAL_DELAY',
  PROCESS_COORDINATOR: 'MANAGEMENT_HOLD',
  REQUESTER: 'REQUESTER_DELAY',
};

/** Attributes the single largest delay bucket for a job, per SLA_RULES.md. */
export async function primaryDelayResponsibility(jobCardId: string): Promise<DelayResponsibility> {
  const delays = await computeStageDelays(jobCardId);
  const buckets = new Map<DelayResponsibility, number>();
  for (const d of delays) {
    if (d.delayHours <= 0) continue;
    const bucket = (d.ownerRole && ROLE_TO_BUCKET[d.ownerRole]) || 'MANAGEMENT_HOLD';
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + d.delayHours);
  }
  const materials = await prisma.materialRequirement.findMany({ where: { jobCardId } });
  const materialWait = materials.reduce((sum, m) => {
    if (!m.resolvedAt) return sum;
    return sum + (m.resolvedAt.getTime() - m.createdAt.getTime()) / 3_600_000;
  }, 0);
  if (materialWait > 0) buckets.set('MATERIAL_DELAY', (buckets.get('MATERIAL_DELAY') ?? 0) + materialWait);

  let best: DelayResponsibility = 'NONE';
  let bestHours = 0;
  for (const [bucket, hours] of buckets.entries()) {
    if (hours > bestHours) {
      best = bucket;
      bestHours = hours;
    }
  }
  return best;
}
