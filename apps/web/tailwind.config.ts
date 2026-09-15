import type { Config } from 'tailwindcss';

// Nexora semantic tokens, per NEXORA_DESIGN_TOKENS.md. Features must consume these
// names, never raw hex values.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // `strong` is a WCAG AA-safe darker shade (~5:1+) for orange used as *small text or a
        // small-element background on a light surface* — the base `#f97316` only measures
        // ~2.8:1 there (real defects an axe-core accessibility smoke test caught: the sidebar
        // logo badge and the active-nav-link text). Use `text-primary-strong` / `bg-primary-strong`
        // (with a `dark:` override back to the brighter shade) for those cases; keep bare
        // `text-primary`/`bg-primary` for large buttons/borders/icons where the contrast pairing
        // is already correct.
        primary: { DEFAULT: '#f97316', hover: '#ea580c', soft: '#fff7ed', light: '#fb923c', strong: '#c2410c' },
        surface: { DEFAULT: '#ffffff', muted: '#f3f4f6', dark: '#1f2937', 'dark-muted': '#374151' },
        bg: { DEFAULT: '#f9fafb', dark: '#111827' },
        border: { DEFAULT: '#e5e7eb', dark: '#374151' },
        // 'muted-strong': content.muted (#6b7280) measures only 4.39:1 bold-on-bg-surface-muted
        // (an axe-core finding on the DataTable header row) — just short of AA's 4.5:1.
        content: { DEFAULT: '#111827', muted: '#6b7280', 'muted-strong': '#4b5563', dark: '#ffffff', 'dark-muted': '#d1d5db' },
        // Each `strong` is the WCAG-AA-safe darker shade for that color used as small text/badge
        // text on a light surface (the bare DEFAULT reliably fails 4.5:1 there — see primary's
        // comment above for the specific axe-core findings that drove this). `dark:text-X`
        // (the bare DEFAULT) is fine on dark surfaces and is what these pair with there.
        success: { DEFAULT: '#22c55e', strong: '#166534' },
        warning: { DEFAULT: '#f59e0b', strong: '#92400e' },
        danger: { DEFAULT: '#ef4444', strong: '#b91c1c' },
        info: { DEFAULT: '#3b82f6', strong: '#1d4ed8' },
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px' },
      boxShadow: {
        sm: '0 1px 2px rgb(0 0 0 / 0.05)',
        md: '0 4px 12px rgb(15 23 42 / 0.08)',
        drawer: '0 20px 25px -5px rgb(0 0 0 / .10), 0 8px 10px -6px rgb(0 0 0 / .10)',
      },
      transitionDuration: { fast: '150ms', normal: '200ms' },
    },
  },
  plugins: [],
} satisfies Config;
