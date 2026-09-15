# Nexora Design Tokens

## Verified foundation

- Font stack: `Inter, system-ui, sans-serif`.
- Base text: 16px / 24px; most operational controls: 14–15px.
- Primary: orange `#f97316`; light `#fb923c`; dark `#ea580c`.
- Responsive breakpoints observed: 640, 768, 1024, 1280 and 1536px.
- Light body: `#f9fafb`; main text: `#111827`; default border: `#e5e7eb`.
- Common success: `#28c76f` / `#22c55e`; danger: `#ea5455` / `#ef4444`; warning: `#ff9f43` / `#f59e0b`; info: `#0ea5e9` / `#3b82f6`.

## Canonical CSS variables

```css
:root {
  --nx-font-sans: Inter, system-ui, sans-serif;
  --nx-primary: #f97316;
  --nx-primary-hover: #ea580c;
  --nx-primary-soft: #fff7ed;
  --nx-bg: #f9fafb;
  --nx-surface: #ffffff;
  --nx-surface-muted: #f3f4f6;
  --nx-text: #111827;
  --nx-text-muted: #6b7280;
  --nx-border: #e5e7eb;
  --nx-success: #22c55e;
  --nx-warning: #f59e0b;
  --nx-danger: #ef4444;
  --nx-info: #3b82f6;
  --nx-radius-sm: 6px;
  --nx-radius-md: 8px;
  --nx-radius-lg: 12px;
  --nx-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --nx-shadow-md: 0 4px 12px rgb(15 23 42 / 0.08);
  --nx-shadow-drawer: 0 20px 25px -5px rgb(0 0 0 / .10), 0 8px 10px -6px rgb(0 0 0 / .10);
  --nx-duration-fast: 150ms;
  --nx-duration-normal: 200ms;
}

.dark {
  --nx-bg: #111827;
  --nx-surface: #1f2937;
  --nx-surface-muted: #374151;
  --nx-text: #ffffff;
  --nx-text-muted: #d1d5db;
  --nx-border: #374151;
}
```

## Spacing and sizing

Use a 4px base grid. Approved spacing: 4, 6, 8, 10, 12, 16, 20, 24, 32 and 40px. Default field/button height is 40px. Sidebar desktop item height is about 34px. Standard drawer width is 100% on mobile and `max-width: 672px` on desktop.

## Typography

- Page title: 24–30px, 700.
- Section title: 18–20px, 600–700.
- Card title: 15–16px, 600.
- Body: 14–16px, 400.
- Label: 14px, 500–600.
- Caption/status: 10–12px, 500–700; uppercase only for short labels.

## Rule

Features consume semantic tokens (`primary`, `surface`, `danger`), never raw palette values. Add a token only when the value is reused by at least two components.
