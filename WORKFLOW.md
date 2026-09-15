# ServiceDesk — Workflow & State Model

## Top-level status (`JobCard.status`)

Implemented as a `String` column validated against a shared Zod enum (`packages/shared/src/statuses.ts`) rather than a native DB enum, so Master Admin can extend it later via a masters table without a schema migration. Values (§6):

```
DRAFT, RAISED, UNDER_TRIAGE, ASSIGNED, SITE_VISIT_PENDING, SITE_VISIT_COMPLETED,
DIAGNOSIS_PENDING, SCOPE_PENDING, WAITING_MATERIAL, WAITING_APPROVAL, READY_TO_START,
IN_PROGRESS, PARTIALLY_COMPLETED, WORK_COMPLETED, VERIFICATION_PENDING, CLOSED,
REOPENED, ON_HOLD, CANCELLED, CLOSED_NOT_FEASIBLE, CLOSED_DUPLICATE, CLOSED_NO_ACTION
```

`ON_HOLD` is an overlay, not a terminal replacement: entering hold snapshots the `status` the job was in (`Hold.statusBeforeHold`) so resuming returns the job to where it actually was, not to a hardcoded default.

## Transition rules

Transitions are not free-form `PATCH status=X`. Every transition is a **named command** (`POST /jobs/:id/<command>`), each with:
- allowed **from** statuses,
- required **role/permission**,
- required **payload** (e.g. `close` requires `closureReasonCode`; `hold` requires `reasonCode`+`reviewDueAt`),
- side effects (writes `JobStage`, `AuditEvent`, may write `SLAPause`).

Implemented in `apps/api/src/lib/workflowEngine.ts` as a transition table:

```ts
{ command: 'assign',   from: ['RAISED','UNDER_TRIAGE'],              to: 'ASSIGNED' }
{ command: 'siteVisitStart', from: ['ASSIGNED','SITE_VISIT_PENDING'], to: 'SITE_VISIT_PENDING' }
{ command: 'siteVisitComplete', from: ['SITE_VISIT_PENDING'],         to: 'SITE_VISIT_COMPLETED' }
{ command: 'requestMaterial', from: ['SITE_VISIT_COMPLETED','DIAGNOSIS_PENDING','IN_PROGRESS'], to: 'WAITING_MATERIAL' }
{ command: 'requestApproval', from: ['SITE_VISIT_COMPLETED','SCOPE_PENDING','WAITING_MATERIAL'], to: 'WAITING_APPROVAL' }
{ command: 'readyToStart', from: ['WAITING_MATERIAL','WAITING_APPROVAL','SITE_VISIT_COMPLETED'], to: 'READY_TO_START' }
{ command: 'start',    from: ['READY_TO_START','ASSIGNED','SITE_VISIT_COMPLETED'], to: 'IN_PROGRESS' }
{ command: 'partial',  from: ['IN_PROGRESS'],                         to: 'PARTIALLY_COMPLETED' }
{ command: 'complete', from: ['IN_PROGRESS','PARTIALLY_COMPLETED'],   to: 'WORK_COMPLETED', requiresEvidence: true }
{ command: 'verify',   from: ['WORK_COMPLETED'],                      to: 'CLOSED' | 'IN_PROGRESS' (rework) | 'PARTIALLY_COMPLETED' }
{ command: 'close',    from: ['WORK_COMPLETED','VERIFICATION_PENDING'], to: 'CLOSED' }
{ command: 'closeShortCircuit', from: ['RAISED','UNDER_TRIAGE','ASSIGNED'], to: 'CLOSED_NOT_FEASIBLE'|'CLOSED_DUPLICATE'|'CLOSED_NO_ACTION' }
{ command: 'hold',     from: [<any non-terminal>],                    to: 'ON_HOLD' }
{ command: 'resume',   from: ['ON_HOLD'],                             to: '<statusBeforeHold>' }
{ command: 'reopen',   from: ['CLOSED','CLOSED_NOT_FEASIBLE'],        to: 'REOPENED' }
{ command: 'cancel',   from: [<any non-terminal>],                    to: 'CANCELLED' }
```

An attempted transition outside its `from` set returns `409 Conflict` with the current status — this is what makes "a job cannot go directly from Raised to Closed" (§6) a server guarantee, not a UI convention. `closeShortCircuit` is the one deliberate exception path for "Closed — Not Feasible/Duplicate/No Action" (§6, §75 "Nothing can be done" must not become "Completed").

Emergency jobs (`JobCard.isEmergency`) use the same engine with a workflow template whose stage list is shorter (§7 Template D) — they are not a bypass of the state machine, only a different template.

## Workflow templates (§7)

