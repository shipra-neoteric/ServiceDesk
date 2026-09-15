import { test, expect } from '@playwright/test';
import { login, DEMO_USERS, openMobileMenuIfPresent } from './utils';

test.describe('Authentication & permission-based navigation', () => {
  test('rejects an invalid login without crashing and keeps the form usable', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.click('button[type=submit]');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    // Form must still be usable (§ "API failures preserve user-entered form data" / no crash).
    await expect(page.getByLabel('Email')).toHaveValue('nobody@example.com');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logs in and shows the authenticated shell', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // The name/role readout in the header is intentionally hidden below `sm` (AppShell), so
    // check the logout control instead — it's always present regardless of viewport.
    await expect(page.getByLabel('Log out')).toBeVisible();
  });

  test('logs out and returns to login, protecting routes afterwards', async ({ page }) => {
    await login(page, DEMO_USERS.coordinator);
    await page.click('button[aria-label="Log out"]');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a Requester does not see Masters/Users admin nav (permission-gated navigation)', async ({ page }) => {
    await login(page, DEMO_USERS.requester);
    await expect(page.getByRole('link', { name: 'Masters' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  });

  test('Master Admin sees the full admin navigation', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await openMobileMenuIfPresent(page);
    await expect(page.getByRole('link', { name: 'Masters' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
  });

  test('direct navigation to Masters without permission renders a permission-denied state, not a crash', async ({ page }) => {
    await login(page, DEMO_USERS.requester);
    await page.goto('/masters');
    await expect(page.getByText(/permission denied/i)).toBeVisible();
  });
});
