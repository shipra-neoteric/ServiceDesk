import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('API/server error handling', () => {
  test('a non-existent Job Card id renders a not-found state instead of a blank crash', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/jobs/does-not-exist-12345');
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test('the create-job form keeps entered data after a failed submission (no silent data loss)', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/jobs');
    await page.click('button:has-text("New Job Card")');
    await page.waitForSelector('text=Raise a new service issue');
    // Submit with required selects left blank -> client-side validation should block submit
    // and preserve whatever was typed, rather than clearing the form.
    await page.getByLabel('Exact Location').fill('Error handling test location');
    await page.getByLabel('Problem Description').fill('Deliberately incomplete submission to test validation.');
    await page.click('button:has-text("Create Job Card")');
    await expect(page.getByLabel('Exact Location')).toHaveValue('Error handling test location');
    await expect(page.getByLabel('Problem Description')).toHaveValue('Deliberately incomplete submission to test validation.');
  });

  test('an expired/invalid session redirects to login instead of showing a broken shell', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.evaluate(() => localStorage.setItem('sd_access_token', 'garbage-invalid-token'));
    await page.evaluate(() => localStorage.removeItem('sd_refresh_token'));
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
