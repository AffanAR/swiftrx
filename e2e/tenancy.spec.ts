// One hospital can't see or change another's data: not through the other
// hospital's portal (its session doesn't count there), and not by asking the
// API for the other hospital's data from its own portal.
import { expect, test } from '@playwright/test';

import { AYESHA, admin, fetchInPage, portal, signIn } from './helpers';

test("a City Hospital doctor gets nothing of Northstar's", async ({ page }) => {
  await signIn(page, portal('city-hospital'), AYESHA);

  // From City Hospital's own address, Northstar's data is refused (403)...
  for (const path of ['', '/patients', '/prescriptions', '/doctors']) {
    const { status } = await fetchInPage(page, `/api/hospitals/northstar-medical${path}`);
    expect(status, `GET northstar-medical${path}`).toBe(403);
  }
  // ...and so is writing to it: a patient, or a prescription.
  for (const path of ['/patients', '/prescriptions']) {
    const { status } = await fetchInPage(page, `/api/hospitals/northstar-medical${path}`, {
      method: 'POST',
      body: {},
    });
    expect(status, `POST northstar-medical${path}`).toBe(403);
  }
  // Its own hospital still answers.
  expect((await fetchInPage(page, '/api/hospitals/city-hospital/patients')).status).toBe(200);

  // Northstar's portal doesn't take City Hospital's session: it asks to sign in.
  await page.goto(portal('northstar-medical', '/patients'));
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Northstar Medical Center').first()).toBeVisible();
  expect((await fetchInPage(page, '/api/hospitals/northstar-medical/patients')).status).toBe(401);
});

test("the admin panel doesn't take a hospital's session", async ({ page }) => {
  await signIn(page, portal('city-hospital'), AYESHA);
  await page.goto(admin());
  await expect(page.locator('input[type="password"]')).toBeVisible();
  expect((await fetchInPage(page, '/api/hospitals')).status).toBe(401);
});
