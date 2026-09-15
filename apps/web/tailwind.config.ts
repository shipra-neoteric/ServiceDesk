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
        primary: { DEFAULT: '#f97316', hover: '#ea580c', soft: '#fff7ed', light: '#fb923c' },
        surface: { DEFAULT: '#ffffff', muted: '#f3f4f6', dark: '#1f2937', 'dark-muted': '#374151' },
        bg: { DEFAULT: '#f9fafb', dark: '#111827' },
        border: { DEFAULT: '#e5e7eb', dark: '#374151' },
        content: { DEFAULT: '#111827', muted: '#6b7280', dark: '#ffffff', 'dark-muted': '#d1d5db' },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
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
