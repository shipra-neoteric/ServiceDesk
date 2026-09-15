import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('My Jobs', () => {
  test('an engineer sees Overdue/Today/Blocked/Upcoming sections for their own assignments', async ({ page }) => {
    await login(page, DEMO_USERS.engineerArun);
    await page.goto('/my-jobs');
    await expect(page.getByRole('heading', { name: 'My Jobs' })).toBeVisible();
    for (const section of ['Overdue', 'Today', 'Blocked', 'Upcoming']) {
      await expect(page.getByText(new RegExp(`^${section} \\(\\d+\\)$`))).toBeVisible({ timeout: 10_000 });
    }
  });

  test('clicking a job in My Jobs opens its detail page', async ({ page }) => {
    await login(page, DEMO_USERS.engineerArun);
    await page.goto('/my-jobs');
    const firstJobButton = page.locator('button').filter({ hasText: /^JC-/ }).first();
    const count = await firstJobButton.count();
    test.skip(count === 0, 'This engineer has no assigned jobs in the current seed data.');
    await firstJobButton.click();
    await expect(page).toHaveURL(/\/jobs\/.+/);
    await expect(page.getByText('Workflow Stages')).toBeVisible({ timeout: 10_000 });
  });
});
