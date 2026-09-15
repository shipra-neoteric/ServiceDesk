# Nexora Tech Stack Baseline

## Production observations

| Area | Finding | Confidence |
| --- | --- | --- |
| Frontend | Single-page application with hashed `/assets/index-*.js` and `/assets/index-*.css` bundles | Verified |
| Build tooling | Vite-style production bundle naming and SPA delivery | Strong inference |
| UI framework | React-style component application | Strong inference from application behavior and build shape |
| Styling | Tailwind CSS utilities, responsive variants and `dark:` variants | Verified from rendered class names and compiled CSS |
| Typography | Inter with system fallbacks | Verified |
| Authentication | Google Identity Services plus password and OTP options | Verified |
| Hosting/edge | Cloudflare Insights beacon is present | Verified; hosting provider itself is not established |
| Backend/database | Not identifiable safely from the browser-only audit | Unknown |

Do not treat an unknown backend as permission to guess MongoDB, PostgreSQL, Express, Firebase or Supabase. Confirm from source repository, deployment configuration or API documentation before standardizing it.

## Recommended standalone-app baseline

- React + TypeScript + Vite.
- Tailwind CSS using the shared Nexora preset and semantic tokens.
- React Router for client routes.
- TanStack Query for server state; local component state for UI-only state.
- React Hook Form + Zod for forms and validation.
- Axios or a typed `fetch` wrapper—choose one across all apps.
- Lucide React for icons.
- Storybook for the shared UI package.
- Vitest + Testing Library; Playwright for critical end-to-end workflows.
- ESLint, Prettier, TypeScript strict mode and CI build/test gates.

## Integration boundary

Every standalone system should reuse:

1. Nexora SSO/session contract.
2. Shared user, role and permission model.
3. `@neoteric/nexora-ui` tokens/components.
4. Common route naming, error envelope and audit fields.
5. Shared observability conventions and correlation IDs.

Backend selection may vary by domain, but API contracts, authentication, authorization, audit trails and UI behavior must remain consistent.

## Required repository metadata

Pin Node and package-manager versions. Commit the lockfile. Maintain `.env.example` without secrets. Document runtime URLs, API version, roles, data ownership and rollback steps. Never embed production credentials or tokens in frontend code.
