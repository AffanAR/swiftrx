import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { User } from '@swiftrx/shared/types';

import { createApp } from '../app';
import type { Database } from '../db/client';
import { auditEvents, memberships, sessions, users } from '../db/schema';
import { seed } from '../db/seed';
import { SLOW, freshDatabase } from '../db/testDatabase';

const CITY = 'http://city-hospital.swiftrx.com';
const NORTHSTAR = 'http://northstar-medical.swiftrx.com';
/** What an invite or a reset-link request answers. */
type Link = { user: User; token: string; purpose: 'invite' | 'reset' };

const CITY_ADMIN = { email: 'admin@city-hospital.com', password: 'demo1234' };

let database: Database;

beforeAll(async () => {
  database = await freshDatabase();
  await seed(database.db);
}, SLOW);

afterAll(() => database.close());

function server() {
  let now = new Date('2026-11-02T08:00:00.000Z');
  const app = createApp({ db: database.db, rootDomain: 'swiftrx.com', now: () => now });
  const post = (origin: string, path: string, body: unknown, cookie?: string) =>
    app.request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  return {
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
    post,
    async signIn(origin: string, credentials: { email: string; password: string }) {
      const res = await post(origin, 'login', credentials);
      expect(res.status).toBe(200);
      return res.headers.getSetCookie()[0].split(';')[0];
    },
  };
}

const newDoctor = (email: string) => ({
  email,
  name: 'Dr. New Doctor',
  licenseNo: 'BMDC-A-12345',
  specialty: 'Medicine',
});

describe('invitations', () => {
  it('lets a hospital admin invite a doctor, who sets a password and signs in', async () => {
    const s = server();
    const admin = await s.signIn(CITY, CITY_ADMIN);

    const res = await s.post(CITY, 'invites', newDoctor('new.doctor@city-hospital.com'), admin);
    expect(res.status).toBe(201);
    const { user, token, purpose } = (await res.json()) as Link;
    expect(purpose).toBe('invite');
    expect(user).toMatchObject({
      status: 'invited',
      role: 'doctor',
      hospitalSlug: 'city-hospital',
    });
    expect(token).toMatch(/^[\w-]{43}$/);

    // Stored as invited, with no password, a doctor's membership and an audit row.
    const [row] = await database.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ status: 'invited', passwordHash: null });
    const roles = await database.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, user.id));
    expect(roles).toEqual([{ role: 'doctor' }]);
    const [event] = await database.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.id))
      .limit(1);
    expect(event).toMatchObject({ kind: 'invite_user', actorEmail: 'admin@city-hospital.com' });
    expect(event.details).toEqual({ invitedEmail: 'new.doctor@city-hospital.com' });

    // The link works at this hospital only.
    expect(await (await s.post(NORTHSTAR, 'token-info', { token })).json()).toBeNull();
    expect(await (await s.post(CITY, 'token-info', { token })).json()).toEqual({
      purpose: 'invite',
      email: 'new.doctor@city-hospital.com',
      name: 'Dr. New Doctor',
    });

    // A short password is refused; then it's set, once.
    expect((await s.post(CITY, 'set-password', { token, password: 'short' })).status).toBe(400);
    const set = await s.post(CITY, 'set-password', { token, password: 'a long passphrase' });
    expect(set.status).toBe(204);
    expect(
      (await s.post(CITY, 'set-password', { token, password: 'another passphrase' })).status,
    ).toBe(410);
    expect(await (await s.post(CITY, 'token-info', { token })).json()).toBeNull();

    await s.signIn(CITY, { email: 'new.doctor@city-hospital.com', password: 'a long passphrase' });
  });

  it('refuses anyone but the hospital admin, and an email already in use', async () => {
    const s = server();
    expect((await s.post(CITY, 'invites', newDoctor('x1@city-hospital.com'))).status).toBe(401);

    const doctor = await s.signIn(CITY, {
      email: 'ayesha@city-hospital.com',
      password: 'demo1234',
    });
    expect((await s.post(CITY, 'invites', newDoctor('x2@city-hospital.com'), doctor)).status).toBe(
      403,
    );

    const admin = await s.signIn(CITY, CITY_ADMIN);
    const taken = await s.post(CITY, 'invites', newDoctor('Bilal@City-Hospital.com'), admin);
    expect(taken.status).toBe(409);
    expect(
      (await s.post(CITY, 'invites', { email: 'not an email', name: 'x' }, admin)).status,
    ).toBe(400);
  });

  it('lets an invitation expire after 7 days', async () => {
    const s = server();
    const admin = await s.signIn(CITY, CITY_ADMIN);
    const { token } = (await (
      await s.post(CITY, 'invites', newDoctor('late@city-hospital.com'), admin)
    ).json()) as Link;
    s.advance(7 * 24 * 60 * 60 * 1000);
    expect((await s.post(CITY, 'set-password', { token, password: 'too late now' })).status).toBe(
      410,
    );
  });
});

describe('reset links', () => {
  it('sets a new password and ends the old one and every session', async () => {
    const s = server();
    const bilal = { email: 'bilal@city-hospital.com', password: 'demo1234' };
    await s.signIn(CITY, bilal);
    const admin = await s.signIn(CITY, CITY_ADMIN);

    const res = await s.post(CITY, 'reset-links', { userId: 'd_002' }, admin);
    expect(res.status).toBe(201);
    const { token, purpose } = (await res.json()) as Link;
    expect(purpose).toBe('reset');

    expect((await s.post(CITY, 'set-password', { token, password: 'bilal new pass' })).status).toBe(
      204,
    );
    expect(await database.db.select().from(sessions).where(eq(sessions.userId, 'd_002'))).toEqual(
      [],
    );
    expect((await s.post(CITY, 'login', bilal)).status).toBe(401);
    await s.signIn(CITY, { ...bilal, password: 'bilal new pass' });
  });

  it("only reaches the admin's own hospital", async () => {
    const s = server();
    const admin = await s.signIn(CITY, CITY_ADMIN);
    expect((await s.post(CITY, 'reset-links', { userId: 'd_003' }, admin)).status).toBe(404);
  });

  it('sends a fresh invitation to someone who never accepted one', async () => {
    const s = server();
    const admin = await s.signIn(CITY, CITY_ADMIN);
    const { user } = (await (
      await s.post(CITY, 'invites', newDoctor('again@city-hospital.com'), admin)
    ).json()) as Link;
    const res = await s.post(CITY, 'reset-links', { userId: user.id }, admin);
    expect(await res.json()).toMatchObject({ purpose: 'invite' });
    const pending = await database.db
      .select()
      .from(users)
      .where(and(eq(users.id, user.id), eq(users.status, 'invited')));
    expect(pending).toHaveLength(1);
  });
});
