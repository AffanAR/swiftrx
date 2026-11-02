import { expect, type Page } from '@playwright/test';

import { E2E_PORT } from '../playwright.config';

/** The address of a hospital's portal, or of the admin panel. */
export const portal = (slug: string, path = '/') => `http://${slug}.localhost:${E2E_PORT}${path}`;
export const admin = (path = '/') => `http://admin.localhost:${E2E_PORT}${path}`;

/** Demo accounts from the seed (apps/api/src/db/demo-passwords.json). */
export const AYESHA = { email: 'ayesha@city-hospital.com', password: 'demo1234' };
export const SANA = { email: 'sana@northstar-medical.com', password: 'demo1234' };
export const PLATFORM_ADMIN = { email: 'admin@swiftrx.com', password: 'admin1234' };

/** Sign in on the sign-in page at `url`, and wait to land past it. */
export async function signIn(page: Page, url: string, who: { email: string; password: string }) {
  await page.goto(url);
  await page.locator('input[type="email"]').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.locator('input[type="password"]').press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
}

/**
 * Printing opens the browser's dialog, which would stall a test. The pad
 * still lays out the printout; only the dialog is skipped.
 */
export async function skipPrintDialogs(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

/** The Rx pad's three search boxes (their ids and zones are what its shortcuts use). */
export const pad = (page: Page) => ({
  patient: page.locator('#rx-patient-search'),
  diagnosis: page.locator('[data-zone="diagnosis"]'),
  medicine: page.locator('#rx-med-search'),
});

/**
 * A request from inside the page, as the app makes them: same origin, with
 * the page's cookies. (Playwright's own request client runs in Node, which on
 * Windows can't resolve *.localhost the way browsers do.)
 */
export async function fetchInPage(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ path, method, body }) => {
      const res = await fetch(path, {
        method: method ?? 'GET',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, method: init.method, body: init.body },
  );
}
