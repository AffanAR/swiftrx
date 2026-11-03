// A doctor signs a prescription in the Rx pad, and it shows up where it
// should: the doctor's own list (after a reload, so it came from the server),
// the admin panel's hospital page, and the audit log.
import { expect, test } from '@playwright/test';

import {
  AYESHA,
  PLATFORM_ADMIN,
  admin,
  fetchInPage,
  pad,
  portal,
  signIn,
  skipPrintDialogs,
} from './helpers';

test('a doctor signs a prescription, and the portal and the admin panel see it', async ({
  page,
}) => {
  await skipPrintDialogs(page);
  await signIn(page, portal('city-hospital'), AYESHA);
  await page.goto(portal('city-hospital', '/rx'));
  const { patient, diagnosis, medicine } = pad(page);

  // Fatima Noor has no known allergies: nothing to override.
  await patient.fill('Fatima');
  await patient.press('Enter');
  await expect(page.getByRole('banner').getByText('Fatima Noor')).toBeVisible();

  await diagnosis.fill('I10');
  await diagnosis.press('Enter');

  // A Bangladeshi brand: Camlodin is amlodipine.
  await medicine.fill('camlodin');
  await expect(page.getByRole('button', { name: /Camlodin/ }).first()).toBeVisible();
  await medicine.press('Enter');
  await expect(page.locator('[data-row]')).toHaveCount(1);

  await page.getByRole('button', { name: /Sign & Print/ }).click();
  // The pad shows it, and announces it to screen readers: two matches.
  const banner = page.getByText(/Signed rx_[0-9a-f]{12} for Fatima Noor/).first();
  await expect(banner).toBeVisible();
  const rxId = (await banner.textContent())!.match(/rx_[0-9a-f]{12}/)![0];

  // The pad is clear for the next one, and the print was laid out.
  await expect(page.locator('[data-row]')).toHaveCount(0);
  await expect(page.locator('#print-area')).toContainText('Camlodin');

  // After a reload, from the server: on the doctor's prescriptions page.
  await page.goto(portal('city-hospital', '/prescriptions'));
  await expect(page.getByText(/Tab\. Camlodin 5 mg/).first()).toBeVisible();

  // The admin panel: the hospital's page lists it, and the audit log has it.
  const audited = `ayesha@city-hospital.com signed Rx ${rxId} for Fatima Noor`;
  await signIn(page, admin(), PLATFORM_ADMIN);
  await page.goto(admin('/hospitals/city-hospital'));
  await expect(page.getByText(audited)).toBeVisible();
  await expect(page.getByText('Fatima Noor · I10').first()).toBeVisible();

  await page.goto(admin('/audit'));
  await expect(page.getByText(audited)).toBeVisible();
});

test('signing through an allergy needs a reason, and the server keeps it', async ({ page }) => {
  await skipPrintDialogs(page);
  await signIn(page, portal('city-hospital'), AYESHA);
  await page.goto(portal('city-hospital', '/rx'));
  const { patient, diagnosis, medicine } = pad(page);

  // Bilal Ahmed is allergic to penicillin; Fimoxyl is amoxicillin.
  await patient.fill('Bilal');
  await patient.press('Enter');
  await expect(page.getByRole('banner').getByText('Bilal Ahmed')).toBeVisible();
  await diagnosis.fill('J02.9');
  await diagnosis.press('Enter');
  await medicine.fill('fimoxyl');
  await expect(page.getByText('ALLERGY').first()).toBeVisible();
  await medicine.press('Enter');

  await page.getByRole('button', { name: /Sign & Print/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Patient allergic to Penicillin/)).toBeVisible();
  const reason = 'Mild rash on record, tolerated before; patient consents';
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: /Override & sign/ }).click();
  await expect(
    page.getByText(/Signed rx_[0-9a-f]{12} for Bilal Ahmed with a safety override/).first(),
  ).toBeVisible();

  // Stored with the reason, the alert the server found, and a record hash.
  const { status, body } = await fetchInPage(page, '/api/hospitals/city-hospital/prescriptions');
  expect(status).toBe(200);
  const [latest] = body as {
    patient: { name: string };
    safetyOverride?: { reason: string; alerts: { type: string }[] };
    recordHash?: string;
  }[];
  expect(latest.patient.name).toBe('Bilal Ahmed');
  expect(latest.safetyOverride?.reason).toBe(reason);
  expect(latest.safetyOverride?.alerts.map((a) => a.type)).toEqual(['allergy']);
  expect(latest.recordHash).toMatch(/^[0-9a-f]{64}$/);
});
