import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('Masters — operational configuration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/masters');
    await expect(page.getByRole('heading', { name: 'Masters' })).toBeVisible();
  });

  test('Holiday Calendar: adds a holiday', async ({ page }) => {
    await page.click('button:has-text("Holiday Calendar")');
    const name = `E2E Holiday ${Date.now()}`;
    await page.fill('input[type=date]', '2027-01-26');
    await page.getByLabel('Name').fill(name);
    await page.click('button:has-text("Add Holiday")');
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test('Workflow Templates: toggling Evidence Requirements persists', async ({ page }) => {
    await page.click('button:has-text("Workflow Templates")');
    await expect(page.getByText('Simple Repair', { exact: true })).toBeVisible({ timeout: 10_000 });
    const checkbox = page.locator('tr', { hasText: 'Repair Execution' }).locator('input[type=checkbox]');
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    await expect(page.getByText('Evidence requirement updated')).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await page.click('button:has-text("Workflow Templates")');
    const checkboxAfterReload = page.locator('tr', { hasText: 'Repair Execution' }).locator('input[type=checkbox]');
    await expect(checkboxAfterReload).toHaveJSProperty('checked', !wasChecked);
    // Restore original state so other tests (which assume Repair Execution requires evidence) still pass.
    await checkboxAfterReload.click();
  });

  test('SLA Rules: adds and deletes a rule', async ({ page }) => {
    await page.click('button:has-text("SLA Rules")');
    await page.getByLabel('Stage key (optional)').fill('E2E_TEST_STAGE');
    await page.getByLabel('Hours').fill('12');
    await page.click('button:has-text("Add Rule")');
    await expect(page.getByText('E2E_TEST_STAGE', { exact: false })).toBeVisible({ timeout: 10_000 });
    await page
      .locator('li', { hasText: 'E2E_TEST_STAGE' })
      .getByLabel('Delete SLA rule')
      .click();
    await expect(page.getByText('SLA rule removed')).toBeVisible({ timeout: 10_000 });
  });

  test('Escalation Rules: saves a custom threshold', async ({ page }) => {
    await page.click('button:has-text("Escalation Rules")');
    await page.getByLabel('Threshold (hrs)').fill('36');
    await page.click('button:has-text("Save Rule")');
    await expect(page.getByText('Escalation rule saved')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/after 36h/)).toBeVisible();
  });

  test('Reasons: adds a custom cancellation reason', async ({ page }) => {
    await page.click('button:has-text("Reasons")');
    const label = `Test Reason ${Date.now()}`;
    const cancellationCard = page.getByTestId('reason-card-CANCELLATION');
    await cancellationCard.getByLabel('Code').fill('E2E_TEST_REASON');
    await cancellationCard.getByLabel('Label').fill(label);
    await cancellationCard.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(label)).toBeVisible({ timeout: 10_000 });
  });
});
