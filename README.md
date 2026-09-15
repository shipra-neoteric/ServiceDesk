# ServiceDesk

**Service Engineering & Job Card Management** for Neoteric Properties — replaces the FIR Card / Work Capture FMS spreadsheet-and-form process.

See `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `WORKFLOW.md`, `PERMISSIONS.md`, `SLA_RULES.md`, `MIGRATION_FMS.md` for the design docs behind this build, and the **Handoff** section below for exactly what was built, tested, and left as a gap.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind, TanStack Query, React Hook Form + Zod, React Router. Local `src/ui/` implements the Nexora component contracts (see `ARCHITECTURE.md` §6a for why — no `@neoteric/nexora-ui` package was available to install).
- **Backend**: Node.js + TypeScript + Express + Prisma. SQLite for local dev, PostgreSQL is the documented production target (`ARCHITECTURE.md` §2).
- **Auth**: local email+password JWT (access + refresh) as a stand-in for Nexora SSO, behind a single swappable module.

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

**Note on restarting the API**: because dev uses a file-based SQLite database (`apps/api/prisma/dev.db`), an already-running `npm run dev` process holds that file open. If you delete/recreate `dev.db` (e.g. to reseed from scratch), stop the running server first — otherwise it keeps talking to the old file handle and `prisma db push` will report "already in sync" against a database you didn't intend to touch. This is exactly the mistake caught and fixed during this build's own verification pass (see Handoff).

## Scripts (run from repo root, workspace-aware)

```bash
npm run typecheck     # all workspaces
npm run lint          # api + web
npm run build         # shared -> api -> web
npm run test          # api (vitest) + web
```

Inside `apps/api`: `npm run prisma:migrate` (dev migrations), `npm run seed`.

## Project layout

```
apps/api/     Express + Prisma backend — see ARCHITECTURE.md §3
apps/web/     React + Vite frontend
packages/shared/   Zod schemas + status/role/permission enums shared by both
```

## Handoff

### What was built and verified

- **Domain model & migrations**: full Prisma schema (`apps/api/prisma/schema.prisma`) covering identity/RBAC, masters, intake, Job Cards, workflow stages, materials, approvals, vendor dependencies, holds, evidence, comments, verification, reopen, SLA, audit, notifications, and a legacy-import staging area. Applied and running against SQLite; `npx prisma db push` succeeds cleanly.
- **Workflow engine**: 4 templates (Simple Repair, Material Required, New Work, Emergency) with a named-command transition table (`apps/api/src/lib/workflowEngine.ts`) — impossible transitions return `409` with the allowed-from list, verified by test.
- **SLA engine**: business-hours calendar (weekends + holidays excluded), scope-resolution order (priority → category → project → global → fallback), delay-responsibility attribution by stage owner role. Unit-tested (`test/businessCalendar.test.ts`).
- **RBAC + project scoping**: permission-key middleware plus a project-scope query filter; a user outside a project's access gets `404` (not `403`) on that job. Verified by an integration test that actually logs in as two different users and checks cross-project isolation, and by a live Playwright run against Garden City Project Head vs. Process Coordinator logins.
- **Job Card lifecycle API**: create (with duplicate detection), assign, site visit start/complete, materials, approvals, ready-to-start, start, partial, complete (blocks without an AFTER-phase evidence attachment — verified by test), verify, close (including the Not Feasible/Duplicate/No Action short-circuit path), reopen, cancel, hold/resume (with SLA pause), comments, attachments (type/size validated), PDF export.
- **Process Coordinator attention queue**: 8 deterministic rules (overdue, at-risk, no-owner, material-blocked >48h, approval-overdue >24h, hold-review-expired, reopened, verification-pending >24h) as pure functions over normalized data, exposed as plain JSON so a future automation agent can consume the same endpoint a human does.
- **Dashboard**: KPI strip (click-through to filtered Job Card lists), project health table, engineer workload, stage bottleneck view.
- **Frontend**: full Nexora-styled AppShell (collapsible sidebar, dark mode, permission-aware nav), Job Card list with quick views + filters + pagination, Job Card detail (stage tracker, tabbed sections, contextual action buttons, evidence upload, comments), My Jobs (Overdue/Today/Blocked/Upcoming), create-Job-Card drawer with live duplicate warning, Masters and Users screens, Reports with CSV export.
- **Reports**: Open Job Aging, Overdue, Project Performance, Delay Responsibility, Reopened Jobs — JSON and CSV.
- **Tests**: 24 backend tests (Vitest + Supertest) covering workflow transitions, business-hours math, project-scope isolation, evidence-gated completion, and the reopen/stage-advance fixes below. `npm run typecheck`, `npm run lint`, and `npm run build` are all clean on both apps.
- **Live browser verification**: the app was actually run (both dev servers) and driven end-to-end with Playwright — login, dashboard, job list, job detail (all tabs), Process Coordinator queue, create-Job-Card (filled and submitted, landing on a real new Job Card), My Jobs — with zero browser console errors on the final pass. Three real bugs were found this way and fixed (not just noted):
  1. **Reopen dead-end**: `reopen` originally left a job in a bare `REOPENED` status with no valid next workflow command — fixed to reactivate the execution stage and land in `IN_PROGRESS` with a real owner and next action (`WORKFLOW.md` "Reopen").
  2. **Orphaned intake stage**: the first stage (e.g. `TRIAGE`) never closed because no single command targets it, leaving it "active" forever even after the job moved on — fixed by having stage advancement close every not-yet-done stage up to the command's target, not just the exact match.
  3. **Duplicate React key / bottleneck mis-grouping**: two workflow templates both had a stage keyed `ASSIGN` with different display names, which both crashed React's key uniqueness and semantically fragmented the bottleneck report — fixed by grouping bottlenecks by `stageKey` alone.

### Explicit, documented gaps (not silently skipped — see the relevant doc)

- **No real FMS export was available** to migrate from (`MIGRATION_FMS.md`) — the import framework and schema exist, but the column mapping is a draft against the prompt's process description, not a verified spreadsheet.
- **`@neoteric/nexora-ui` doesn't exist as an installable package** (`ARCHITECTURE.md` §6a) — a local equivalent was built to the same contract; swap-in seam is the single `apps/web/src/ui/index.ts` barrel.
- **Auth is local JWT, not real Nexora SSO** — deliberate, documented seam (`ARCHITECTURE.md` §4).
- **Uploaded evidence files are served unauthenticated** by path (`express.static('/uploads')`) for simplicity — fine for this demo, but before production this needs either signed URLs or an authenticated proxy route.
- **`findUniqueOrThrow` on master-id lookups** (project/category/priority at Job Card creation) surfaces as a generic 500 on a bad id rather than a clean 404/400 — low-traffic internal path, not yet hardened.
- **Category-level access scoping** (`UserProjectAccess.categoryScope`) is modeled but not enforced in query filters yet.
- **Not built in this pass**: Playwright E2E test files committed to the repo (verification was done manually via a throwaway script, documented above, not checked in as `apps/web` test suite), full Masters CRUD for holidays/workflow templates/SLA rules from the UI (API exists, UI is read-mostly), notification delivery beyond the `IN_APP` channel stub, Calendar/Planner view, hierarchical Building/Floor/Zone UI (API supports it), and IMS/VMS integration (deliberately stubbed per `ARCHITECTURE.md` §7).

### Production readiness before go-live

1. Point `DATABASE_URL`/`schema.prisma` provider at real PostgreSQL and run `prisma migrate deploy` (currently SQLite-only, by design — see `ARCHITECTURE.md` §2).
2. Replace local JWT auth with real Nexora SSO.
3. Gate `/uploads` behind auth.
4. Re-run the full quality gate (`typecheck`, `lint`, `test`, `build`) plus a fresh Playwright pass against the production build, not just `vite dev`.
