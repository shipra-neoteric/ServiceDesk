# Nexora UI/UX Guide

Status: audited from the authenticated Nexora production interface on 10 September 2026. This guide records the repeatable visual language; it does not copy business data.

## Product character

Nexora is a dense internal operations portal. New standalone systems should feel calm, compact, fast and trustworthy—not like a marketing website. Prefer clear hierarchy, restrained shadows, neutral surfaces and orange only for emphasis.

## Shell

- Desktop: fixed/collapsible left sidebar, persistent top utility bar, scrolling main content.
- Sidebar groups use uppercase section labels: `SALES`, `PEOPLE & OPERATIONS`, `FINANCE & ACCOUNTS`, `RESOURCES`, `ADMIN`.
- Primary nav item: 15px, medium weight, 34px height, 8px radius, 10px horizontal padding.
- Nested nav item: 14px, medium/semibold, 6px radius.
- Main background: gray-50 (`#f9fafb`) in light mode; gray-900/near-black family in dark mode.
- Header utilities: 32px square icon buttons, 8px radius, subtle border.
- Mobile: sidebar becomes an overlay/drawer; hide desktop-only controls below `lg`.

## Page hierarchy

1. Page title (`h1`), then compact actions/filter row.
2. KPI cards or summary strip.
3. Operational content in cards, list rows or tables.
4. Secondary analytics/help below primary work.

Keep actions close to the content they affect. Use one obvious filled primary action per region; secondary actions are bordered or ghost.

## Interaction patterns

- Support light and dark themes everywhere.
- Use 150–200ms transitions for hover, color, drawer and collapse states.
- Primary buttons may use a subtle shadow and `active:scale-95`; never animate layout.
- Provide loading, empty, error, disabled and permission-denied states for every data surface.
- Destructive actions require a confirmation step and must never share the orange primary treatment.
- Keep filters in a compact toolbar; show active-filter count and a clear reset.
- Tables need sticky headers where useful, horizontal scrolling on small screens, stable column widths and explicit empty states.

## Accessibility

- Every icon-only control needs an accessible label and tooltip.
- Preserve visible focus rings (`2px` minimum) and keyboard order.
- Do not rely on color alone for status; pair color with label/icon.
- Minimum touch target: 40px for primary mobile interactions; 32px is acceptable only for desktop utility icons.
- Respect `prefers-reduced-motion`, high-contrast preferences and print layouts.

## UX consistency checklist

- Uses the shared AppShell, PageHeader, Button, Field, Card, Drawer, Modal, Table, Badge and EmptyState components.
- Uses only approved tokens; no one-off hex colors in feature code.
- Works at 360px, 768px, 1024px and 1440px.
- Supports dark mode without unreadable borders or status colors.
- Includes loading, error, empty and permission states.
- Uses Nexora wording, density and date/time conventions.
- No action mutates data without clear feedback.
