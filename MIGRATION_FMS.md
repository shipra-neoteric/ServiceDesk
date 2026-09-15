# ServiceDesk — Legacy FMS Migration

## Status: implemented and working, against a best-guess mapping — no real source export was ever available

The prompt refers to a historical source `FIR Card - Work Capture FMS`, but no such file, sheet export, or API was ever present in this repository or environment. The importer described below is fully built, tested (`apps/api/test/legacyImport.test.ts`, `apps/web/e2e/legacyImport.spec.ts`), and usable today from Masters → Legacy Import — but its column-header mapping is a **draft against the process description in the master prompt's §3**, not against verified real headers. Before a real production import, get the actual Google Sheet exported to CSV and check its real headers against the alias table below; add any missing aliases in `apps/api/src/modules/legacyImport/mapping.ts` rather than assuming this table is already correct.

## How it actually works (`apps/api/src/modules/legacyImport/`)

1. **Upload.** `POST /legacy-import` (Masters → Legacy Import in the UI) accepts a CSV, parsed with `csv-parse`. Header row + data rows are mapped to a `RawFmsRow` via `mapCsvRow()`, which matches headers case-insensitively against a documented alias list (`HEADER_ALIASES` in `mapping.ts`) — e.g. "Property", "Project" or "Site" all map to the same field. Unrecognized columns are ignored, not an error, since the real sheet may have extra columns we don't use.
2. **Per-row resolution — never a guess.** `importLegacyRow()` resolves Property → `Project`, Work Category → `WorkCategory`, and (optionally) Type of Work → `JobType` by case-insensitive exact-or-unique-substring match against real Master rows. If zero or more than one row matches, the row is marked **`AMBIGUOUS`** with the exact reason (e.g. `No unique Project match for "..."`) and nothing is created — the mapping table below is a starting point for aliases, not a substitute for real Master data existing.
3. **Six-way categorization**, persisted per row (`LegacyImportRow.status`) and summarized per batch (`LegacyImportBatch`):
   - **Imported** — created a new `ServiceRequest` + `JobCard` with `source = LEGACY_FMS`.
   - **Duplicate** — a `JobCard` with this exact `legacyRef` already exists (idempotent no-op — see below).
   - **Ambiguous** — Project/Category/Job Type didn't resolve to exactly one Master row.
   - **Skipped** — a required field (narration, property, or location) was blank.
   - **Failed** — an unexpected error during creation (captured verbatim in `reasonText`).
   - **Warnings** — batch-level advisory notes (e.g. "N rows were ambiguous — fix the source data or add the missing Master, then re-run").
4. **No fabricated structured status.** A row with a parseable **Actual/Completion date** imports as `CLOSED` with that date; everything else imports as `RAISED`, with the original free-text status preserved verbatim in `JobCard.legacyStatusText` and a system comment noting it needs human triage — per §46 "Do not claim historical spreadsheet statuses are perfectly reliable," nothing is coerced into a structured status the source data doesn't actually support.
5. **Idempotent by design, not by re-run bookkeeping.** `legacyRef` is either the row's own reference column or, if absent, a stable hash of `property|location|narration|planned` — re-uploading the identical file re-detects every row as `DUPLICATE` via that same computed ref and creates nothing new. Verified directly by test (`legacyImport.test.ts` "is idempotent").
6. **Marking.** Every imported `JobCard` and its `ServiceRequest` get `source = LEGACY_FMS`, plus `legacyRef`/`legacyPlannedDate`/`legacyActualDate`/`legacyStatusText`/`legacyDelayText` preserved from the source row.

## Column mapping (draft — verify against the real sheet)

| CSV header aliases (case-insensitive) | Field | Notes |
| --- | --- | --- |
| Reference, Ref, Row Ref, S.No, Sno, Id | `legacyRef` | Falls back to a content hash if absent |
| Property, Project, Site | Matched `Project` | Ambiguous if 0 or 2+ Master matches |
| Work Category, Category | Matched `WorkCategory` | Ambiguous if 0 or 2+ Master matches |
| Narration, Description, Problem Description, Issue | `ServiceRequest.narration` | Required — blank ⇒ Skipped |
| Type of Work, Job Type, Work Type | Matched `JobType` | Falls back to the seeded `SIMPLE_REPAIR` type if blank |
| Requester, Raised By, Reported By, Name | `ServiceRequest.requesterName` | Free text; defaults to "Unknown (legacy import)" |
| Desired Completion Date, Completion Date, Target Date | `JobCard.targetCompletionAt` | Accepts `DD/MM/YYYY`, `DD-MM-YYYY`, or ISO |
| Location, Exact Location, Area | `JobCard.locationText` | Required — blank ⇒ Skipped |
| Planned, Planned Date | `JobCard.legacyPlannedDate` | Verbatim, not coerced into SLA fields |
| Actual, Actual Date, Completion | `JobCard.legacyActualDate` | Presence ⇒ imported as `CLOSED` |
| Status | `JobCard.legacyStatusText` | Preserved verbatim, never parsed into the structured status enum |
| Time Delay, Delay | `JobCard.legacyDelayText` | Verbatim |

Location photographs, and the FMS's seven-stage discussion/permission workflow, are **not** synthesized into `JobStage`/`Attachment` rows in this pass — imported jobs get the normal `SIMPLE_REPAIR` (or matched `JobType`'s) workflow template with fresh stages, not a reconstruction of historical stage timing. This is a deliberate simplification: fabricating historical stage-by-stage timestamps the source sheet doesn't actually contain would be inventing data, not migrating it.

## Separation of historical vs. active (§46)

Imported jobs landing as `CLOSED` behave exactly like any other closed Job Card — reachable via the Job Card list's "Closed" quick view and via reports, not surfaced in the Process Coordinator attention queue or dashboards' open-work counts. Rows landing as `RAISED` (no completion date found) *do* appear as real, active, untriaged Job Cards — this is intentional: an "unstructured legacy status" is exactly the kind of thing the attention queue and Process Coordinator workflow exist to surface for human review, not something to hide.

## What's verified vs. still a draft

**Verified working**: upload → parse → per-row resolution → categorized report → idempotent re-run, backend (7 tests) and through the real UI (Masters → Legacy Import, 1 Playwright E2E test, screenshot-checked).

**Still a draft, pending the real source file**: every header alias and the assumption that "Actual date present" is the right signal for closure — both are informed guesses against the prompt's process description, not against verified column names. Treat the first real import as a dry run: check the Ambiguous/Skipped counts and warnings before trusting the Imported count.
