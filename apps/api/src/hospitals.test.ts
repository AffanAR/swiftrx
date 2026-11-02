import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  AuditEvent,
  Catalog,
  Hospital,
  HospitalProfile,
  Patient,
} from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { demoSeedData, seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';

const CITY = 'http://city-hospital.swiftrx.com';
const NORTHSTAR = 'http://northstar-medical.swiftrx.com';
const ADMIN = 'http://admin.swiftrx.com';

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
const hospitalAdmin = () => signIn(CITY, 'admin@city-hospital.com');
const platformAdmin = () => signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');

const get = (origin: string, path: string, cookie?: string) =>
  app.request(`${origin}/api${path}`, { headers: cookie ? { cookie } : {} });

const send = (origin: string, method: string, path: string, body: unknown, cookie?: string) =>
  app.request(`${origin}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const seedData = demoSeedData();

describe('GET /api/hospitals/:slug/profile', () => {
  it('names the hospital to anyone, and nothing more', async () => {
    const res = await get(CITY, '/hospitals/city-hospital/profile');
    expect(res.status).toBe(200);
    const profile = (await res.json()) as HospitalProfile;
    expect(profile).toMatchObject({
      slug: 'city-hospital',
      name: 'City Hospital',
      plan: 'enterprise',
    });
    expect(profile).not.toHaveProperty('contactEmail');
    expect(profile).not.toHaveProperty('features');
  });

  it('is a 404 for an unknown hospital', async () => {
    expect((await get(CITY, '/hospitals/nowhere/profile')).status).toBe(404);
  });
});

describe('GET /api/hospitals and /api/hospitals/:slug', () => {
  it('lists every hospital, with its settings, to a platform admin only', async () => {
    expect((await get(ADMIN, '/hospitals')).status).toBe(401);
    expect((await get(CITY, '/hospitals', await doctor())).status).toBe(403);

    const res = await get(ADMIN, '/hospitals', await platformAdmin());
    expect(res.status).toBe(200);
    const list = (await res.json()) as Hospital[];
    expect(list.map((h) => h.slug).sort()).toEqual(seedData.hospitals.map((h) => h.slug).sort());
    for (const h of list) {
      const seeded = seedData.hospitals.find((s) => s.slug === h.slug)!;
      // Usage is counted from this month's prescriptions, not the seed's figure.
      expect(h).toEqual({ ...seeded, monthlyRxUsed: 0 });
    }
  });

  it("answers a hospital's own users, and refuses other hospitals'", async () => {
    const cookie = await doctor();
    const res = await get(CITY, '/hospitals/city-hospital', cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Hospital).features).toBeDefined();
    expect((await get(CITY, '/hospitals/northstar-medical', cookie)).status).toBe(403);
    expect((await get(CITY, '/hospitals/city-hospital')).status).toBe(401);
  });
});

describe('PATCH /api/hospitals/:slug', () => {
  it("lets only the platform admin change a hospital's settings (D12)", async () => {
    const before = seedData.hospitals.find((h) => h.slug === 'riverside-clinic')!;
    const settings = {
      features: { ...before.features, maxPatients: 77 },
      rxDesign: { ...before.rxDesign, footerText: 'Changed in a test' },
    };
    expect(
      (await send(CITY, 'PATCH', '/hospitals/city-hospital', settings, await hospitalAdmin()))
        .status,
    ).toBe(403);

    const admin = await platformAdmin();
    const res = await send(ADMIN, 'PATCH', '/hospitals/riverside-clinic', settings, admin);
    expect(res.status).toBe(200);
    const saved = (await (
      await get(ADMIN, '/hospitals/riverside-clinic', admin)
    ).json()) as Hospital;
    expect(saved.features.maxPatients).toBe(77);
    expect(saved.rxDesign.footerText).toBe('Changed in a test');
  });

  it('refuses settings that fail the schema', async () => {
    const admin = await platformAdmin();
    const res = await send(ADMIN, 'PATCH', '/hospitals/riverside-clinic', { features: {} }, admin);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/hospitals', () => {
  const hospital = {
    slug: 'dhaka-care',
    name: 'Dhaka Care',
    city: 'Dhaka',
    country: 'BD',
    plan: 'clinic',
    contactEmail: 'it@dhaka-care.example',
    monthlyRxCap: 500,
  };

  it('creates a trial hospital with default settings, and audits it', async () => {
    const admin = await platformAdmin();
    const res = await send(ADMIN, 'POST', '/hospitals', hospital, admin);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      ...hospital,
      status: 'trial',
      monthlyRxUsed: 0,
      rxDesign: { headerTitle: 'Dhaka Care' },
    });
    expect((await get(CITY, '/hospitals/dhaka-care/profile')).status).toBe(200);

    const log = (await (await get(ADMIN, '/audit-events', admin)).json()) as AuditEvent[];
    expect(log[0]).toMatchObject({
      kind: 'create_hospital',
      hospitalSlug: 'dhaka-care',
      hospitalName: 'Dhaka Care',
    });

    // The same subdomain twice is a conflict.
    expect((await send(ADMIN, 'POST', '/hospitals', hospital, admin)).status).toBe(409);
  });

  it('refuses a reserved subdomain, a bad one, and anyone but the platform admin', async () => {
    const admin = await platformAdmin();
    expect(
      (await send(ADMIN, 'POST', '/hospitals', { ...hospital, slug: 'admin' }, admin)).status,
    ).toBe(400);
    expect(
      (await send(ADMIN, 'POST', '/hospitals', { ...hospital, slug: 'Bad Slug' }, admin)).status,
    ).toBe(400);
    expect(
      (
        await send(
          CITY,
          'POST',
          '/hospitals',
          { ...hospital, slug: 'other' },
          await hospitalAdmin(),
        )
      ).status,
    ).toBe(403);
  });
});

describe('patients', () => {
  it("lists a hospital's patients as the seed has them", async () => {
    const res = await get(CITY, '/hospitals/city-hospital/patients', await doctor());
    expect(res.status).toBe(200);
    const list = (await res.json()) as Patient[];
    const seeded = seedData.patients.filter((p) => p.hospitalSlug === 'city-hospital');
    const byId = (a: Patient, b: Patient) => a.id.localeCompare(b.id);
    expect([...list].sort(byId)).toEqual([...seeded].sort(byId));
  });

  it("refuses another hospital's patients, and answers the platform admin", async () => {
    expect((await get(CITY, '/hospitals/northstar-medical/patients', await doctor())).status).toBe(
      403,
    );
    expect((await get(NORTHSTAR, '/hospitals/northstar-medical/patients')).status).toBe(401);
    expect(
      (await get(ADMIN, '/hospitals/northstar-medical/patients', await platformAdmin())).status,
    ).toBe(200);
  });

  it('adds a patient with their allergies, and audits it', async () => {
    const cookie = await doctor();
    const res = await send(
      CITY,
      'POST',
      '/hospitals/city-hospital/patients',
      {
        name: 'Rahima Begum',
        age: 34,
        sex: 'F',
        weightKg: 58,
        contact: '+880-1711-000000',
        allergyStatus: 'recorded',
        allergies: ['Sulfa drugs'],
        activeProblems: ['Asthma'],
      },
      cookie,
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as Patient;
    expect(created).toMatchObject({
      hospitalSlug: 'city-hospital',
      name: 'Rahima Begum',
      allergyStatus: 'recorded',
      allergies: ['Sulfa drugs'],
      activeMedications: [],
    });

    const list = (await (
      await get(CITY, '/hospitals/city-hospital/patients', cookie)
    ).json()) as Patient[];
    expect(list.map((p) => p.id)).toContain(created.id);

    const log = (await (
      await get(ADMIN, '/hospitals/city-hospital/audit-events', await platformAdmin())
    ).json()) as AuditEvent[];
    expect(log[0]).toMatchObject({
      kind: 'create_patient',
      patientId: created.id,
      userEmail: 'ayesha@city-hospital.com',
    });
  });

  it('refuses a patient whose allergies contradict the status, and the platform admin', async () => {
    const patient = {
      name: 'No Allergies',
      age: 5,
      sex: 'M',
      weightKg: 18,
      contact: '',
      allergyStatus: 'recorded',
      allergies: [],
      activeProblems: [],
    };
    expect(
      (await send(CITY, 'POST', '/hospitals/city-hospital/patients', patient, await doctor()))
        .status,
    ).toBe(400);
    expect(
      (
        await send(
          ADMIN,
          'POST',
          '/hospitals/city-hospital/patients',
          { ...patient, allergyStatus: 'none_known' },
          await platformAdmin(),
        )
      ).status,
    ).toBe(403);
  });
});

describe('limits and status', () => {
  /** Change some of City Hospital's features, as the platform admin. */
  async function setCityFeatures(patch: Partial<Hospital['features']>) {
    const admin = await platformAdmin();
    const city = (await (await get(ADMIN, '/hospitals/city-hospital', admin)).json()) as Hospital;
    const res = await send(
      ADMIN,
      'PATCH',
      '/hospitals/city-hospital',
      { features: { ...city.features, ...patch }, rxDesign: city.rxDesign },
      admin,
    );
    expect(res.status).toBe(200);
    return city.features;
  }

  const patient = (name: string) => ({
    name,
    age: 30,
    sex: 'F',
    weightKg: 55,
    contact: '',
    allergyStatus: 'not_recorded',
    allergies: [],
    activeProblems: [],
  });

  it("refuses a patient over the hospital's maxPatients", async () => {
    const cookie = await doctor();
    const roster = (await (
      await get(CITY, '/hospitals/city-hospital/patients', cookie)
    ).json()) as Patient[];
    const before = await setCityFeatures({ maxPatients: roster.length });

    const res = await send(
      CITY,
      'POST',
      '/hospitals/city-hospital/patients',
      patient('One Too Many'),
      cookie,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain(`${roster.length} patients`);

    await setCityFeatures({ maxPatients: before.maxPatients });
    expect(
      (await send(CITY, 'POST', '/hospitals/city-hospital/patients', patient('Fits Again'), cookie))
        .status,
    ).toBe(201);
  });

  it('audits a settings change once, and not a save that changes nothing', async () => {
    const admin = await platformAdmin();
    const count = async () =>
      (
        (await (
          await get(ADMIN, '/hospitals/riverside-clinic/audit-events', admin)
        ).json()) as AuditEvent[]
      ).filter((e) => e.kind === 'update_hospital').length;
    const riverside = (await (
      await get(ADMIN, '/hospitals/riverside-clinic', admin)
    ).json()) as Hospital;
    const before = await count();

    const changed = { ...riverside.rxDesign, headerSubtitle: 'Audited in a test' };
    await send(
      ADMIN,
      'PATCH',
      '/hospitals/riverside-clinic',
      { features: riverside.features, rxDesign: changed },
      admin,
    );
    const log = (await (
      await get(ADMIN, '/hospitals/riverside-clinic/audit-events', admin)
    ).json()) as AuditEvent[];
    expect(log[0]).toMatchObject({ kind: 'update_hospital', changed: ['rxDesign'] });

    // Saving the same settings again records nothing.
    await send(
      ADMIN,
      'PATCH',
      '/hospitals/riverside-clinic',
      { features: riverside.features, rxDesign: changed },
      admin,
    );
    expect(await count()).toBe(before + 1);
  });

  it('suspends a hospital, which ends its sessions and refuses sign-in, and reactivates it', async () => {
    const sana = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    expect((await get(NORTHSTAR, '/hospitals/northstar-medical', sana)).status).toBe(200);

    // Only the platform admin.
    expect(
      (
        await send(
          NORTHSTAR,
          'PATCH',
          '/hospitals/northstar-medical/status',
          { status: 'suspended' },
          sana,
        )
      ).status,
    ).toBe(403);

    const admin = await platformAdmin();
    const res = await send(
      ADMIN,
      'PATCH',
      '/hospitals/northstar-medical/status',
      { status: 'suspended' },
      admin,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Hospital).status).toBe('suspended');

    expect((await get(NORTHSTAR, '/hospitals/northstar-medical', sana)).status).toBe(401);
    const login = await send(NORTHSTAR, 'POST', '/auth/login', {
      email: 'sana@northstar-medical.com',
      password: 'demo1234',
    });
    expect(login.status).toBe(403);

    const log = (await (
      await get(ADMIN, '/hospitals/northstar-medical/audit-events', admin)
    ).json()) as AuditEvent[];
    expect(log[0]).toMatchObject({
      kind: 'change_hospital_status',
      from: 'active',
      to: 'suspended',
    });

    await send(ADMIN, 'PATCH', '/hospitals/northstar-medical/status', { status: 'active' }, admin);
    await signIn(NORTHSTAR, 'sana@northstar-medical.com');
  });

  it('refuses a status that does not exist', async () => {
    const admin = await platformAdmin();
    expect(
      (
        await send(
          ADMIN,
          'PATCH',
          '/hospitals/northstar-medical/status',
          { status: 'closed' },
          admin,
        )
      ).status,
    ).toBe(400);
  });

  it("leaves switched-off features out of the hospital's catalog", async () => {
    const cookie = await doctor();
    const catalog = async () => (await (await get(CITY, '/catalog', cookie)).json()) as Catalog;
    const full = await catalog();
    expect(full.brands.length).toBeGreaterThan(0);
    expect(full.quickPacks.length).toBeGreaterThan(0);

    const before = await setCityFeatures({
      enableBrandSearch: false,
      enableQuickPacks: false,
      enableInvestigations: false,
    });
    const trimmed = await catalog();
    expect(trimmed.brands).toEqual([]);
    expect(trimmed.quickPacks).toEqual([]);
    expect(trimmed.investigations).toEqual([]);
    expect(trimmed.diagnoses.some((d) => d.recommendedInvestigations)).toBe(false);
    expect(trimmed.drugs.length).toBe(full.drugs.length);

    // Another hospital's switches are its own: the seed has Northstar's brand
    // search off and its quick packs on.
    const sana = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    const northstar = (await (await get(NORTHSTAR, '/catalog', sana)).json()) as Catalog;
    expect(northstar.brands).toEqual([]);
    expect(northstar.quickPacks.length).toBe(full.quickPacks.length);

    await setCityFeatures(before);
    expect((await catalog()).brands.length).toBe(full.brands.length);
  });
});
