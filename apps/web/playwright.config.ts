import { defineConfig, devices } from '@playwright/test';

/**
 * Committed E2E suite (priority 4 of the rollout-hardening pass). Requires the API to be
 * seeded (`cd apps/api && npm run seed`) before running — the suite logs in as the seeded
 * demo users and does not create its own fixtures/users, matching how a real Process
 * Coordinator would exercise the app. See e2e/README.md for the exact run sequence.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared dev.db — parallel runs would race on demo data
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    { command: 'npm run dev', cwd: '../api', url: 'http://localhost:4000/health', reuseExistingServer: true, timeout: 30_000 },
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 30_000 },
  ],
});
