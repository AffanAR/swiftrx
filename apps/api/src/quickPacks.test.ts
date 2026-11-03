import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mergeQuickPacks } from '@swiftrx/shared/quickPacks';
import type { AuditEvent, Catalog, Hospital, QuickPack } from '@swiftrx/shared/types';

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

const auditLog = async () =>
  (await (
    await get(ADMIN, '/hospitals/city-hospital/audit-events', await platformAdmin())
  ).json()) as AuditEvent[];

describe('a hospital’s own quick packs', () => {
  it('start empty, and only the hospital and the SwiftRx team read them', async () => {
    const res = await get(CITY, '/hospitals/city-hospital/quick-packs', await doctor());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect((await get(CITY, '/hospitals/city-hospital/quick-packs')).status).toBe(401);
    expect(
      (await get(NORTHSTAR, '/hospitals/city-hospital/quick-packs', await doctor())).status,
    ).toBe(401);
    expect(
      (
        await get(
          NORTHSTAR,
          '/hospitals/city-hospital/quick-packs',
          await signIn(NORTHSTAR, 'sana@northstar-medical.com'),
        )
      ).status,
    ).toBe(403);
  });

  it('are set by the SwiftRx team only, checked against the catalog, and audited', async () => {
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
    expect(
      (await send(ADMIN, 'PUT', '/hospitals/nowhere/quick-packs/I10/1', cityPack, admin)).status,
    ).toBe(404);

    const res = await send(ADMIN, 'PUT', SLOT, cityPack, admin);
    expect(res.status).toBe(200);
    const pack = (await res.json()) as QuickPack;
    expect(pack).toMatchObject({
      packId: 'hospital:I10:1',
      diagnosisCode: 'I10',
      shortcutKey: '1',
      recommendationReason: cityPack.recommendationReason,
    });
    expect(pack.medications[0].genericName).toMatch(/amlodipine/i);
    expect((await auditLog())[0]).toMatchObject({
      kind: 'set_quick_pack',
      diagnosisCode: 'I10',
      shortcutKey: '1',
      action: 'set',
    });

    // The same pack again records nothing.
    const before = (await auditLog()).length;
    expect((await send(ADMIN, 'PUT', SLOT, cityPack, admin)).status).toBe(200);
    expect((await auditLog()).length).toBe(before);

    // A change is audited again.
    const changed = {
      ...cityPack,
      medications: [{ ...cityPack.medications[0], drugId: LISINOPRIL }],
    };
    expect((await send(ADMIN, 'PUT', SLOT, changed, admin)).status).toBe(200);
    expect((await auditLog()).length).toBe(before + 1);
    expect((await send(ADMIN, 'PUT', SLOT, cityPack, admin)).status).toBe(200);
  });

  it("replace the default in their slot on the hospital's pad, and no other hospital's", async () => {
    const cookie = await doctor();
    const catalog = (await (await get(CITY, '/catalog', cookie)).json()) as Catalog;
    const own = (await (
      await get(CITY, '/hospitals/city-hospital/quick-packs', cookie)
    ).json()) as QuickPack[];
    const packs = mergeQuickPacks(catalog.quickPacks, own);

    const i10 = packs.filter((p) => p.diagnosisCode === 'I10');
    expect(i10.map((p) => p.shortcutKey)).toEqual(['1', '2', '3']);
    expect(i10[0].packId).toBe('hospital:I10:1');
    expect(i10.slice(1)).toEqual(
      catalog.quickPacks.filter((p) => p.diagnosisCode === 'I10' && p.shortcutKey !== '1'),
    );
    expect(packs.length).toBe(catalog.quickPacks.length);

    const northstar = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    expect(
      await (await get(NORTHSTAR, '/hospitals/northstar-medical/quick-packs', northstar)).json(),
    ).toEqual([]);
  });

  it('give way to the default again when removed', async () => {
    const admin = await platformAdmin();
    expect((await send(CITY, 'DELETE', SLOT, undefined, await doctor())).status).toBe(403);
    expect((await send(ADMIN, 'DELETE', SLOT, undefined, admin)).status).toBe(204);
    expect((await auditLog())[0]).toMatchObject({ kind: 'set_quick_pack', action: 'removed' });
    expect((await send(ADMIN, 'DELETE', SLOT, undefined, admin)).status).toBe(404);
    expect(
      await (await get(CITY, '/hospitals/city-hospital/quick-packs', await doctor())).json(),
    ).toEqual([]);
  });

  it("are hidden from the hospital's users when quick packs are switched off", async () => {
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

    expect(
      await (await get(CITY, '/hospitals/city-hospital/quick-packs', await doctor())).json(),
    ).toEqual([]);
    // The SwiftRx team still sees them, to edit.
    const forAdmin = (await (
      await get(ADMIN, '/hospitals/city-hospital/quick-packs', admin)
    ).json()) as QuickPack[];
    expect(forAdmin).toHaveLength(1);
  });
});
