# ServiceDesk — Legacy FMS Migration

## Status: framework only — no source export was available

The prompt refers to a historical source `FIR Card - Work Capture FMS`, but no such file, sheet export, or API was present in `C:\ServiceDesk` at build time. This document therefore specifies the **import framework and mapping contract** (§46) against the process description given in §3 of the prompt, not against verified column names. Before running a real import, the actual Google Sheet must be exported to CSV/XLSX and its real headers mapped through the tool described below — do not assume the field names guessed here are correct.

## Approach

1. **Two-tier landing.** Raw rows import first into a staging table (`LegacyImportRow`: `id, batchId, rawJson, rowNumber, sourceSheet`) with zero transformation — nothing is discarded before it's inspected.
2. **Mapping step.** A configurable column-mapping (`apps/api/src/lib/legacyImport/mapping.ts`) turns staging rows into `ServiceRequest` + `JobCard` + best-effort `JobStage` rows. Guessed mapping, to be corrected against the real sheet:

   | FMS concept (from §3) | ServiceDesk field |
   | --- | --- |
   | Property | `Project` (matched by name; unmatched → import error row, never silently dropped) |
   | Work category | `WorkCategory` (same matching rule) |
   | Desired completion date | `JobCard.targetCompletionAt` |
   | Location photographs | `Attachment(phase=BEFORE)` |
   | Narration | `ServiceRequest.narration` |
   | Type of work | `JobType` |
   | Requester | `ServiceRequest.requesterName` (free text; not matched to a `User` unless email/phone matches an existing account) |
   | Site visit / Discussion with PH / Material update / Communicate / Permission / Communicate to engineer / Work completion | Each becomes a best-effort `JobStage` row on a synthetic `LEGACY` workflow template with only `actualCompletedAt` populated where a timestamp existed in the sheet — planned/SLA fields are left null because legacy rows never had a real SLA target |
   | Planned / Actual / Status / Time Delay columns | Copied as-is into `JobCard.legacyPlannedDate` / `legacyActualDate` / `legacyStatusText` / `legacyDelayText` (kept verbatim, never coerced into the new structured `status` enum — see below) |

3. **No fabricated structured status.** Legacy `status`/"handle by X" free text is preserved verbatim in `legacyStatusText` and the row is otherwise imported as `CLOSED` (if the sheet shows a completion date) or `RAISED`/`ON_HOLD` with a mandatory `holdReason = LEGACY_UNSTRUCTURED` (if not) — per §46 "Do not claim historical spreadsheet statuses are perfectly reliable." A human must triage anything landed as `LEGACY_UNSTRUCTURED` before treating it as an active job.
4. **Marking.** Every imported `JobCard`/`ServiceRequest` gets `source = LEGACY_FMS` and `legacyRef` (original sheet row number / reference), satisfying §46.
5. **Idempotency.** Re-running an import batch with the same `batchId` and source file upserts by `legacyRef` instead of duplicating rows (§46 "rerunnable where practical").
6. **Validation report.** The import command returns `{ imported, skipped, errors: [{ row, reason }] }`; nothing fails silently, and the report itself is persisted (`LegacyImportBatch`) for audit.

## Separation of historical vs. active (§46)

Only rows that land as a genuinely open ServiceDesk status (not `CLOSED*`) appear in Process Coordinator/engineer/dashboard operational views. Everything else is reachable only via the Job Card list with an explicit "Include legacy/closed" filter and via reports — it does not pollute the active-work surfaces on day one.

## What is actually implemented in this pass vs. designed only

Implemented: `LegacyImportRow`/`LegacyImportBatch` schema, `source`/`legacyRef`/`legacyPlannedDate` etc. fields on `JobCard`, and the mapping module structure with unit tests against synthetic sample rows (since no real sheet export exists to test against).

Not implemented in this pass (gap, needs the real export first): a CSV/XLSX upload UI, and validation against actual FMS column headers. Treat the mapping table above as a draft to be corrected once the real file is provided.
