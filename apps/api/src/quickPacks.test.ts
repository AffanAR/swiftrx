import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mergeQuickPacks } from '@swiftrx/shared/quickPacks';
import type { AuditEvent, Catalog, Hospital, HospitalQuickPacks } from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';

const CITY = 'http://city-hospital.swiftrx.com';
const NORTHSTAR = 'http://northstar-medical.swiftrx.com';
const ADMIN = 'http://admin.swiftrx.com';

// Generic ids from the Bangladesh list (scripts/bd-medicines/reviewed.json).
const AMLODIPINE = 'g62';
const LISINOPRIL = 'g691';

let database: Database;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await freshDatabase();
  await seed(database.db);
  app = createApp({ db: database.db, rootDomain: 'swiftrx.com' });
}, SLOW);

afterAll(() => database.close());

async function signIn(origin: string, email: string, password = 'demo1234') {
  const res = await app.request(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie()[0].split(';')[0];
}

const doctor = () => signIn(CITY, 'ayesha@city-hospital.com');
const cityAdmin = () => signIn(CITY, 'admin@city-hospital.com');
const platformAdmin = () => signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');

const get = (origin: string, path: string, cookie?: string) =>
  app.request(`${origin}/api${path}`, { headers: cookie ? { cookie } : {} });

const send = (origin: string, method: string, path: string, body: unknown, cookie?: string) =>
  app.request(`${origin}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** City Hospital's own pack for hypertension on Alt+1. */
const cityPack = {
  recommendationReason: 'Our ward protocol: start with amlodipine alone.',
  medications: [
    {
      drugId: AMLODIPINE,
      genericName: 'anything; the server names it',
      dosage: { value: 5, unit: 'mg' },
      frequency: 'QD',
      durationDays: 30,
      instructions: 'In the morning',
    },
  ],
};
const SLOT = '/hospitals/city-hospital/quick-packs/I10/1';
const SLOT_2 = '/hospitals/city-hospital/quick-packs/I10/2';
const LIST = '/hospitals/city-hospital/quick-packs';

const auditLog = async () =>
  (await (
    await get(ADMIN, '/hospitals/city-hospital/audit-events', await platformAdmin())
  ).json()) as AuditEvent[];

const ownPacks = async (origin: string, cookie: string) =>
  (await (await get(origin, LIST, cookie)).json()) as HospitalQuickPacks;

describe('a hospital’s own quick packs', () => {
  it('start empty, and only the hospital and the SwiftRx team read them', async () => {
    const res = await get(CITY, LIST, await doctor());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ packs: [], hidden: [] });
    expect((await get(CITY, LIST)).status).toBe(401);
    expect((await get(NORTHSTAR, LIST, await doctor())).status).toBe(401);
    expect(
      (await get(NORTHSTAR, LIST, await signIn(NORTHSTAR, 'sana@northstar-medical.com'))).status,
    ).toBe(403);
  });

  it('are set by the SwiftRx team, checked against the catalog, and audited', async () => {
    const admin = await platformAdmin();
    expect((await send(CITY, 'PUT', SLOT, cityPack, await doctor())).status).toBe(403);
    expect(
      (await send(ADMIN, 'PUT', '/hospitals/city-hospital/quick-packs/I10/4', cityPack, admin))
        .status,
    ).toBe(400);
    expect(
      (await send(ADMIN, 'PUT', '/hospitals/city-hospital/quick-packs/X99/1', cityPack, admin))
        .status,
    ).toBe(400);
    const unknownDrug = await send(
      ADMIN,
      'PUT',
      SLOT,
      { ...cityPack, medications: [{ ...cityPack.medications[0], drugId: 'g_nothing' }] },
      admin,
    );
    expect(unknownDrug.status).toBe(400);
    // A pack and a hidden slot at once is neither.
    expect((await send(ADMIN, 'PUT', SLOT, { ...cityPack, hidden: true }, admin)).status).toBe(400);
    expect(
      (await send(ADMIN, 'PUT', '/hospitals/nowhere/quick-packs/I10/1', cityPack, admin)).status,
    ).toBe(404);

    const res = await send(ADMIN, 'PUT', SLOT, cityPack, admin);
    expect(res.status).toBe(200);
    const { packs } = (await res.json()) as HospitalQuickPacks;
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({
      packId: 'hospital:I10:1',
      diagnosisCode: 'I10',
      shortcutKey: '1',
      recommendationReason: cityPack.recommendationReason,
    });
    expect(packs[0].medications[0].genericName).toMatch(/amlodipine/i);
    expect((await auditLog())[0]).toMatchObject({
      kind: 'set_quick_pack',
      userEmail: 'admin@swiftrx.com',
      diagnosisCode: 'I10',
      shortcutKey: '1',
      action: 'set',
    });

    // The same pack again records nothing.
    const before = (await auditLog()).length;
    expect((await send(ADMIN, 'PUT', SLOT, cityPack, admin)).status).toBe(200);
    expect((await auditLog()).length).toBe(before);
  });

  it("are set by the hospital's own admins too, and nobody else's", async () => {
    const admin = await cityAdmin();
    const changed = {
      ...cityPack,
      medications: [{ ...cityPack.medications[0], drugId: LISINOPRIL }],
    };
    expect((await send(CITY, 'PUT', SLOT, changed, admin)).status).toBe(200);
    expect((await auditLog())[0]).toMatchObject({
      kind: 'set_quick_pack',
      userEmail: 'admin@city-hospital.com',
      action: 'set',
    });
    expect((await send(CITY, 'PUT', SLOT, cityPack, admin)).status).toBe(200);

    // Northstar's admins don't edit City Hospital's packs, nor do its doctors.
    const northstar = await signIn(NORTHSTAR, 'admin@northstar-medical.com');
    expect((await send(NORTHSTAR, 'PUT', SLOT, cityPack, northstar)).status).toBe(403);
    expect((await send(CITY, 'DELETE', SLOT, undefined, await doctor())).status).toBe(403);
  });

  it('hide a default, which then shows no pack in its slot', async () => {
    const admin = await cityAdmin();
    // There is no default in slot 3 for headache, so nothing to hide.
    expect(
      (
        await send(
          CITY,
          'PUT',
          '/hospitals/city-hospital/quick-packs/R51/3',
          {
            hidden: true,
          },
          admin,
        )
      ).status,
    ).toBe(400);
    const res = await send(CITY, 'PUT', SLOT_2, { hidden: true }, admin);
    expect(res.status).toBe(200);
    expect(((await res.json()) as HospitalQuickPacks).hidden).toEqual([
      { diagnosisCode: 'I10', shortcutKey: '2' },
    ]);
    expect((await auditLog())[0]).toMatchObject({ kind: 'set_quick_pack', action: 'hidden' });
  });

  it("replace or hide the defaults on the hospital's pad, and no other hospital's", async () => {
    const cookie = await doctor();
    const catalog = (await (await get(CITY, '/catalog', cookie)).json()) as Catalog;
    const packs = mergeQuickPacks(catalog.quickPacks, await ownPacks(CITY, cookie));

    const i10 = packs.filter((p) => p.diagnosisCode === 'I10');
    expect(i10.map((p) => p.shortcutKey)).toEqual(['1', '3']);
    expect(i10[0].packId).toBe('hospital:I10:1');
    expect(i10[1]).toEqual(
      catalog.quickPacks.find((p) => p.diagnosisCode === 'I10' && p.shortcutKey === '3'),
    );
    expect(packs.length).toBe(catalog.quickPacks.length - 1);

    const northstar = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    expect(
      await (await get(NORTHSTAR, '/hospitals/northstar-medical/quick-packs', northstar)).json(),
    ).toEqual({ packs: [], hidden: [] });
  });

  it('give way to the default again when removed', async () => {
    const admin = await cityAdmin();
    const res = await send(CITY, 'DELETE', SLOT_2, undefined, admin);
    expect(res.status).toBe(200);
    expect(((await res.json()) as HospitalQuickPacks).hidden).toEqual([]);
    expect((await send(ADMIN, 'DELETE', SLOT, undefined, await platformAdmin())).status).toBe(200);
    expect((await auditLog())[0]).toMatchObject({ kind: 'set_quick_pack', action: 'removed' });
    expect((await send(CITY, 'DELETE', SLOT, undefined, admin)).status).toBe(404);
    expect(await ownPacks(CITY, await doctor())).toEqual({ packs: [], hidden: [] });
  });

  it('are hidden from the doctors when quick packs are switched off, not the admins', async () => {
    const admin = await platformAdmin();
    expect((await send(ADMIN, 'PUT', SLOT, cityPack, admin)).status).toBe(200);
    const city = (await (await get(ADMIN, '/hospitals/city-hospital', admin)).json()) as Hospital;
    const off = await send(
      ADMIN,
      'PATCH',
      '/hospitals/city-hospital',
      { features: { ...city.features, enableQuickPacks: false }, rxDesign: city.rxDesign },
      admin,
    );
    expect(off.status).toBe(200);

    expect(await ownPacks(CITY, await doctor())).toEqual({ packs: [], hidden: [] });
    expect((await ownPacks(CITY, await cityAdmin())).packs).toHaveLength(1);
    expect((await ownPacks(ADMIN, admin)).packs).toHaveLength(1);
  });
});
