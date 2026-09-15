# ServiceDesk

**Service Engineering & Job Card Management** for Neoteric Properties — replaces the FIR Card / Work Capture FMS spreadsheet-and-form process.

See `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `WORKFLOW.md`, `PERMISSIONS.md`, `SLA_RULES.md`, `MIGRATION_FMS.md` for the design docs behind this build, and the **Handoff** section below for exactly what was built, tested, and left as a gap.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind, TanStack Query, React Hook Form + Zod, React Router. Local `src/ui/` implements the Nexora component contracts (see `ARCHITECTURE.md` §6a for why — no `@neoteric/nexora-ui` package was available to install).
- **Backend**: Node.js + TypeScript + Express + Prisma. SQLite for local dev, PostgreSQL is the documented production target (`ARCHITECTURE.md` §2).
- **Auth**: local email+password JWT (access + refresh) as a stand-in for Nexora SSO, behind a single swappable module.
- **E2E**: Playwright, committed under `apps/web/e2e/`, run against real dev servers + seeded data.

## Quick start

```bash
npm install                                    # installs all workspaces
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

cd apps/api
npx prisma db push        # creates apps/api/prisma/dev.db
npm run seed               # seeds masters, roles, users, 6 demo Job Cards
npm run dev                 # http://localhost:4000

