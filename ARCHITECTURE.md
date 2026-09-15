# ServiceDesk — Architecture

## 1. Repository state at start of build

`C:\ServiceDesk` contained only the seven `NEXORA_*.md` standards files. No existing frontend, backend, database, CI config, or `FIR Card - Work Capture FMS` source export was present. This is therefore a **brand-new standalone repository**, not an extension of an existing Neoteric codebase. Per `NEXORA_NEW_PROJECT_STARTER.md` §"Before coding" and the master prompt §53, the backend is chosen here and documented rather than inferred from a UI that doesn't exist yet.

## 2. Backend decision

**Chosen stack: Node.js + TypeScript + Express + Prisma ORM + PostgreSQL (production) / SQLite (local dev only).**

Reasoning:

- **Language parity with the frontend.** The Nexora frontend baseline is React+TypeScript. Using TypeScript end-to-end lets domain types (statuses, workflow keys, permission keys) be shared verbatim between API and UI via a `packages/shared` workspace, which matters a lot here because the whole product is built around a strict, non-guessable state model (§6, §75 "do not use free text instead of structured operational statuses").
- **Prisma** gives migrations, a query builder with real `WHERE` composition (required for the project-scoped, permission-scoped queries in §38/§59), and transactional writes, which are mandatory for job-number sequencing (§67), workflow transitions (§45), and audit writes that must be atomic with the state change they describe.
- **PostgreSQL** is the documented production target because the domain needs relational integrity (foreign keys across Job Card → Stage → Material → Approval → Audit), row-level transactions, and will eventually need to support reporting queries (§33) that are painful on a document store. This satisfies §54's "avoid giant unstructured JSON records for core operational data."
- **SQLite for local development only.** No PostgreSQL/Docker was available in this environment to verify against. The Prisma schema is written in a portable subset (no native Postgres enums — status/role/category values are `String` columns validated by shared Zod enums instead) so the same schema file runs against SQLite in dev and Postgres in any real deployment by changing one `datasource` line and one `DATABASE_URL`. **This substitution is an explicit, documented gap** — before production rollout someone must point `DATABASE_URL` at a real Postgres instance, run `prisma migrate deploy`, and re-verify (see "Remaining Gaps" in the final handoff).
- Express (not NestJS) — kept deliberately thin: one auth middleware, one project-scope middleware, one permission middleware, one router per domain module. No framework magic to audit.

Rejected without evidence of a company standard: Mongo/Firebase/Supabase (no transactional multi-document guarantees without extra work — bad fit for workflow correctness), NestJS (adds DI ceremony not justified for team size/L1 scope).

## 3. Monorepo layout

```
C:\ServiceDesk\
  apps\
    api\            Express + TypeScript + Prisma backend
      prisma\schema.prisma
      src\
        modules\    one folder per domain module (jobs, materials, approvals, holds, ...)
        middleware\ auth, permission, projectScope, audit, errorHandler
        lib\        db client, sla engine, workflow engine, jobNumber sequence, pdf
        seed\       dev seed data
    web\            React + TypeScript + Vite + Tailwind frontend
      src\
        app\        router, providers, AppShell wiring, PermissionGate
        features\   one folder per domain module, mirrors backend modules
        lib\        api client, query keys, date/format helpers
        styles\     nexora tokens + tailwind entry
  packages\
    shared\         zod schemas + TS types + permission/status enums shared by both apps
  ARCHITECTURE.md, DOMAIN_MODEL.md, WORKFLOW.md, PERMISSIONS.md, SLA_RULES.md, MIGRATION_FMS.md, README.md
```

## 4. Authentication

No Nexora SSO contract was available to integrate against (§35/§37 of the tech stack doc: "Google Identity Services plus password and OTP options" was observed only from the outside of production Nexora; no API contract). L1 implements **local email+password JWT auth** (access + refresh token, bcrypt password hash) behind a single `AuthProvider`/`lib/auth.ts` seam on both sides, so swapping in real Nexora SSO later means replacing one login endpoint and one token-verification middleware, not rearchitecting permission/project-scope logic (which is fully independent of how the user authenticated). This is a documented integration seam per §70, not a fake integration.

