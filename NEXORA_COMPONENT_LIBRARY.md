# Nexora Component Library Contract

## Required shared components

| Component | Contract |
| --- | --- |
| `AppShell` | Responsive sidebar, utility header, content viewport, theme and permission-aware navigation. |
| `PageHeader` | Title, optional description, breadcrumbs and right-aligned action slot. |
| `Button` | `primary`, `secondary`, `ghost`, `danger`; `sm/md`; loading and disabled states. |
| `IconButton` | 32–40px square, accessible label, tooltip, focus ring. |
| `Field` | Label, required marker, hint, error, 40px control; input/select/date/time/textarea adapters. |
| `Card` | White/dark surface, 8px radius, subtle shadow; optional header/footer. |
| `KpiCard` | Label, number, status/accent, optional click filter. |
| `Badge` | Text plus semantic color: neutral/info/success/warning/danger. |
| `DataTable` | Sort, filter, pagination, responsive overflow, row actions, skeleton and empty state. |
| `Toolbar` | Search/filter/view toggle/primary action in a wrapping 40px control row. |
| `Drawer` | Right-side editor; mobile full width, desktop max 672px; header/body/sticky footer. |
| `Modal` | Centered decisions and confirmations only; do not use for long forms. |
| `Toast` | Brief success/info/error feedback; never the only record of a failed save. |
| `EmptyState` | Reason, recovery action and optional illustration/icon. |
| `PermissionGate` | Hides or disables unauthorized controls and supplies a safe fallback. |

## Drawer specification

The audited task form uses a right drawer rather than a centered modal. Reproduce this pattern for create/edit workflows:

- Container: `w-full max-w-2xl h-full`, white / gray-800, left border, drawer shadow.
- Header: 16px vertical and 16–24px horizontal padding, bottom border.
- Title: 18px semibold; supporting sentence directly below.
- Body: independently scrollable; group related fields with 16–20px vertical spacing.
- Footer: sticky bottom bar with Cancel then primary action.
- Open/close: 200ms slide; overlay click and Escape close only when no unsaved changes.

## Form specification

- Default input: 40px high, 14px text, 12px horizontal padding, 6px radius, 1px gray border.
- Textarea: minimum 96px; user-resizable only when layout permits.
- Focus: orange ring and/or orange border, with strong contrast in dark mode.
- Error: inline message below field; focus first invalid field after submit.
- Required fields use `*` visually and `aria-required` semantically.

## Status mapping

| Meaning | Treatment |
| --- | --- |
| Completed / healthy | Green, check icon, explicit label |
| In progress / attention | Amber, clock/progress icon |
| Delayed / failed | Red, warning icon |
| Informational | Blue |
| Disabled / unavailable | Gray |

## Component governance

All standalone apps import components from one versioned `@neoteric/nexora-ui` package. Feature repositories may compose shared components but must not fork them. Visual changes require Storybook examples, keyboard testing, light/dark screenshots and a changelog entry.
