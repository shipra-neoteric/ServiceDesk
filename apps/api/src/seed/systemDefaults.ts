import { prisma } from '../lib/db.js';
import { HOLD_REASONS, CLOSURE_REASONS } from '@servicedesk/shared';

/**
 * Structural configuration the app needs to function at all — not customer business data.
 * Unlike Projects/WorkCategory (which a real Master Admin defines for their own properties via
 * Masters UI after first login), WorkflowTemplate/WorkflowStageTemplate has no "create from
 * scratch" UI (ARCHITECTURE.md §6a), and Priority/JobType/Reason codes are generic concepts
 * every deployment needs *some* version of to create a Job Card or use Hold/Close at all.
 * Shared by seed.ts (adds demo business data on top) and bootstrap.ts (production — stops here).
 */

export const JOB_TYPES = [
  { code: 'SIMPLE_REPAIR', name: 'Simple Repair' },
  { code: 'MATERIAL_REQUIRED', name: 'Material-Dependent Repair' },
  { code: 'NEW_WORK', name: 'New Work / Installation' },
  { code: 'PREVENTIVE', name: 'Preventive Maintenance' },
];

export const PRIORITIES = [
  { code: 'LOW', name: 'Low', rank: 1, hours: 96 },
  { code: 'NORMAL', name: 'Normal', rank: 2, hours: 48 },
  { code: 'HIGH', name: 'High', rank: 3, hours: 24 },
  { code: 'CRITICAL', name: 'Critical', rank: 4, hours: 4 },
];

export const WORKFLOW_TEMPLATES: Record<
  string,
  { name: string; stages: { key: string; name: string; ownerRole: string; slaHours: number; requiredEvidence?: boolean }[] }
