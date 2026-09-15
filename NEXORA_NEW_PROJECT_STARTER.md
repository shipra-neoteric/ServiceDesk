# Nexora New Project Starter

## Before coding

Capture: system name, owner, users, roles, data sensitivity, Nexora launch route, APIs, approval flow, audit requirements and expected mobile usage. Confirm the actual backend; do not infer it from the UI.

## Bootstrap checklist

1. Create React + TypeScript + Vite application.
2. Install the approved Node/package-manager versions and commit the lockfile.
3. Add Tailwind with the shared Nexora preset.
4. Install `@neoteric/nexora-ui` and render `AppShell` first.
5. Connect Nexora authentication and permission context.
6. Add routing, typed API client, query provider and error boundary.
7. Build one complete vertical slice before adding more screens.
8. Add tests and CI gates.

## Mandatory first slice

- Authenticated shell.
- Page header and role-aware primary action.
- Search/filter toolbar.
- Responsive list/table with skeleton, empty and error states.
- Right drawer for create/edit.
- Validation and save feedback.
- Dark-mode verification.

## Environment contract

```env
VITE_APP_NAME=
VITE_API_BASE_URL=
VITE_NEXORA_ORIGIN=
VITE_AUTH_CLIENT_ID=
VITE_ENVIRONMENT=development
```

Never commit real values. Validate environment variables during application startup and fail with a developer-readable message.

## Pull-request checklist

- Screens match Nexora tokens and density.
- All shared primitives come from the design-system package.
- No backend or database claim is based only on browser inspection.
- Permissions are enforced server-side.
- No mutation is possible from read-only roles.
- Tests cover success and failure paths.
- Responsive and dark modes reviewed.
- New components have stories and accessibility labels.
- Migration and rollback notes included for API/data changes.

## Release rule

A standalone app is “Nexora-compatible” only when it passes shared component version checks, SSO/role integration, responsive visual checks, critical E2E flows and security review.
