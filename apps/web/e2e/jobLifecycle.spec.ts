import { test, expect, type Page } from '@playwright/test';
import { login, DEMO_USERS, uniqueLocation, fillAndSubmitJobForm } from './utils';

/**
 * The full Job Card lifecycle is inherently sequential (you cannot verify a job that hasn't
 * been completed), so this suite runs as one serial block sharing a single Job Card's URL —
 * each test step is still independently assertive, but they build on the previous step's
 * state rather than re-deriving it. Logged in as Master Admin throughout, since that role
 * holds every permission this flow touches (assign, complete, verify, close, reopen) — role-
 * specific permission *denial* is covered separately in auth.spec.ts.
 */
test.describe.serial('Full Job Card lifecycle', () => {
  let jobUrl: string;
  const location = uniqueLocation('Lifecycle E2E');

  test('creates a Job Card', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/jobs');
    await page.click('button:has-text("New Job Card")');
    await page.waitForSelector('text=Raise a new service issue');
    // index 1 resolves to "Material-Dependent Repair" (alphabetically first job type) so this
    // job's template naturally has a MATERIAL stage, letting one flow cover both the
    // "material dependency" and general lifecycle scenarios without juggling job types.
    await fillAndSubmitJobForm(page, { location, narration: 'E2E lifecycle test: full create-to-reopen flow.' });
    await page.waitForURL('**/jobs/*', { timeout: 10_000 });
    await expect(page.getByText('Workflow Stages')).toBeVisible();
    await expect(page.getByText(/^JC-\d{4}-\d{6}$/)).toBeVisible();
    jobUrl = page.url();
  });

  test('detects a duplicate when the same project/location/category is submitted again', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/jobs');
    await page.click('button:has-text("New Job Card")');
    await page.waitForSelector('text=Raise a new service issue');
    await fillAndSubmitJobForm(page, { location, narration: 'Second report of the same issue for duplicate detection.' });
    await expect(page.getByText('Possible duplicate Job Cards found')).toBeVisible({ timeout: 10_000 });
    // Decline creating a true duplicate — clean up by going back rather than confirming it,
    // so later count-sensitive assertions in dashboard.spec.ts aren't affected.
    await page.click('button:has-text("Go back and edit")');
  });

  test('assigns an engineer', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Assign Engineer")');
    await page.waitForSelector('text=active jobs');
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Assign', exact: true }).first().click();
    await expect(page.getByText('SERVICE_ENGINEER').first()).toBeVisible({ timeout: 10_000 });
  });

  test('starts and completes a site visit', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Start Site Visit")');
    await expect(page.getByText('Site Visit Pending')).toBeVisible({ timeout: 10_000 });
    await page.fill('input[placeholder="Site visit notes…"]', 'Inspected the site, confirmed the issue.');
    await page.click('button:has-text("Complete Site Visit")');
    await expect(page.getByText('Site Visit Completed', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('records a material dependency and moves the job to Waiting Material', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Materials")');
    await page.fill('input[placeholder="Item"]', 'Replacement part');
    await page.click('button:has-text("Add Requirement")');
    await expect(page.getByText('Waiting Material')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('REQUIREMENT RAISED')).toBeVisible();
  });

  test('records an approval dependency and decides it', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Approvals")');
    await page.fill('input[placeholder*="Approval type"]', 'MATERIAL_COST_APPROVAL');
    await page.locator('select').filter({ hasText: 'Select approver' }).selectOption({ index: 1 });
    await page.click('button:has-text("Request Approval")');
    await expect(page.getByText('MATERIAL_COST_APPROVAL')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Approve")');
    await expect(page.getByText('APPROVED')).toBeVisible({ timeout: 10_000 });
  });

  test('marks the job ready to start and starts work', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Ready to Start")');
    await expect(page.getByText('Ready to Start', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Work")');
    await expect(page.getByText('In Progress')).toBeVisible({ timeout: 10_000 });
  });

  test('blocks completion without evidence, then completes once evidence is attached', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Mark Work Completed")');
    await expect(page.getByText('Completion requires at least one AFTER')).toBeVisible({ timeout: 10_000 });

    await page.click('button:has-text("Evidence")');
    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles({ name: 'after.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpeg-bytes-for-e2e') });
    await expect(page.getByText('Attachment uploaded')).toBeVisible({ timeout: 10_000 });

    await page.click('button:has-text("Overview")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Mark Work Completed")');
    await expect(page.getByText('Work Completed')).toBeVisible({ timeout: 10_000 });
  });

  test('verifies and closes the job', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Verify & Close")');
    await expect(page.getByText('Closed', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('reopens the closed job into an actionable state', async ({ page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto(jobUrl);
    await page.click('button:has-text("Reopen")');
    await expect(page.getByText('In Progress')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Reopen Count').locator('..')).toContainText('1');
  });
});

test.describe('Access control on the Job Card detail route', () => {
  test('a user scoped to a different project gets a not-found state, not the job (cross-project denial)', async ({ page }: { page: Page }) => {
    await login(page, DEMO_USERS.admin);
    await page.goto('/jobs');
    await page.click('button:has-text("New Job Card")');
    await page.waitForSelector('text=Raise a new service issue');
    await fillAndSubmitJobForm(page, { location: uniqueLocation('Cross-project test'), narration: 'Cross-project access denial test job.' });
    await page.waitForURL('**/jobs/*', { timeout: 10_000 });
    const url = page.url();
    await page.click('button[aria-label="Log out"]');

    // Garden City Project Head only has access to Garden City / Garden City Club.
    await login(page, DEMO_USERS.projectHeadGardenCity);
    await page.goto(url);
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 10_000 });
  });
});