> = {
  SIMPLE_REPAIR: {
    name: 'Simple Repair',
    stages: [
      { key: 'TRIAGE', name: 'Triage', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'ASSIGN', name: 'Assign Engineer', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'SITE_VISIT', name: 'Site Visit & Repair', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'EXECUTION', name: 'Repair Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Close', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  MATERIAL_REQUIRED: {
    name: 'Material Required',
    stages: [
      { key: 'TRIAGE', name: 'Triage', ownerRole: 'PROCESS_COORDINATOR', slaHours: 4 },
      { key: 'SITE_VISIT', name: 'Site Visit', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'DIAGNOSIS', name: 'Diagnosis', ownerRole: 'SERVICE_ENGINEER', slaHours: 12 },
      { key: 'MATERIAL', name: 'Material Requirement & Availability', ownerRole: 'PROJECT_HEAD', slaHours: 72 },
      { key: 'EXECUTION', name: 'Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Close', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  NEW_WORK: {
    name: 'New Work',
    stages: [
      { key: 'SITE_VISIT', name: 'Site Visit', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'SCOPE', name: 'Scope & Estimate', ownerRole: 'PROJECT_HEAD', slaHours: 48 },
      { key: 'APPROVAL', name: 'Approval', ownerRole: 'SERVICE_HEAD', slaHours: 72 },
      { key: 'MATERIAL', name: 'Material', ownerRole: 'PROJECT_HEAD', slaHours: 72 },
      { key: 'EXECUTION', name: 'Execution', ownerRole: 'SERVICE_ENGINEER', slaHours: 48, requiredEvidence: true },
      { key: 'VERIFICATION', name: 'Verification & Closure', ownerRole: 'PROJECT_HEAD', slaHours: 24 },
    ],
  },
  EMERGENCY: {
    name: 'Critical Emergency',
    stages: [
      { key: 'ASSIGN', name: 'Immediate Assignment', ownerRole: 'PROCESS_COORDINATOR', slaHours: 1 },
      { key: 'EXECUTION', name: 'Emergency Action / Temporary Resolution', ownerRole: 'SERVICE_ENGINEER', slaHours: 4, requiredEvidence: true },
      { key: 'PERMANENT_RESOLUTION', name: 'Permanent Resolution', ownerRole: 'SERVICE_ENGINEER', slaHours: 24 },
      { key: 'ROOT_CAUSE', name: 'Root Cause Analysis', ownerRole: 'PROJECT_HEAD', slaHours: 48 },
      { key: 'VERIFICATION', name: 'Verification & Closure', ownerRole: 'SERVICE_HEAD', slaHours: 24 },
    ],
  },
};

const HOLD_REASON_LABELS: Record<string, string> = {
  WAITING_MATERIAL: 'Waiting for Material',
  WAITING_APPROVAL: 'Waiting for Approval',
  WAITING_REQUESTER: 'Waiting for Requester',
  SITE_ACCESS_ISSUE: 'Site Access Issue',
  SAFETY_RESTRICTION: 'Safety Restriction',
  EXTERNAL_VENDOR: 'External Vendor',
  TECHNICAL_CONSTRAINT: 'Technical Constraint',
  MANAGEMENT_HOLD: 'Management Hold',
  WEATHER: 'Weather',
  DEPENDENCY_ON_OTHER_WORK: 'Dependency on Other Work',
};
const CLOSURE_REASON_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  NOT_FEASIBLE: 'Not Feasible',
  DUPLICATE: 'Duplicate',
  NO_ACTION_REQUIRED: 'No Action Required',
};

export async function seedJobTypesAndPriorities() {
  const jobTypeRecords: Record<string, { id: string }> = {};
  for (const jt of JOB_TYPES) {
    jobTypeRecords[jt.code] = await prisma.jobType.upsert({ where: { code: jt.code }, create: { code: jt.code, name: jt.name }, update: {} });
  }
  const priorityRecords: Record<string, { id: string }> = {};
  for (const p of PRIORITIES) {
    priorityRecords[p.code] = await prisma.priority.upsert({ where: { code: p.code }, create: { code: p.code, name: p.name, rank: p.rank }, update: {} });
    await prisma.sLADefinition.deleteMany({ where: { scope: 'PRIORITY', priorityId: priorityRecords[p.code].id, stageKey: null } });
    // projectId/categoryId/stageKey explicit null, not omitted — this delete-then-create pair is
    // meant to make re-running bootstrap idempotent, but on MongoDB the deleteMany's `stageKey:
    // null` filter only matches documents where that field is present-and-null; omitting it here
    // would make every bootstrap run insert a duplicate row instead of replacing the old one.
    await prisma.sLADefinition.create({ data: { scope: 'PRIORITY', priorityId: priorityRecords[p.code].id, projectId: null, categoryId: null, stageKey: null, hours: p.hours } });
  }
  await prisma.sLADefinition.deleteMany({ where: { scope: 'GLOBAL', projectId: null, categoryId: null, priorityId: null, stageKey: null } });
  await prisma.sLADefinition.create({ data: { scope: 'GLOBAL', projectId: null, categoryId: null, priorityId: null, stageKey: null, hours: 48 } });
  return { jobTypeRecords, priorityRecords };
}

export async function seedWorkflowTemplates() {
  const templateRecords: Record<string, { id: string }> = {};
  for (const [key, def] of Object.entries(WORKFLOW_TEMPLATES)) {
    const template = await prisma.workflowTemplate.upsert({ where: { key }, create: { key, name: def.name }, update: { name: def.name } });
    templateRecords[key] = template;
    await prisma.workflowStageTemplate.deleteMany({ where: { workflowTemplateId: template.id } });
    for (const [i, stage] of def.stages.entries()) {
      await prisma.workflowStageTemplate.create({
        data: {
          workflowTemplateId: template.id,
          key: stage.key,
          name: stage.name,
          sequence: i + 1,
          ownerRole: stage.ownerRole,
          slaHours: stage.slaHours,
          requiredEvidence: stage.requiredEvidence ?? false,
        },
      });
    }
  }
  return templateRecords;
}

export async function seedReasonCodes() {
  for (const code of HOLD_REASONS) {
    await prisma.reasonCode.upsert({
      where: { category_code: { category: 'HOLD', code } },
      create: { category: 'HOLD', code, label: HOLD_REASON_LABELS[code] ?? code },
      update: {},
    });
  }
  for (const code of CLOSURE_REASONS) {
    await prisma.reasonCode.upsert({
      where: { category_code: { category: 'CLOSURE', code } },
      create: { category: 'CLOSURE', code, label: CLOSURE_REASON_LABELS[code] ?? code },
      update: {},
    });
  }
}
