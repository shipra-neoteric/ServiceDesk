# Ready-to-Use AI Build Prompt

Copy the prompt below into Claude Code, Codex or another coding agent and replace bracketed values.

```text
Build [SYSTEM NAME], a production-ready standalone module for Neoteric Properties that is visually and technically consistent with Nexora.

Read and follow these files before changing code:
- NEXORA_UI_UX_GUIDE.md
- NEXORA_DESIGN_TOKENS.md
- NEXORA_COMPONENT_LIBRARY.md
- NEXORA_TECH_STACK.md
- NEXORA_FRONTEND_STANDARDS.md
- NEXORA_NEW_PROJECT_STARTER.md

Product scope:
- Users: [USERS]
- Roles and permissions: [ROLES]
- Core workflows: [WORKFLOWS]
- Required integrations: [INTEGRATIONS]
- Data sensitivity: [LEVEL]
- Backend/API source of truth: [CONFIRMED STACK OR API]

Non-negotiable requirements:
1. Use React, TypeScript and Vite unless the confirmed existing repository requires otherwise.
2. Use Tailwind with Nexora semantic tokens and the shared @neoteric/nexora-ui package. Do not invent a parallel design system.
3. Reproduce Nexora’s responsive AppShell: collapsible grouped sidebar, top utility bar, light/dark modes and compact operational density.
4. Use shared Button, Field, Card, KpiCard, Badge, DataTable, Toolbar, Drawer, Modal, Toast, EmptyState and PermissionGate components.
5. Long create/edit forms open in a right drawer: full width on mobile, max 672px on desktop, bordered header, scrollable body and sticky footer.
6. Use orange #f97316 only as the primary accent; semantic green/amber/red/blue for statuses. Never communicate status by color alone.
7. Implement loading, skeleton, empty, validation, API error, offline and permission-denied states.
8. Enforce authorization on the backend; UI hiding is not security.
9. Do not guess APIs, schemas, credentials or backend technology. Inspect the repository/contracts and report blockers.
10. Preserve existing user changes. Do not commit unless explicitly asked.

Engineering baseline:
- TypeScript strict mode
- React Router
- TanStack Query
- React Hook Form + Zod
- One typed API client
- Vitest + Testing Library
- Playwright for critical E2E
- ESLint and Prettier

Workflow:
1. Inspect the repository and write a short implementation plan.
2. Identify existing conventions and reuse them.
3. Build one end-to-end vertical slice.
4. Complete remaining features with shared components.
5. Run typecheck, lint, tests and production build.
6. Verify desktop, tablet, mobile and dark mode.
7. Report files changed, tests run, evidence, assumptions and unresolved risks.

Acceptance criteria:
- The app looks like a Nexora module, not a separate brand.
- All screens are responsive and keyboard usable.
- Mutations are duplicate-safe and provide clear feedback.
- Sensitive data and credentials are never logged or committed.
- A clean checkout can install, test and build reproducibly.
```

## Usage note

Attach all six referenced standards files with this prompt. Add screenshots only as visual reference; the written tokens and component contracts remain authoritative.
