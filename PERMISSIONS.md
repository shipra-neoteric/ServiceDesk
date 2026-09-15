# ServiceDesk — Roles & Permission Matrix

## Roles (seeded)

| Role key | Typical user | Project scope |
| --- | --- | --- |
| `SERVICE_ENGINEER` | Field engineer executing jobs | One or several assigned projects |
| `PROJECT_HEAD` | Owns a property's operations | One or several projects |
| `PROCESS_COORDINATOR` | Runs the attention queue, follows up, escalates | Several or all projects |
| `SERVICE_HEAD` | Management/oversight | All projects, mostly read + escalate |
| `MASTER_ADMIN` | Configures masters, users, workflow, SLA | All projects |
| `REQUESTER` | Raises requests, views own requests, verifies own completion | One or several projects, own records only |

A user row can hold more than one `UserRole` and more than one `UserProjectAccess` row (§36 examples A/B/C are seed data — see `apps/api/src/seed`).

## Permission keys (§37, seeded into `Permission`)

```
job.create, job.view, job.view_all_projects, job.edit, job.assign, job.reassign,
job.change_priority, job.hold, job.resume, job.complete, job.verify, job.close,
job.reopen, job.cancel,
material.create, material.update,
approval.request, approval.decide,
report.view, report.export,
master.view, master.create, master.edit, master.delete,
user.view, user.create, user.edit, user.deactivate,
audit.view
```

## Role → permission grants (seed defaults)

| Permission | Engineer | Project Head | Process Coordinator | Service Head | Master Admin | Requester |
| --- | --- | --- | --- | --- | --- | --- |
| job.create | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| job.view | ✓ (own/assigned) | ✓ (own projects) | ✓ | ✓ | ✓ | ✓ (own) |
| job.view_all_projects | – | – | optional grant | ✓ | ✓ | – |
| job.edit | ✓ (assigned) | ✓ | ✓ | ✓ | ✓ | – |
| job.assign / reassign | – | ✓ | ✓ | ✓ | ✓ | – |
| job.change_priority | – | ✓ | ✓ | ✓ | ✓ | – |
| job.hold / resume | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| job.complete | ✓ | – | – | – | ✓ | – |
| job.verify | – | ✓ | ✓ | ✓ | ✓ | ✓ (own request only) |
| job.close | – | ✓ | ✓ | ✓ | ✓ | – |
| job.reopen | – | ✓ | ✓ | ✓ | ✓ | ✓ (own request only) |
| job.cancel | – | ✓ | ✓ | ✓ | ✓ | – |
| material.* / approval.request | ✓ | ✓ | ✓ | – | ✓ | – |
| approval.decide | – | ✓ | – | ✓ | ✓ | – |
| report.view / export | – | ✓ | ✓ | ✓ | ✓ | – |
| master.* | – | – | – | – | ✓ | – |
| user.* | – | – | – | view only | ✓ | – |
| audit.view | – | ✓ (own projects) | ✓ | ✓ | ✓ | – |

This table is seed data, not a hardcoded switch — Master Admin's User Management screen edits `RolePermission` rows directly, so the matrix above is the *default*, not a ceiling.

## Enforcement points (§37/§38 — server is authoritative)

1. `requireAuth` — verifies JWT, loads `User` + roles + permissions + project access onto `req.user`.
2. `requirePermission(key)` — 403 if the resolved permission set doesn't include `key`.
3. `scopeToProjects(req)` — every list/detail query for `JobCard`/`ServiceRequest`/reports is filtered to `req.user.projectIds` unless `job.view_all_projects` is present; a direct `GET /jobs/:id` for a job outside scope returns `404`, not `403`, to avoid confirming the record's existence to an unauthorized caller.
4. Frontend `PermissionGate` hides/disables controls for UX only — every gated action is re-checked in (1)-(3) server-side. Tested explicitly (`apps/api/test/jobLifecycle.test.ts`, project-scoping tests): a user without access to Project B gets `404` on Project B's job even when given a valid, well-formed job ID and a valid session. The same 404-not-403 pattern is verified for attachments in `apps/api/test/attachments.test.ts` (a user can't read another project's evidence file by guessing/copying its URL — see ARCHITECTURE.md §"Attachment security").
5. Two lookup endpoints that feed pickers, not mutations, are still gated by the permission of the action they support rather than being left open to any authenticated user: `GET /users/engineers/workload` requires `job.assign`/`job.reassign` (it's the Assign Engineer modal's data source), and `GET /users/approvers` requires `approval.request` (it's the Approvals-tab request form's data source) — neither is gated by `user.view`, since a Requester or Engineer has no legitimate reason to see the full user directory just because they can assign or request approvals.

## Project-scoped access model (§2, §38)

`UserProjectAccess(userId, projectId, accessLevel: FULL|READ_ONLY)`. `READ_ONLY` disables all `job.edit`-class permissions regardless of role grants, for e.g. a Service Head auditing a project they don't operationally own. Category-level scoping (§2 "particular job categories") is modeled as an optional `categoryScope: string[] | null` on the same row for future use; not yet enforced in L1 query filters — listed as a gap.