# new terminal
cd apps/web
npm run dev                 # http://localhost:5173
```

Demo logins (password `Password123!` for all): `admin@neotericgrp.in` (Master Admin), `servicehead@neotericgrp.in` (Service Head), `coordinator@neotericgrp.in` (Process Coordinator), `ph.gardencity@neotericgrp.in` (Project Head, Garden City + Garden City Club only), `arun.engineer@neotericgrp.in` / `meera.engineer@neotericgrp.in` (Service Engineers), `requester@neotericgrp.in` (Requester).

**Note on restarting the API**: dev uses a file-based SQLite database (`apps/api/prisma/dev.db`). An already-running `npm run dev` process holds that file open — if you delete/recreate `dev.db` to reseed from scratch, **stop the running server first**, or it keeps talking to the old file handle and `prisma db push`/your reseed silently affects nothing the running server can see. This exact mistake was made and caught during this build's own verification passes (see Handoff) — always: kill node processes → delete `dev.db` → `prisma db push` → `npm run seed` → start the server, in that order.

## Scripts (run from repo root, workspace-aware)

```bash
npm run typecheck     # all workspaces (apps/web also typechecks e2e/)
npm run lint          # api + web
npm run build         # shared -> api -> web
npm run test          # api (vitest)
```

Inside `apps/api`: `npm run prisma:migrate` (dev migrations), `npm run seed`.
Inside `apps/web`: `npm run test:e2e` (Playwright — requires both dev servers running and seeded; `npm run test:e2e:ui` for the interactive runner).

## Project layout

```
apps/api/     Express + Prisma backend — see ARCHITECTURE.md §3
apps/web/     React + Vite frontend; e2e/ holds the committed Playwright suite
packages/shared/   Zod schemas + status/role/permission enums shared by both
```

## Handoff

This is the second hardening pass over the initial L1 build (see `git log` for the two checkpoints). Priority was: secure attachment access, fill the missing Masters UI, add a real committed E2E suite, strengthen Process Coordinator intelligence, and re-review security/correctness — and fix whatever that review actually turned up, not just document it.

### Security fixes made this pass

- **Attachment access was unauthenticated.** Evidence files were served via a bare `express.static('/uploads')` mount — anyone with (or guessing) a file URL could read another project's photos, no session required. Replaced with `GET /jobs/:jobId/attachments/:attachmentId/file`: requires a valid session, re-derives authorization from the job (not the file), and checks the attachment actually belongs to that job — so copying an attachment's URL onto a different job id you *do* have access to still 404s. 6 tests in `apps/api/test/attachments.test.ts` cover this directly, including the "swap the job id" case. The frontend now fetches evidence as an authenticated blob (`AttachmentThumb.tsx`) instead of a plain `<img src>`.
- **Two lookup endpoints leaked the user directory to any authenticated session.** `GET /users/engineers/workload` (used by the Assign Engineer picker) and the new `GET /users/approvers` are now gated by `job.assign`/`job.reassign` and `approval.request` respectively, matching the permission of the action they feed, not left open behind bare auth.
- **JWT secrets had a hardcoded fallback** (`'dev-access-secret'`) that only the server's own startup check prevented from being used silently. `lib/auth.ts` now throws immediately if `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` aren't set, independent of that startup check.
- **Login had no rate limiting.** Added (`express-rate-limit`, keyed by IP, `LOGIN_RATE_LIMIT` env-configurable, default 200/15min — deliberately generous because this is an internal tool and the committed Playwright suite logs in ~80 times per run; tighten it for an internet-facing deployment).
- Re-confirmed: RBAC + project-scope 404-not-403 isolation, CSV/attachment file-type and size limits, no raw SQL/`dangerouslySetInnerHTML`/`eval` anywhere in the codebase (grepped), Prisma parameterized queries throughout, transactional writes for every multi-step state change.

### Real defects found via testing and fixed (not just documented)

Nearly all of these were caught by actually running the app and its tests, not by inspection:

1. **`JobCard.nextActionDueAt` — the field the Overdue KPI, attention queue, and reports all filter on — was never written by real application code**, only by a seed-script hack for one demo job. Every job created through the real API silently never showed as overdue, regardless of how late it actually was. Fixed at all four write sites (`createJobCard`, `advanceStage`, `activateStageIfPresent`, the reopen handler) plus the seed script's own demo-data helper. Confirmed live: a freshly-created job now gets a real `nextActionDueAt` from the moment it's created.
2. **Stage-advancement wrongly closed stages that only *start* work.** `start`→`EXECUTION` and `siteVisitStart`→`SITE_VISIT` were mapped as stage-*closing* commands, so starting work immediately marked that stage DONE and jumped the tracker to the next stage before any work happened. Split into a fixed-key map (commands that genuinely finish a stage) and a "close whatever's currently active" fallback (`assign`, `readyToStart`) for templates with no dedicated stage for that command. 7 regression tests in `apps/api/test/stageBookkeeping.test.ts` drive a full multi-stage template end to end and assert each stage's state after each command.
3. **`requestMaterial`/`requestApproval` never activated the MATERIAL/APPROVAL stage**, so the dashboard Bottleneck View was structurally blind to jobs genuinely stuck there even while `JobCard.status` correctly said `WAITING_MATERIAL`. Fixed with a template-aware `activateStageIfPresent()` that's a safe no-op when the job's template has no such stage (e.g. material discovered mid-`EXECUTION` on a `SIMPLE_REPAIR` job correctly leaves `EXECUTION` active rather than jumping stages).
4. **Completion evidence requirement was hardcoded `true`**, ignoring the per-workflow-stage `requiredEvidence` flag entirely — the Masters "Evidence Requirements" toggle (built this pass) would have silently done nothing. Now reads the actual `WorkflowStageTemplate.requiredEvidence` for the job's current stage, fail-safe (require evidence) if no matching stage template is found.
5. **Reopen left jobs in a `REOPENED` status with no valid next workflow command** — fixed last pass; this pass extended the same fix to the seed script's demo data helper, which had the identical bug independently.
6. **Bottleneck rows and dashboard drill-downs weren't clickable** — added a `stageKey` filter to `GET /jobs` and wired the Bottleneck View + Approvals tab + Assign Engineer flow to actually work end to end (previously backend-only or entirely missing from the UI).
7. **Accessibility**: an axe-core smoke test found the primary Button/Badge color pairings failing WCAG AA contrast (white-on-`#f97316` measured 2.8:1, needs 4.5:1 — same defect independently affected the sidebar logo, the active-nav-link text, danger badges, and the overdue-date red text). Added `*-strong` token shades (darker, same hue) used specifically for small text/small-element backgrounds on light surfaces, keeping the brand orange for large buttons/borders/icons where the pairing was already fine. Also fixed unlabeled `<select>`/`<input>` form controls and non-keyboard-focusable scrollable tables (mobile viewport only). All caught by a committed axe-core + Playwright accessibility suite, not manual inspection.

### What was built this pass

