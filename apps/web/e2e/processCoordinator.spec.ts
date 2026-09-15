import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('Process Coordinator attention queue', () => {
  test('renders attention items with owner, reason and a working link to the Job Card', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await page.goto('/attention');
    await expect(page.getByRole('heading', { name: 'Process Coordinator' })).toBeVisible();

    // The seeded demo data always has at least an overdue and a material-blocked job (see
    // apps/api/src/seed/seed.ts), so the queue should never be empty in a fresh environment.
    await expect(page.getByText('What happened:').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Why flagged:').first()).toBeVisible();
    await expect(page.getByText('Current owner:').first()).toBeVisible();

    await page.getByRole('button', { name: 'Open Job Card' }).first().click();
    await expect(page).toHaveURL(/\/jobs\/.+/, { timeout: 10_000 });
    await expect(page.getByText('Workflow Stages')).toBeVisible();
  });
});
