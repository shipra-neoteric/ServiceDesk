# ServiceDesk — Domain Model

Source of truth is `apps/api/prisma/schema.prisma`; this document explains the *why* behind the shape, per §5/§54 ("do not collapse these concepts into one giant database table").

## Entity groups

### Identity & access
`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserProjectAccess`

A user can hold multiple roles and multiple project mappings simultaneously (§36 examples). `UserProjectAccess.accessLevel` is `FULL` or `READ_ONLY`; a `job.view_all_projects` permission (granted to Service Head-type roles) bypasses per-row project filtering entirely rather than requiring a row per project.

### Organization masters
`Project`, `Location` (self-referential: Building → Floor/Zone → Unit/Area, §32), `WorkCategory`, `WorkSubcategory`, `JobType`, `Priority`, `Holiday`

Masters are never hard-deleted once referenced (§62/§35). Every master row has `active: boolean`; deactivating hides it from new-record pickers but historical Job Cards keep their (now-inactive) reference intact.

### Intake
`ServiceRequest` — the raw complaint as reported (§5 "Request/Complaint"). Deliberately separate from `JobCard` because one request can be linked to an existing job (duplicate handling, §10) without ever becoming its own operational job, and because intake fields (requester, source, narration) are almost-never edited once execution starts, while Job Card fields change constantly.

### Operational core
`JobCard` — the permanent record (`jobNumber` e.g. `JC-2026-000001`, §67). Holds only the *current* pointer fields (`status`, `currentStageKey`, `currentOwnerUserId`, `nextAction`, `nextActionDueAt`) — never the history, which lives in `JobStage`/`AuditEvent`. This is what makes "every Job Card always has a clearly identifiable current state, current owner, next action" (§4) a query, not a computed guess.

`JobAssignment` — who is/was attached to a job and in what capacity (engineer, verifier, process coordinator, project head). Kept as a log (`active` boolean + `unassignedAt`) rather than a single FK on `JobCard`, because reassignment history and "who owned this at time T" (needed for delay attribution, §8) must survive reassignment.

`JobStage` — one row per stage instance for a given job, generated from the assigned `WorkflowTemplate`/`WorkflowStageTemplate` at creation time. Carries `plannedDueAt` vs `actualCompletedAt` — this is the persisted form of the FMS's "Planned → Actual → Status → Time Delay" concept (§3), generalized to any number of stages instead of the old fixed seven.

### Dependencies
`SiteVisit`, `MaterialRequirement`, `Approval`, `VendorDependency`, `Hold`

Each is its own table (§5 "Material Requirement", "Approval") specifically so management can query "how many jobs are blocked on material" without parsing comments (§44 second-order thinking, Material/Approval sections). `Hold` always requires `reasonCode`, `dependencyOwnerRole`, `reviewDueAt` — a hold with no review date cannot be created (§20, enforced in the API validator, not just UI).

### Evidence & communication
`Attachment` (photo/video/doc, tagged `phase: BEFORE|DURING|AFTER` and optional `stageKey`), `Comment` (`isSystem` flag separates human comments from system-generated timeline entries, §40)

### Closure lifecycle
`Verification`, `ReopenEvent` — both append-only. Closing a job never deletes or rewrites the `JobCard`'s prior completion fields; reopening creates a new `ReopenEvent` and flips status back into an active workflow state while the original `Verification`/completion rows remain queryable (§19 "Do NOT delete or overwrite prior completion history").

### SLA
`SLADefinition` (scope: GLOBAL/PROJECT/CATEGORY/PRIORITY, optional `stageKey`), `SLAPause` (reason, accountable party, start/end) — see `SLA_RULES.md`.

### Governance
`AuditEvent` — immutable, append-only, generic (`entityType`, `entityId`, `action`, `actorId`, `oldValue`/`newValue` JSON, `reason`). Every state-changing service function writes one in the same DB transaction as the mutation, never as an afterthought (§39, §45).

`Notification` — in-app only for L1 (§41), `channel` column ready for future adapters.

`Counter` — single-row-per-key table used inside a transaction to hand out the next `JC-YYYY-NNNNNN` number atomically (§67 "Sequence generation must be concurrency-safe").

## Why not one big `Job` table with 80 columns

Every dependency type (material, approval, vendor, hold) has its own lifecycle, its own owner, and its own "is this blocking the job" boolean that changes independently. Flattening them into `JobCard` columns would mean: no way to have two material requirements on one job (§21 partial completion — "20 lights required, 12 completed, 8 waiting"), no history when a hold is resumed and re-opened later, and no clean way to report "material delay vs approval delay" (§8) without brittle column-name parsing. The multi-table shape directly implements the domain separation mandated in §5.

## Deliberately deferred / simplified for L1

- `WorkflowStageTemplate` ownership is a role, not a named user — user-level auto-assignment rules are a Phase 5+ Masters feature, not built in this pass.
- `VendorDependency` has no vendor master table yet (§15: "ServiceDesk owns the service issue... Design an integration-ready reference model") — `vendorName`/`vendorRef` are free strings pending VMS integration.
- Location hierarchy depth is unbounded via self-reference but the UI only exercises 2 levels (Project → Area) in this pass; Building/Floor/Zone levels are modeled and API-usable but not yet exposed in every screen.
