import { test, expect } from '@playwright/test';
import { login, DEMO_USERS } from './utils';

test.describe('Legacy FMS Import', () => {
  test('uploads a CSV and shows a validation report with imported/ambiguous/skipped counts', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/masters');
    await page.click('button:has-text("Legacy Import")');
    await expect(page.getByRole('heading', { name: 'Legacy FMS Import' })).toBeVisible();

    const csv = [
      'Reference,Property,Work Category,Narration,Location,Actual',
      `E2E-${Date.now()}-1,Garden City,Electrical,Corridor light not working,Block A corridor,`,
      `E2E-${Date.now()}-2,Nonexistent Property XYZ,Electrical,Ambiguous property test,Block B,`,
      `E2E-${Date.now()}-3,Garden City,Electrical,,Block C,`, // missing narration -> skipped
    ].join('\n');

    await page.setInputFiles('input[type=file]', {
      name: 'e2e-legacy-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/Imported \d+, duplicate \d+, ambiguous \d+, skipped \d+, failed \d+\./)).toBeVisible({ timeout: 10_000 });
    // Scope to the most recent batch — re-running this spec against the same dev.db produces
    // multiple history entries with the identical upload filename.
    const latestBatch = page.locator('li', { hasText: 'e2e-legacy-import.csv' }).first();
    await expect(latestBatch).toBeVisible();
    await expect(latestBatch.getByText(/1 imported/)).toBeVisible();
    await expect(latestBatch.getByText(/1 ambiguous/)).toBeVisible();
    await expect(latestBatch.getByText(/1 skipped/)).toBeVisible();
  });
});
