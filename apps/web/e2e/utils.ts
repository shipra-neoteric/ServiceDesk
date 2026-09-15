import type { Page } from '@playwright/test';

export const DEMO_USERS = {
  admin: { email: 'admin@neotericgrp.in', password: 'Password123!' },
  serviceHead: { email: 'servicehead@neotericgrp.in', password: 'Password123!' },
  coordinator: { email: 'coordinator@neotericgrp.in', password: 'Password123!' },
  projectHeadGardenCity: { email: 'ph.gardencity@neotericgrp.in', password: 'Password123!' },
  engineerArun: { email: 'arun.engineer@neotericgrp.in', password: 'Password123!' },
  requester: { email: 'requester@neotericgrp.in', password: 'Password123!' },
};

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/** On the mobile viewport the sidebar nav lives behind a hamburger overlay (AppShell hides the
 * permanent sidebar below `lg`) — open it so nav-link assertions work on both projects. A
 * no-op on desktop, where the "Open menu" button doesn't exist. */
export async function openMobileMenuIfPresent(page: Page) {
  const menuButton = page.getByLabel('Open menu');
  if (await menuButton.isVisible().catch(() => false)) {
    await menuButton.click();
  }
}

export function uniqueLocation(label: string) {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

/** Fills the create-Job-Card drawer's required fields and returns the created Job Card's
 * detail-page URL. Assumes the drawer is already open. */
export async function fillAndSubmitJobForm(page: Page, opts: { location: string; narration: string; requesterName?: string }) {
  await page.getByLabel('Project / Property').selectOption({ index: 1 });
  await page.getByLabel('Exact Location').fill(opts.location);
  await page.getByLabel('Work Category').selectOption({ index: 1 });
  await page.getByLabel('Job Type').selectOption({ index: 1 });
  await page.getByLabel('Priority').selectOption({ index: 1 });
  await page.getByLabel('Problem Description').fill(opts.narration);
  await page.getByLabel('Requester Name').fill(opts.requesterName ?? 'E2E Test Requester');
  await page.click('button:has-text("Create Job Card")');
}