`WorkflowTemplate` + `WorkflowStageTemplate` are DB rows, selected at Job Card creation by a deterministic rule function (`selectTemplate(jobType, hasMaterial, hasApproval, isEmergency)` in `apps/api/src/lib/workflowEngine.ts`), matching Templates A–D from the prompt:

| Template key | Selected when |
| --- | --- |
| `SIMPLE_REPAIR` | jobType = repair, no material/approval flagged at creation |
| `MATERIAL_REQUIRED` | material dependency indicated at creation or added during site visit |
| `NEW_WORK` | jobType = new work (implies scope + estimate + approval stages) |
| `EMERGENCY` | `isEmergency = true`, overrides the above |

Seeded stage lists match §7 exactly. Master Admin CRUD for templates is modeled (`WorkflowStageTemplate` table + API) but the L1 UI only exposes read + the four seeded templates; adding a template via UI (not just API/seed) is a listed gap.

## Stage tracker (`JobStage`)

Created in bulk from the chosen template when the Job Card is created, all `PENDING` except the first (`ACTIVE`). This is what powers the clickable stage tracker in §11/§12 — the UI never infers stage state from `JobCard.status` alone, it reads `JobStage[]` directly.

Only commands that represent a stage genuinely *finishing* close it (`assign`→ASSIGN, `siteVisitComplete`→SITE_VISIT, `complete`→EXECUTION, `close`→VERIFICATION — see `STAGE_KEY_FOR_COMMAND` in `apps/api/src/lib/workflowEngine.ts`). Commands that happen *inside* an already-active stage (`start`, `partial`, `siteVisitStart`, `requestMaterial`, `requestApproval`) intentionally close nothing — an earlier version of this file/code mapped `start`→EXECUTION and `siteVisitStart`→SITE_VISIT, which meant *starting* work immediately marked that stage DONE before any work happened; this was found and fixed via `test/stageBookkeeping.test.ts`.

Two commands close "whichever stage is currently ACTIVE" rather than one fixed key (`DYNAMIC_STAGE_CLOSE_COMMANDS`):
- **`readyToStart`** — reachable from a material-blocked, approval-blocked, or post-site-visit state depending on the template, so only "whatever's active right now" answers "which stage does this close."
- **`assign`** — SIMPLE_REPAIR/EMERGENCY have a dedicated ASSIGN stage (closed via the fixed key), but MATERIAL_REQUIRED/NEW_WORK go straight from TRIAGE to SITE_VISIT with no ASSIGN stage at all; for those, `assign` falls back to closing whatever's active (TRIAGE) instead of silently no-opping and leaving it stuck ACTIVE forever.

`requestMaterial`/`requestApproval` additionally *activate* (not close) the MATERIAL/APPROVAL stage via `activateStageIfPresent()` when the job's template actually has one positioned ahead of the current stage — a no-op for templates without that stage (e.g. material discovered mid-EXECUTION on a SIMPLE_REPAIR job correctly leaves EXECUTION active rather than jumping stages). This is what makes the Bottleneck View (§28) able to see jobs genuinely stuck on material/approval, not just jobs whose `JobCard.status` says so.

## Completion vs. Closure vs. Verification (§18)

Three distinct events, three distinct tables:
1. `complete` command → `WORK_COMPLETED`, requires at least one `Attachment(phase=AFTER)` when the resolved `WorkflowStageTemplate` for the final stage has `requiredEvidence=true` (configurable per template/category, not hardcoded globally).
2. `Verification` row created by verifier role → decision `VERIFIED|REJECTED|REWORK_REQUIRED|PARTIALLY_ACCEPTED`.
3. `close` only reachable after a `VERIFIED` (or role-permitted direct-close for categories configured to skip verification).

## Reopen (§19)

`reopen` is only valid from a closed state, requires `reason` + `reopenedById`, and creates a `ReopenEvent` without touching the prior `Verification`/completion history (§19 "Do NOT delete or overwrite"). It then puts the job back into an actionable state rather than leaving it in a `REOPENED` status with no valid next transition: the `EXECUTION` stage is reset to `ACTIVE` with a fresh SLA-computed due date, the `VERIFICATION` stage is reset to `PENDING`, and `JobCard.status` moves to `IN_PROGRESS` with `currentOwnerRole = SERVICE_ENGINEER` and `nextAction` set to the execution stage's name — so the assigned engineer immediately has a real next action instead of a dead end. `JobCard.reopenCount` increments; `reopenCount >= 2` is one of the Process Coordinator attention rules (§22).

## Hold (§20)

`hold` always requires `{ reasonCode, dependencyOwnerRole, reviewDueAt, comment, slaPauses: boolean }`. If `slaPauses`, an `SLAPause` row opens with `accountableParty = dependencyOwnerRole`; `resume` closes it. A hold with an expired `reviewDueAt` and no resume is surfaced by the Process Coordinator attention queue, never silently indefinite.
