import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, DEMO_USERS, fillAndSubmitJobForm, uniqueLocation } from './utils';

/**
 * Accessibility smoke + dark mode verification (priority 9 of the rollout-hardening pass).
 * This is a smoke test, not full WCAG certification — it catches the categories of defect
 * most likely in a hand-built UI (missing labels, contrast, focus order) on the pages a
 * Process Coordinator actually lives in day to day.
 */
test.describe('Accessibility smoke', () => {
  for (const [name, path] of [
    ['Dashboard', '/dashboard'],
    ['Job Cards list', '/jobs'],
    ['Process Coordinator', '/attention'],
  ] as const) {
    test(`${name} has no critical/serious automated accessibility violations`, async ({ page }) => {
      await login(page, DEMO_USERS.coordinator);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const seriousOrWorse = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
    });
  }

  test('Masters (all tabs) has no critical/serious violations', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    for (const tabName of ['Organization & Work', 'Holiday Calendar', 'Workflow Templates', 'SLA Rules', 'Escalation Rules', 'Reasons']) {
      await page.goto('/masters');
      await page.click(`button:has-text("${tabName}")`);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const seriousOrWorse = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(seriousOrWorse, `Tab "${tabName}": ${JSON.stringify(seriousOrWorse, null, 2)}`).toEqual([]);
    }
  });

  test('Job Card detail has no critical/serious violations', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/jobs');
    await page.click('button:has-text("New Job Card")');
    await page.waitForSelector('text=Raise a new service issue');
    await fillAndSubmitJobForm(page, { location: uniqueLocation('A11y smoke test'), narration: 'Accessibility smoke test job.' });
    await page.waitForURL('**/jobs/*', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
});

test.describe('Dark mode', () => {
  test('toggling theme persists across reload and keeps the dashboard usable', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await page.click('button[aria-label="Toggle theme"]');
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5_000 });
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
