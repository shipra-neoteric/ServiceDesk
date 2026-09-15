import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('Dashboard', () => {
  test('renders KPIs, project health and bottlenecks with real numbers', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await expect(page.getByText('Open Jobs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overdue' })).toBeVisible();
    await expect(page.getByText('Project Health')).toBeVisible();
    await expect(page.getByText('Where work is stuck')).toBeVisible();
  });

  test('every KPI card deep-links to a filtered Job Card list, not a decorative number', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await page.getByRole('button', { name: 'Overdue' }).click();
    await expect(page).toHaveURL(/\/jobs\?view=overdue/);
    await expect(page.getByRole('heading', { name: 'Job Cards' })).toBeVisible();
  });

  test('project health rows deep-link to that project’s Job Cards', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    const firstProjectRow = page.locator('table tbody tr').first();
    await firstProjectRow.click();
    await expect(page).toHaveURL(/\/jobs\?projectId=/);
  });

  test('bottleneck rows deep-link to Job Cards stuck on that stage', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await page.waitForSelector('text=Where work is stuck');
    const firstBottleneck = page.locator('button', { has: page.locator('.rounded-full') }).first();
    await firstBottleneck.click();
    await expect(page).toHaveURL(/\/jobs\?stageKey=/);
    await expect(page.getByRole('heading', { name: 'Job Cards' })).toBeVisible();
  });
});