- **Masters UI, previously API-only**: Holiday Calendar, Workflow Templates (owner role / SLA hours / evidence-requirement editing, live-wired to the fix in item 4 above), SLA Rules (create + delete), Escalation Rules (configurable attention-queue thresholds, read by `attention/rules.ts` at query time with a documented fallback default), Hold/Closure/Cancellation/Reopen Reasons (curated against the shared Zod enums the hold/close endpoints actually validate against — never a free-for-all), **Legacy FMS Import** (see below).
- **Legacy FMS importer, from design doc to working feature**: CSV upload → header-alias mapping → per-row Project/Category/Job Type resolution (never a guess — ambiguous rows are flagged, not fabricated) → a six-way categorized report (Imported/Duplicate/Ambiguous/Skipped/Failed + batch warnings) → idempotent re-upload. 7 backend tests + 1 Playwright E2E test + a real screenshot-verified run through the UI. See `MIGRATION_FMS.md` for the full mapping table and what's still a draft pending the real source file.
- **Assign Engineer and Approval request/decide UI** — both existed as backend-only capability before this pass (the frontend had no way to trigger them at all). Assign Engineer shows each candidate's current active-job count (§27 "workload during assignment"); Approvals gained both a request form and Approve/Reject actions gated by `approval.decide`.
- **Process Coordinator attention queue expanded from 8 to 13 rules**: added no-update-in-N-hours, completion-evidence-missing, repeat-complaint-at-same-location, due-date-changed-multiple-times (backed by a new `dueDateChangeCount` field + `POST /jobs/:id/change-due-date` endpoint), and engineer-workload-overload. Every item now carries a uniform `{jobCardId, link}` shape so aggregate items (like engineer overload, which isn't about one Job Card) still navigate somewhere concrete (a filtered Job Card list) instead of nowhere.
- **Committed Playwright suite** (`apps/web/e2e/`, 78 tests across desktop + mobile viewports, 76 passing + 2 environment-dependent skips): auth (login/logout/invalid-credentials/permission-gated nav), dashboard (KPIs, project-health drill-down, bottleneck drill-down), the full Job Card lifecycle as one sequential flow (create → duplicate detection → assign → site visit → material dependency → approval dependency → ready-to-start → start → evidence-gated completion → verify → close → reopen), cross-project access denial, all 7 Masters tabs, My Jobs, Process Coordinator, legacy import, error handling (404s, session expiry, form-data preservation on failed submit), and an axe-core accessibility + dark-mode suite.

### Explicit, documented gaps (not silently skipped — see the relevant doc)

- **No real FMS export was ever available** — the importer works and is tested, but its header-alias mapping is a draft against the prompt's process description (`MIGRATION_FMS.md`), not verified real column names.
- **`@neoteric/nexora-ui` doesn't exist as an installable package** (`ARCHITECTURE.md` §6a) — a local equivalent implements the same contract.
- **Auth is local JWT, not real Nexora SSO** — deliberate, documented seam (`ARCHITECTURE.md` §4).
- **`findUniqueOrThrow` on master-id lookups** at Job Card creation surfaces as a generic 500 on a bad id rather than a clean 404/400 — low-traffic internal path, not yet hardened.
- **Category-level access scoping** (`UserProjectAccess.categoryScope`) is modeled but not enforced in query filters yet.
- **Engineer-overload threshold** (6 active jobs) is a hardcoded constant, not yet a Master-configurable `EscalationRule` like the other thresholds — the row shape doesn't cleanly fit "hours" semantics.
- **Not built**: Calendar/Planner view, hierarchical Building/Floor/Zone UI (API supports it, no screen exposes it), notification delivery beyond the `IN_APP` channel stub, IMS/VMS integration (deliberately stubbed per `ARCHITECTURE.md` §7), frontend component-level unit tests (Vitest is configured for `apps/web` but no test files exist yet — Playwright is the real frontend coverage this pass).
- **ESLint doesn't currently scan `apps/web/e2e/`** (only `src/`) — those files are typechecked (`npm run typecheck` covers them via `e2e/tsconfig.json`) but not linted.

### Verified state (this pass)

- **54 backend tests** passing (Vitest + Supertest) — up from 30: workflow transitions, business-hours SLA math, project/attachment-scope isolation, evidence-gated completion, the full multi-stage bookkeeping fix, 8 Process Coordinator rules, and 7 legacy-import scenarios.
- **76 Playwright tests passing** (2 skipped when seed data doesn't happen to have an engineer with assignments — a defensive skip, not a failure) across `chromium` (desktop) and a `Pixel 5` mobile profile, including a dedicated axe-core accessibility pass and a dark-mode persistence check.
- `npm run typecheck`, `npm run lint`, and `npm run build` are clean on both `apps/api` and `apps/web`.
- Every fix above was verified against a live, freshly-reseeded server — not inferred from reading the code.

### Production readiness before go-live

1. Point `DATABASE_URL`/`schema.prisma` provider at real PostgreSQL and run `prisma migrate deploy` (currently SQLite-only, by design — see `ARCHITECTURE.md` §2).
2. Replace local JWT auth with real Nexora SSO.
3. Tighten `LOGIN_RATE_LIMIT` for an internet-facing deployment (current default assumes an internal network).
4. Get the real legacy FMS export and correct `MIGRATION_FMS.md`'s header-alias table against it before trusting an import's Imported count.
5. Re-run the full quality gate (`typecheck`, `lint`, `test`, `test:e2e`, `build`) against the production build, not just `vite dev`/`tsx watch`.
