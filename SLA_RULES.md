# ServiceDesk — SLA Rules & Metric Definitions

## Principle (§8, §69)

No metric is ambiguous. Every duration has an explicit start event, end event, and pause rule, defined here and implemented in `apps/api/src/lib/slaEngine.ts` as pure functions over `JobCard`/`JobStage`/`SLAPause` rows — never eyeballed from `updatedAt`.

## Calendar

`SLADefinition` durations are expressed in **business hours**. The calendar (`apps/api/src/lib/businessCalendar.ts`) uses:
- configurable working days (seed default: Mon–Sat, matching typical Indian property-services staffing) and business hours (seed default 09:00–19:00),
- `Holiday` table (global or `projectId`-scoped) subtracted from elapsed time,
- timezone fixed to `Asia/Kolkata` for this deployment (§68 — only assumed because Neoteric Properties is an Indian entity per the source brief; flagged as an assumption, not a verified config value).

## SLA scope resolution order (§8)

For a given job + stage, the effective SLA hours = the most specific `SLADefinition` found, checked in order: `PRIORITY` + `stageKey` → `CATEGORY` + `stageKey` → `PROJECT` + `stageKey` → `GLOBAL` + `stageKey` → same chain without `stageKey` (whole-job SLA) → hardcoded fallback (48 business hours) if nothing is configured, so a job is never silently SLA-less.

## Definitions

- **Job created time**: `JobCard.createdAt`.
- **Stage entered time / planned completion**: `JobStage.actualStartAt` / `JobStage.plannedDueAt` (planned = entered time + resolved SLA hours, computed at the moment the stage activates so later SLA-config edits don't retroactively rewrite it).
- **Stage actual completion**: `JobStage.actualCompletedAt`.
- **Delay**: `max(0, actualCompletedAt − plannedDueAt)` in business hours; `null` while the stage is still open (an open stage is "at risk", not "delayed", until it actually passes its due time — see Attention Queue rules).
- **Delay owner**: `JobStage.ownerRole` at the time the stage was open — i.e. whoever the stage was assigned to when the clock was running, not whoever holds the job now. This directly implements §8's "never make the Service Engineer responsible for delays created by another stage."
- **Total job SLA / total active processing time**: sum of each `JobStage` duration where `ownerRole = SERVICE_ENGINEER` and the stage was not paused.
- **Total waiting time**: sum of durations where `JobStage.status = BLOCKED` (waiting on material/approval/vendor) — independent of hold.
- **Hold time**: sum of `Hold.endAt − Hold.startAt` across all holds on the job.
- **Approval waiting time**: `Approval.decisionAt − Approval.requestedAt` per approval, summed.
- **Material waiting time**: `MaterialRequirement` time from `status=REQUIREMENT_RAISED` to `status in (AVAILABLE, ISSUED, RECEIVED, NOT_AVAILABLE, CANCELLED)`.
- **SLA pause**: an `SLAPause` row with `startAt`/`endAt`/`reason`/`accountableParty`. While a pause is open, `businessCalendar` excludes that interval from every delay calculation above for that job. A hold only pauses SLA when `Hold.slaPauses = true` (Process Coordinator/Project Head decides this per-hold, per §20).

## Delay-responsibility buckets (§8, used directly by the Delay Responsibility report, §33)

`ENGINEER_DELAY | APPROVAL_DELAY | MATERIAL_DELAY | REQUESTER_DELAY | VENDOR_DELAY | MANAGEMENT_HOLD` — derived, not stored: computed by summing the relevant stage/hold/dependency durations above per job and attributing the largest bucket as the job's primary delay reason. Never a single free-typed field.

## Report-level metric definitions (§69)

- **Open Jobs**: `status NOT IN (CLOSED, CLOSED_NOT_FEASIBLE, CLOSED_DUPLICATE, CLOSED_NO_ACTION, CANCELLED)`.
- **Overdue**: `nextActionDueAt < now()` OR `targetCompletionAt < now()` while status is open (either condition, whichever is set — a job always has at least one due-type field once assigned).
- **At risk**: open, not yet overdue, but `nextActionDueAt` within the configured warning window (seed default 4 business hours — matches §22 "Due within 4 hours").
- **Resolution Time**: `JobCard.closedAt − JobCard.createdAt` in business hours, for the *first* closure only (a reopened-then-reclosed job keeps its original resolution time separately from `ReopenEvent`-to-second-close time, so reopen cycles don't quietly deflate the average).
- **Reopen Rate**: `count(distinct jobs with reopenCount > 0) / count(distinct closed jobs)` over the reporting period.