## 5. Authorization model

Two independent, server-enforced layers, both re-checked on every request (§37, §38):

1. **RBAC** — `Permission` rows keyed by dotted action strings (`job.create`, `job.assign`, ...) per §37. Users get permissions via `Role` → `RolePermission` → `UserRole`. A `requirePermission('job.assign')` middleware runs before the route handler.
2. **Project scope** — `UserProjectAccess(userId, projectId, accessLevel)`. Every job/material/approval query is filtered server-side by the caller's accessible project IDs; `job.view_all_projects` permission bypasses the filter for management roles. A user cannot read or mutate a Job Card in a project they aren't mapped to, regardless of URL/body content — enforced in a shared `scopeToProjects()` query helper used by every module, and covered by an integration test (§38: "Test this").

## 6. Workflow & SLA engine

See `WORKFLOW.md` and `SLA_RULES.md`. Both are data-driven (`WorkflowTemplate`/`WorkflowStageTemplate`/`SLADefinition` tables), not hardcoded switch statements, so Master Admin can add stages/SLAs without a code deploy (§7 "robust configurable foundations even if initial UI exposes only necessary configuration").

## 6a. `@neoteric/nexora-ui` — not published/installable, so a local equivalent was built

`NEXORA_COMPONENT_LIBRARY.md` mandates importing shared primitives from a versioned `@neoteric/nexora-ui` package. No such package exists on any registry reachable from this environment, and no source for it was included in this repository. Rather than fabricate a fake dependency or silently skip the contract, `apps/web/src/ui/` implements the exact component contracts from that document (`Button`, `IconButton`, `Field`, `Card`, `KpiCard`, `Badge`, `DataTable`, `Toolbar`, `Drawer`, `Modal`, `Toast`, `EmptyState`, `PermissionGate`, plus `AppShell`/`PageHeader`) against the same tokens, sizes, and states specified in the guide. **This is a documented gap**: when the real `@neoteric/nexora-ui` package becomes available, `apps/web/src/ui/index.ts`'s export surface is designed to be replaced by a single import swap, since every feature file imports these primitives from `../../ui` rather than the individual component files.

## 7. Integration seams (not implemented, deliberately stubbed)

| Future system | Seam provided now |
| --- | --- |
| IMS (inventory) | `MaterialRequirement.externalRef` nullable string + `status` enum that already includes IMS-shaped states (Reserved/Issued/Received); ServiceDesk never models stock levels. |
| VMS (vendor mgmt) | `VendorDependency.vendorRef` nullable string; ServiceDesk owns only the service-dependency, not vendor master data. |
| Nexora SSO | Single `lib/auth.ts` module + `POST /auth/login`; swappable without touching RBAC/project-scope code. |
| Notifications (Slack/email/WhatsApp) | `Notification` table + `NotificationChannel` adapter interface with one working `IN_APP` implementation; new channels implement the same interface. |
| Future AI Process Coordinator agent | Attention-queue rules (§23) are implemented as pure functions over normalized data (`apps/api/src/modules/attention/rules.ts`) returning typed `AttentionItem[]`, exposed over a plain REST endpoint — an agent can consume the same endpoint a human dashboard uses. |

## 8. What "done" means for this build

Given the size of the master prompt (80 sections describing a multi-quarter enterprise system), this build prioritizes: a real, correctly-modeled data layer; enforced RBAC/project-scoping; a working end-to-end vertical slice (create → triage → assign → site visit → material/approval → execute → complete → verify → close → reopen); the Process Coordinator attention queue; and a management dashboard — all built for real, tested, and verified running. Breadth items (full Masters UI for every list, every report, PDF export, full legacy import tool, Playwright coverage of every edge case in §44) are implemented where time allows and otherwise explicitly listed as gaps in the final handoff rather than stubbed and left silently unfinished. See the handoff report at the end of this build for exactly what was verified.
