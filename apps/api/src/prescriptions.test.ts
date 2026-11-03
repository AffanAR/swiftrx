import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  AuditEvent,
  Hospital,
  PrescriptionDraft,
  RxMedication,
  SignedRx,
} from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { hospitals } from './db/schema';
import { seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';
import { RULE_SET } from '@swiftrx/shared/rules';

import { rxHash } from './rxHash';

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

const get = (origin: string, path: string, cookie?: string) =>
  app.request(`${origin}/api${path}`, { headers: cookie ? { cookie } : {} });

const post = (origin: string, path: string, body: unknown, cookie?: string) =>
  app.request(`${origin}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const ayesha = () => signIn(CITY, 'ayesha@city-hospital.com');

/** A pad row, as the Rx pad sends it. */
const row = (drugId: string, patch: Partial<RxMedication> = {}): RxMedication => ({
  rowId: `r_${drugId}_${Math.random().toString(36).slice(2, 6)}`,
  drugId,
  genericName: 'as the pad had it',
  dosage: { value: 5, unit: 'mg' },
  frequency: 'QD',
  durationDays: 30,
  instructions: 'Morning',
  ...patch,
});

// City Hospital's p_002 (Fatima) has no known allergies; p_001 (Bilal) is
// allergic to penicillin. Generic ids from scripts/bd-medicines/reviewed.json.
const AMLODIPINE = 'g62';
const AMOXICILLIN = 'g69';

const draft = (patch: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({
  patientId: 'p_002',
  diagnosisCode: 'I10',
  medications: [row(AMLODIPINE, { brandName: 'Camlodin', form: 'Tablet', strength: '5 mg' })],
  investigations: [],
  ...patch,
});

const sign = async (body: PrescriptionDraft, cookie?: string) =>
  post(CITY, '/hospitals/city-hospital/prescriptions', body, cookie ?? (await ayesha()));

describe('GET prescriptions', () => {
  it("lists a hospital's prescriptions to its users, newest first, each with its hash", async () => {
    const res = await get(CITY, '/hospitals/city-hospital/prescriptions', await ayesha());
    expect(res.status).toBe(200);
    const list = (await res.json()) as SignedRx[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.hospitalSlug === 'city-hospital')).toBe(true);
    const times = list.map((r) => r.signedAt);
    expect([...times].sort().reverse()).toEqual(times);
    // The stored rows still hash to what was recorded at signing.
    for (const rx of list) expect(rx.recordHash).toBe(rxHash(rx));
  });

  it("refuses another hospital's, and gives the platform admin every hospital's", async () => {
    expect(
      (await get(CITY, '/hospitals/northstar-medical/prescriptions', await ayesha())).status,
    ).toBe(403);
    expect((await get(CITY, '/prescriptions', await ayesha())).status).toBe(403);
    const all = (await (
      await get(ADMIN, '/prescriptions', await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234'))
    ).json()) as SignedRx[];
    expect(new Set(all.map((r) => r.hospitalSlug)).size).toBeGreaterThan(1);
  });
});

describe('POST /api/hospitals/:slug/prescriptions', () => {
  it('signs with names from the catalog, a hash, an audit row and a count', async () => {
    const cookie = await ayesha();
    const usedBefore = (
      (await (await get(CITY, '/hospitals/city-hospital', cookie)).json()) as Hospital
    ).monthlyRxUsed;

    const res = await sign(draft(), cookie);
    expect(res.status).toBe(201);
    const rx = (await res.json()) as SignedRx;
    expect(rx).toMatchObject({
      hospitalSlug: 'city-hospital',
      patient: { id: 'p_002', name: 'Fatima Noor' },
      diagnosis: { code: 'I10' },
      doctorId: 'd_001',
      doctorName: 'Dr. Ayesha Khan',
      doctorLicense: 'BMDC A-44121',
    });
    // The generic's name comes from the catalog, not from the request.
    expect(rx.medications[0]).toMatchObject({
      genericName: 'Amlodipine Besilate',
      brandName: 'Camlodin',
      form: 'Tablet',
      strength: '5 mg',
    });
    expect(rx.id).toMatch(/^rx_[0-9a-f]{12}$/);
    expect(rx.recordHash).toBe(rxHash(rx));
    expect(rx.ruleSetVersion).toBe(RULE_SET.version);
    expect(rx.safetyOverride).toBeUndefined();

    // Stored exactly as answered.
    const list = (await (
      await get(CITY, '/hospitals/city-hospital/prescriptions', cookie)
    ).json()) as SignedRx[];
    expect(list[0]).toEqual(rx);

    const admin = await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');
    const log = (await (
      await get(ADMIN, '/hospitals/city-hospital/audit-events', admin)
    ).json()) as AuditEvent[];
    expect(log[0]).toMatchObject({ kind: 'sign_rx', rxId: rx.id, patientName: 'Fatima Noor' });

    const usedAfter = (
      (await (await get(CITY, '/hospitals/city-hospital', cookie)).json()) as Hospital
    ).monthlyRxUsed;
    expect(usedAfter).toBe(usedBefore + 1);
  });

  it('needs a reason to sign through an allergy, and stores the alerts it found', async () => {
    const cookie = await ayesha();
    const allergic = draft({
      patientId: 'p_001',
      diagnosisCode: 'J02.9',
      medications: [row(AMOXICILLIN)],
    });

    const none = await sign(allergic, cookie);
    expect(none.status).toBe(422);
    expect(((await none.json()) as { alerts: unknown[] }).alerts).toEqual([
      expect.objectContaining({ severity: 'critical', type: 'allergy', drugId: AMOXICILLIN }),
    ]);
    expect((await sign({ ...allergic, overrideReason: 'too short' }, cookie)).status).toBe(422);

    const res = await sign(
      { ...allergic, overrideReason: 'Tested tolerance last year, no reaction' },
      cookie,
    );
    expect(res.status).toBe(201);
    const rx = (await res.json()) as SignedRx;
    expect(rx.safetyOverride).toEqual({
      reason: 'Tested tolerance last year, no reaction',
      alerts: [expect.objectContaining({ type: 'allergy' })],
    });
  });

  it("checks the hospital's limits and switches", async () => {
    const cookie = await ayesha();
    // City Hospital allows 10 medicines on one prescription.
    const eleven = Array.from({ length: 11 }, () => row(AMLODIPINE));
    expect((await sign(draft({ medications: eleven }), cookie)).status).toBe(400);

    // The monthly cap, reached.
    const [city] = await database.db
      .select({ cap: hospitals.monthlyRxCap })
      .from(hospitals)
      .where(eq(hospitals.slug, 'city-hospital'));
    const used = ((await (await get(CITY, '/hospitals/city-hospital', cookie)).json()) as Hospital)
      .monthlyRxUsed;
    await database.db.execute(
      sql`update hospitals set monthly_rx_cap = ${used} where slug = 'city-hospital'`,
    );
    const capped = await sign(draft(), cookie);
    expect(capped.status).toBe(409);
    expect(((await capped.json()) as { error: string }).error).toContain('this month');
    await database.db.execute(
      sql`update hospitals set monthly_rx_cap = ${city.cap} where slug = 'city-hospital'`,
    );

    // Northstar has brand search switched off.
    const sana = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    const branded = await post(
      NORTHSTAR,
      '/hospitals/northstar-medical/prescriptions',
      draft({ patientId: 'p_004', diagnosisCode: 'J02.9' }),
      sana,
    );
    expect(branded.status).toBe(400);
  });

  it('refuses what the catalog or the hospital does not have', async () => {
    const cookie = await ayesha();
    const refused = async (body: PrescriptionDraft) => (await sign(body, cookie)).status;
    expect(await refused(draft({ patientId: 'p_004' }))).toBe(400); // Northstar's patient
    expect(await refused(draft({ diagnosisCode: 'X99' }))).toBe(400);
    expect(await refused(draft({ medications: [row('g_nope')] }))).toBe(400);
    expect(await refused(draft({ medications: [row(AMLODIPINE, { brandName: 'Napa' })] }))).toBe(
      400,
    ); // Napa is paracetamol
    expect(
      await refused(draft({ investigations: [{ code: 'NOPE', name: 'Made up', type: 'lab' }] })),
    ).toBe(400);
  });

  it('lets only a licensed doctor of the hospital sign', async () => {
    const admin = await signIn(CITY, 'admin@city-hospital.com');
    expect((await sign(draft(), admin)).status).toBe(403);
    const platform = await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');
    expect(
      (await post(ADMIN, '/hospitals/city-hospital/prescriptions', draft(), platform)).status,
    ).toBe(403);
    expect((await post(CITY, '/hospitals/city-hospital/prescriptions', draft())).status).toBe(401);
  });

  it('keeps signed prescriptions append-only', async () => {
    await expect(
      database.db.execute(sql`update prescriptions set doctor_name = 'Someone else'`),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
    });
    await expect(database.db.execute(sql`delete from prescription_items`)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
    });
  });
});
