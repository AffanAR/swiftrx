import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuditEvent, User } from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { seed } from './db/seed';
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

const get = (origin: string, path: string, cookie?: string) =>
  app.request(`${origin}/api${path}`, { headers: cookie ? { cookie } : {} });

describe('GET /api/hospitals/:slug/doctors', () => {
  it("lists a hospital's doctors to its own users, and no hash", async () => {
    const cookie = await signIn(CITY, 'ayesha@city-hospital.com');
    const res = await get(CITY, '/hospitals/city-hospital/doctors', cookie);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/argon2|password/i);
    const doctors = JSON.parse(text) as User[];
    expect(doctors.map((d) => d.id)).toEqual(['d_001', 'd_002']);
    expect(doctors[0]).toMatchObject({ role: 'doctor', hospitalSlug: 'city-hospital' });
  });

  it("refuses another hospital's doctors, and anyone signed out", async () => {
    const cookie = await signIn(CITY, 'ayesha@city-hospital.com');
    expect((await get(CITY, '/hospitals/northstar-medical/doctors', cookie)).status).toBe(403);
    expect((await get(NORTHSTAR, '/hospitals/northstar-medical/doctors', cookie)).status).toBe(401);
    expect((await get(CITY, '/hospitals/city-hospital/doctors')).status).toBe(401);
  });

  it("shows a platform admin any hospital's doctors", async () => {
    const cookie = await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');
    const res = await get(ADMIN, '/hospitals/northstar-medical/doctors', cookie);
    expect(((await res.json()) as User[]).map((d) => d.id)).toEqual(['d_003']);
  });
});

describe('audit events', () => {
  it('shows a platform admin every event, newest first, with sign-ins', async () => {
    const cookie = await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');
    const events = (await (await get(ADMIN, '/audit-events', cookie)).json()) as AuditEvent[];
    expect(events[0]).toMatchObject({
      kind: 'login',
      userEmail: 'admin@swiftrx.com',
      hospitalSlug: null,
    });
    const times = events.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times);
    const signed = events.find((e) => e.kind === 'sign_rx');
    expect(signed).toMatchObject({ hospitalSlug: expect.any(String), rxId: expect.any(String) });
  });

  it("shows a hospital admin their hospital's log, and nothing more", async () => {
    const cookie = await signIn(CITY, 'admin@city-hospital.com');
    const res = await get(CITY, '/hospitals/city-hospital/audit-events', cookie);
    const events = (await res.json()) as AuditEvent[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.hospitalSlug === 'city-hospital')).toBe(true);
    expect((await get(CITY, '/hospitals/northstar-medical/audit-events', cookie)).status).toBe(403);
    expect((await get(CITY, '/audit-events', cookie)).status).toBe(403);
  });

  it('keeps doctors out of the log', async () => {
    const cookie = await signIn(CITY, 'ayesha@city-hospital.com');
    expect((await get(CITY, '/hospitals/city-hospital/audit-events', cookie)).status).toBe(403);
  });
});
