# Nexora Frontend Standards

## Project structure

```text
src/
  app/          # providers, router, shell, permissions
  assets/       # approved local assets
  components/   # app-specific compositions
  features/     # domain modules
  hooks/
  lib/          # API client, dates, validation, telemetry
  pages/
  styles/       # token import and Tailwind entry
  types/
```

Shared primitives belong in `@neoteric/nexora-ui`, not under a feature.

## Engineering rules

- TypeScript strict mode; avoid `any` at API boundaries.
- Route-level code splitting and error boundaries.
- One typed API client with auth refresh, timeout, cancellation and normalized errors.
- Server state is cached by query keys; never duplicate it into global UI state.
- Permission checks exist in both UI and backend. Hidden buttons are not authorization.
- Dates are stored/transmitted in ISO 8601 and rendered in the user’s timezone.
- Currency and numbers use `Intl` formatters.
- Every create/update action prevents duplicate submission and gives success/failure feedback.
- Never log tokens, passwords, OTPs or sensitive record payloads.

## Tailwind conventions

- Consume semantic tokens via a shared preset.
- Keep arbitrary values rare and documented.
- Prefer extracted components over repeated class strings longer than one logical element.
- Every color/background/border declaration includes a dark-mode counterpart where necessary.
- Responsive design starts at mobile width and enhances at `sm`, `md`, `lg`, `xl`, `2xl`.

## Quality gates

```text
typecheck → lint → unit tests → build → component tests → critical E2E → accessibility smoke test
```

Critical E2E paths: sign-in, permission denial, list/search/filter, create, edit, validation failure, server failure, successful save and logout. Add visual-regression coverage for shell, drawer, table, form states and dark mode.

## Definition of done

- Uses shared shell and components.
- No raw secrets or unsupported direct API calls.
- Loading/empty/error/offline/permission states implemented.
- Keyboard and mobile behavior verified.
- API failures preserve user-entered form data.
- Audit fields and correlation ID included where applicable.
- Build is reproducible from a clean checkout.
