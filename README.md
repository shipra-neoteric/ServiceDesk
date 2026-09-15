# ServiceDesk

**Service Engineering & Job Card Management** for Neoteric Properties — replaces the FIR Card / Work Capture FMS spreadsheet-and-form process.

See `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `WORKFLOW.md`, `PERMISSIONS.md`, `SLA_RULES.md`, `MIGRATION_FMS.md` for the design docs behind this build, `DEPLOYMENT.md` for deploying to MongoDB Atlas + Render + Vercel, and the **Handoff** section below for exactly what was built, tested, and left as a gap.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind, TanStack Query, React Hook Form + Zod, React Router. Local `src/ui/` implements the Nexora component contracts (see `ARCHITECTURE.md` §6a for why — no `@neoteric/nexora-ui` package was available to install).
- **Backend**: Node.js + TypeScript + Express + Prisma. MongoDB Atlas (a free M0 cluster works for local dev too — see `DEPLOYMENT.md`), so local dev and production point at the same database technology.
- **Auth**: local email+password JWT (access + refresh) as a stand-in for Nexora SSO, behind a single swappable module.
- **E2E**: Playwright, committed under `apps/web/e2e/`, run against real dev servers + seeded data.

## Quick start

```bash
npm install                                    # installs all workspaces
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/api/.env: set DATABASE_URL to a real MongoDB Atlas connection string (a free M0
# cluster works — Atlas runs every tier as a replica set, which Prisma's transactions require).

cd apps/api
npx prisma db push        # syncs collections/indexes to your Atlas cluster
npm run seed               # seeds masters, roles, users, 6 demo Job Cards
npm run dev                 # http://localhost:4000

# new terminal
cd apps/web
npm run dev                 # http://localhost:5173
```

Demo logins (password `Password123!` for all): `admin@neotericgrp.in` (Master Admin), `servicehead@neotericgrp.in` (Service Head), `coordinator@neotericgrp.in` (Process Coordinator), `ph.gardencity@neotericgrp.in` (Project Head, Garden City + Garden City Club only), `arun.engineer@neotericgrp.in` / `meera.engineer@neotericgrp.in` (Service Engineers), `requester@neotericgrp.in` (Requester).

**Note on reseeding**: `npm run seed` is idempotent-ish per record (upserts most masters) but demo Job Cards are recreated fresh each run. To fully reset, drop the database's collections from the Atlas UI (or `mongosh`) rather than deleting a file — there is no local `dev.db` anymore now that the datasource is MongoDB, so the old "kill node processes before deleting the SQLite file" gotcha no longer applies.

## Scripts (run from repo root, workspace-aware)

```bash
npm run typecheck     # all workspaces (apps/web also typechecks e2e/)
npm run lint          # api + web
npm run build         # shared -> api -> web
npm run test          # api (vitest)
```

Inside `apps/api`: `npm run prisma:push` (sync schema to Atlas — MongoDB has no `migrate`, only `db push`), `npm run seed`.

**Note on `packages/shared`**: it's an npm workspace package, and its `package.json` `main`/`types` point at the *compiled* `dist/`, not `src/` — required so `node dist/index.js` (the real production start command, not `tsx watch`) can actually resolve it; a plain Node ESM runtime cannot import raw `.ts` files. If you edit `packages/shared/src/*`, run `npm run build --workspace packages/shared` before your changes show up in a running `apps/api`/`apps/web` dev server (`tsx watch` and Vite both resolve the package the same way Node does).
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

### Deployment hardening pass (MongoDB Atlas + Render/Vercel)

Preparing this repo for an actual Render (backend) + Vercel (frontend) deployment surfaced one datasource decision and one real, previously-undiscovered production bug:

- **Datasource switched from SQLite (dev) / documented-but-never-verified PostgreSQL (prod) to MongoDB Atlas for both.** Neither Render's nor Vercel's filesystem survives a redeploy, so file-based SQLite was never viable in production; Atlas was chosen (over actually provisioning Postgres) specifically for this deployment. See `ARCHITECTURE.md` §2 for the full reasoning, `schema.prisma`'s header comment for the Mongo-specific modeling notes (ids keep `cuid()` mapped onto `_id` rather than switching to `ObjectId`; the two pure join tables `RolePermission`/`UserRole` moved from a composite `@@id` — unsupported on Mongo — to their own `id` plus `@@unique`; several relations needed explicit `onDelete`/`onUpdate: NoAction` to break cascade cycles the Mongo connector's emulated referential actions can't resolve otherwise). No application code changed — the codebase never used raw SQL or native DB enums, so this was a schema-and-tooling change only, confirmed by `npm run typecheck` and a full `npm run build` staying clean throughout.
- **Real bug found: `node dist/index.js` — the actual production start command — could not boot at all.** `packages/shared`'s `package.json` pointed `main`/`types` at raw `.ts` source, which only ever worked because local dev and tests both use TS-transpiling runners (`tsx`, Vitest/Vite). A plain Node ESM process cannot load `.ts` files, so a real production start would have failed immediately with `ERR_MODULE_NOT_FOUND`. This was never caught before because nobody had run the actual compiled-and-started production artifact end to end. Fixed by pointing `main`/`types` at `./dist/index.js`/`./dist/index.d.ts`; verified by deleting all `dist/` output, running the root `npm run build` (shared → api → web) from clean, and then actually starting `node apps/api/dist/index.js` and confirming it listens on its port. Tradeoff documented in this README's Scripts section: editing `packages/shared/src` now requires rebuilding it before a running dev server picks up the change.
- **Test harness rewritten for Mongo.** The old `test/globalSetup.ts` reset state by deleting a local SQLite file — there's no equivalent for a remote Atlas cluster. It now requires a separate `TEST_DATABASE_URL` (refuses to start if unset or equal to `DATABASE_URL`) and drops that database via `prisma.$runCommandRaw({ dropDatabase: 1 })` before each run.
- **Production-safe bootstrap seed added** (`src/seed/bootstrap.ts`, `npm run bootstrap`): seeds only structural configuration the app cannot function without (roles/permissions, job types, priorities + SLA defaults, workflow templates, hold/closure reason codes) and, from `BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD`/`NAME`, exactly one real Master Admin account — deliberately no demo projects, users, or Job Cards. `seed.ts` (demo data, unchanged behavior) now reuses the same shared seeding functions instead of duplicating them.
- **Not verified end-to-end**: no MongoDB Atlas cluster was available in this environment. Schema validation, Prisma Client generation, `npm run typecheck`, and the full `npm run build` were all confirmed clean against the new schema, and the test harness was confirmed to fail at exactly the expected point (DNS resolution of a placeholder Atlas hostname) rather than a code error — but the backend test suite, `npm run seed`/`npm run bootstrap`, and the app's actual runtime behavior against a real Mongo replica set have **not** been run. Before go-live: create a real Atlas cluster (a free M0 works, including for the E2E/test databases), set `DATABASE_URL`/`TEST_DATABASE_URL`, and re-run `npm run test --workspace apps/api` and the full Playwright suite.
- **Attachment storage is local disk** (`apps/api/uploads/`, `multer.diskStorage`) — this was already true before this pass, but matters now: Render's default web service filesystem is ephemeral (wiped on every redeploy and on restart), so evidence photos would silently disappear. Before go-live, either attach a Render persistent Disk mounted over the `uploads` directory, or move to object storage (S3-compatible) — not done here, since it's a storage-architecture decision, not a deployment-config one.

### Explicit, documented gaps (not silently skipped — see the relevant doc)

- **No real FMS export was ever available** — the importer works and is tested, but its header-alias mapping is a draft against the prompt's process description (`MIGRATION_FMS.md`), not verified real column names.
- **`@neoteric/nexora-ui` doesn't exist as an installable package** (`ARCHITECTURE.md` §6a) — a local equivalent implements the same contract.
- **Auth is local JWT, not real Nexora SSO** — deliberate, documented seam (`ARCHITECTURE.md` §4).
- **`findUniqueOrThrow` on master-id lookups** at Job Card creation surfaces as a generic 500 on a bad id rather than a clean 404/400 — low-traffic internal path, not yet hardened.
- **Category-level access scoping** (`UserProjectAccess.categoryScope`) is modeled but not enforced in query filters yet.
- **Engineer-overload threshold** (6 active jobs) is a hardcoded constant, not yet a Master-configurable `EscalationRule` like the other thresholds — the row shape doesn't cleanly fit "hours" semantics.
- **Not built**: Calendar/Planner view, hierarchical Building/Floor/Zone UI (API supports it, no screen exposes it), notification delivery beyond the `IN_APP` channel stub, IMS/VMS integration (deliberately stubbed per `ARCHITECTURE.md` §7), frontend component-level unit tests (Vitest is configured for `apps/web` but no test files exist yet — Playwright is the real frontend coverage this pass).
- **ESLint doesn't currently scan `apps/web/e2e/`** (only `src/`) — those files are typechecked (`npm run typecheck` covers them via `e2e/tsconfig.json`) but not linted.
- **No MongoDB Atlas cluster has been run against yet** (see "Deployment hardening pass" above) — the backend test suite, seed/bootstrap scripts, and real runtime behavior are unverified against an actual Mongo replica set.
- **Attachments are stored on local disk**, which does not survive a Render redeploy without an attached persistent Disk (or a move to object storage) — see "Deployment hardening pass" above.

### Verified state (this pass)

- **54 backend tests** passing (Vitest + Supertest) as of the last run against SQLite, before this session's MongoDB Atlas switch — up from 30: workflow transitions, business-hours SLA math, project/attachment-scope isolation, evidence-gated completion, the full multi-stage bookkeeping fix, 8 Process Coordinator rules, and 7 legacy-import scenarios. **Not yet re-run against MongoDB** (no Atlas cluster available in this environment — see above); the schema/tooling change itself needed no application-code changes, but the suite should be re-run against real Atlas before relying on this count again.
- **76 Playwright tests passing** (2 skipped when seed data doesn't happen to have an engineer with assignments — a defensive skip, not a failure) across `chromium` (desktop) and a `Pixel 5` mobile profile, including a dedicated axe-core accessibility pass and a dark-mode persistence check. Also run against the pre-Atlas SQLite datasource; not yet re-run since.
- `npm run typecheck`, `npm run lint`, and `npm run build` are clean on both `apps/api` and `apps/web`, confirmed fresh against the MongoDB schema in this session, including an actual `node apps/api/dist/index.js` boot from a clean build (see "Deployment hardening pass" above).
- Every fix above was verified against a live, freshly-reseeded server — not inferred from reading the code.

### Production readiness before go-live

1. Provision a MongoDB Atlas cluster (a free M0 works), point `DATABASE_URL` at it, run `npm run prisma:deploy` (`prisma db push`) and `npm run bootstrap` (creates roles/permissions/workflow templates and, if `BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD` are set, the first Master Admin account — see `src/seed/bootstrap.ts`), then re-run `npm run test --workspace apps/api` and the Playwright suite against it before trusting those pass counts again. See `DEPLOYMENT.md`.
2. Attach a Render persistent Disk over `apps/api/uploads/` (or migrate attachment storage to S3-compatible object storage) before real evidence photos are uploaded — Render's default filesystem does not survive a redeploy.
3. Replace local JWT auth with real Nexora SSO.
4. Tighten `LOGIN_RATE_LIMIT` for an internet-facing deployment (current default assumes an internal network).
5. Get the real legacy FMS export and correct `MIGRATION_FMS.md`'s header-alias table against it before trusting an import's Imported count.
6. Re-run the full quality gate (`typecheck`, `lint`, `test`, `test:e2e`, `build`) against the production build, not just `vite dev`/`tsx watch`.
