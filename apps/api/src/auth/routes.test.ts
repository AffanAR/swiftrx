import { hash } from '@node-rs/argon2';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthSession } from '@swiftrx/shared/types';

import { createApp, type AppDeps } from '../app';
import type { Database } from '../db/client';
import { auditEvents, hospitals, memberships, sessions, users } from '../db/schema';
import { seed } from '../db/seed';
import { SLOW, freshDatabase } from '../db/testDatabase';
import { SESSION_TTL_MS, hashToken } from './routes';

const CITY = 'http://city-hospital.swiftrx.com';
const NORTHSTAR = 'http://northstar-medical.swiftrx.com';
const ADMIN = 'http://admin.swiftrx.com';

const AYESHA = { email: 'ayesha@city-hospital.com', password: 'demo1234' }; // City doctor
const BILAL = { email: 'bilal@city-hospital.com', password: 'demo1234' }; // City doctor
const CITY_ADMIN = { email: 'admin@city-hospital.com', password: 'demo1234' };
const SANA = { email: 'sana@northstar-medical.com', password: 'demo1234' }; // Northstar doctor
const PLATFORM_ADMIN = { email: 'admin@swiftrx.com', password: 'admin1234' };

let database: Database;

beforeAll(async () => {
  database = await freshDatabase();
  await seed(database.db);
}, SLOW);

afterAll(() => database.close());

/**
 * An app over the seeded database, with a clock the test moves. The visitor's
 * address comes from an x-test-ip header, so a test can be several visitors.
 */
function server(deps: Partial<AppDeps> = {}) {
  let now = new Date('2026-11-02T08:00:00.000Z');
  const app = createApp({
    db: database.db,
    rootDomain: 'swiftrx.com',
    now: () => now,
    clientIp: (c) => c.req.header('x-test-ip') ?? '203.0.113.7',
    logError: () => {},
    ...deps,
  });

  return {
    app,
    now: () => now,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    login(
      origin: string,
      credentials: { email: string; password: string },
      headers: Record<string, string> = {},
      query = '',
    ) {
      return app.request(`${origin}/api/auth/login${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...headers },
        body: JSON.stringify(credentials),
      });
    },
    me(origin: string, cookie?: string, headers: Record<string, string> = {}, query = '') {
      return app.request(`${origin}/api/auth/me${query}`, {
        headers: { ...(cookie ? { cookie } : {}), ...headers },
      });
    },
    /** Who /me says is signed in: their user id, or null. */
    async whoIs(origin: string, cookie?: string, headers: Record<string, string> = {}, query = '') {
      const res = await this.me(origin, cookie, headers, query);
      expect(res.status).toBe(200);
      return ((await res.json()) as AuthSession | null)?.session.userId ?? null;
    },
    logout(origin: string, cookie?: string) {
      return app.request(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: { origin, ...(cookie ? { cookie } : {}) },
      });
    },
  };
}

/** The response's one Set-Cookie, split up; `pair` goes back in a Cookie header. */
function cookieOf(res: Response) {
  const [header] = res.headers.getSetCookie();
  expect(header).toBeDefined();
  const [pair, ...attributes] = header.split(/;\s*/);
  const [name, value] = pair.split('=');
  return { pair, name, value, attributes };
}

async function signedIn(
  s: ReturnType<typeof server>,
  origin: string,
  credentials: { email: string; password: string },
) {
  const res = await s.login(origin, credentials);
  expect(res.status).toBe(200);
  return { cookie: cookieOf(res), body: (await res.json()) as AuthSession };
}

async function sessionRows(userId: string) {
  return database.db.select().from(sessions).where(eq(sessions.userId, userId));
}

async function hospitalId(slug: string) {
  const [h] = await database.db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.slug, slug));
  return h.id;
}

describe('POST /api/auth/login', () => {
  it('signs a doctor in at their hospital, with a host-only httpOnly cookie', async () => {
    const s = server();
    const res = await s.login(CITY, AYESHA);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as AuthSession;
    const issuedAt = s.now().getTime();
    expect(body.session).toEqual({
      role: 'doctor',
      userId: 'd_001',
      hospitalSlug: 'city-hospital',
      issuedAt,
      expiresAt: issuedAt + SESSION_TTL_MS,
      email: 'ayesha@city-hospital.com',
      name: 'Dr. Ayesha Khan',
      licenseNo: 'PMDC-44121',
    });
    expect(body.user).toMatchObject({
      id: 'd_001',
      role: 'doctor',
      hospitalSlug: 'city-hospital',
      status: 'active',
      licenseNo: 'PMDC-44121',
      lastLoginAt: s.now().toISOString(),
    });
    expect(body.memberships).toEqual([{ hospitalSlug: 'city-hospital', role: 'doctor' }]);

    const cookie = cookieOf(res);
    expect(cookie.name).toBe('swiftrx_portal');
    expect(cookie.value).toMatch(/^[\w-]{43}$/); // 256 random bits
    expect(cookie.attributes).toEqual(
      expect.arrayContaining(['Max-Age=43200', 'Path=/', 'HttpOnly', 'SameSite=Lax']),
    );
    // Host-only, and not Secure on plain HTTP (dev).
    expect(cookie.attributes.some((a) => /^(Domain|Secure)/i.test(a))).toBe(false);
  });

  it('never sends a password hash', async () => {
    const s = server();
    for (const res of [await s.login(CITY, AYESHA), await s.login(ADMIN, PLATFORM_ADMIN)]) {
      const text = await res.text();
      expect(text).not.toMatch(/argon2|passwordHash|password_hash|demo1234|admin1234/);
    }
  });

  it('makes the cookie Secure and __Host- prefixed over HTTPS', async () => {
    const s = server();
    const res = await s.login(CITY, AYESHA, { 'x-forwarded-proto': 'https' });
    const cookie = cookieOf(res);
    expect(cookie.name).toBe('__Host-swiftrx_portal');
    expect(cookie.attributes).toEqual(expect.arrayContaining(['Secure', 'Path=/']));

    const https = { 'x-forwarded-proto': 'https' };
    expect(await s.whoIs(CITY, cookie.pair, https)).toBe('d_001');
    // Over plain HTTP the server only reads the plain name.
    expect(await s.whoIs(CITY, cookie.pair)).toBeNull();
  });

  it('marks cookies Secure on plain HTTP too when told to (production)', async () => {
    const cookie = cookieOf(await server({ secureCookies: true }).login(CITY, AYESHA));
    expect(cookie.name).toBe('__Host-swiftrx_portal');
    expect(cookie.attributes).toContain('Secure');
  });

  it('audits the sign-in and records when it happened', async () => {
    const s = server();
    await signedIn(s, CITY, BILAL);

    const [event] = await database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, 'd_002'))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    expect(event).toMatchObject({
      kind: 'login',
      actorEmail: 'bilal@city-hospital.com',
      hospitalId: await hospitalId('city-hospital'),
      ip: '203.0.113.7',
      at: s.now(),
    });
    const [user] = await database.db.select().from(users).where(eq(users.id, 'd_002'));
    expect(user.lastLoginAt).toEqual(s.now());
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    const s = server();
    const wrong = await s.login(CITY, { ...AYESHA, password: 'demo12345' });
    const unknown = await s.login(CITY, { email: 'nobody@city-hospital.com', password: 'x' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.getSetCookie()).toEqual([]);
  });

  it('matches the email in any case, and ignores spaces around it', async () => {
    const s = server();
    const res = await s.login(CITY, { email: '  Ayesha@City-Hospital.COM ', password: 'demo1234' });
    expect(res.status).toBe(200);
  });

  it('refuses a doctor at another hospital', async () => {
    const res = await server().login(NORTHSTAR, AYESHA);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'wrong-hospital' });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('signs platform admins in at the admin host only', async () => {
    const s = server();
    const { body, cookie } = await signedIn(s, ADMIN, PLATFORM_ADMIN);
    expect(body.session).toMatchObject({ role: 'platform_admin', userId: 'u_admin_001' });
    expect(body.session).not.toHaveProperty('hospitalSlug');
    expect(body.user).toMatchObject({ role: 'platform_admin', hospitalSlug: null });
    expect(body.memberships).toEqual([]);
    expect(cookie.name).toBe('swiftrx_admin');

    const atHospital = await s.login(CITY, PLATFORM_ADMIN);
    expect(atHospital.status).toBe(403);
    expect(await atHospital.json()).toMatchObject({ reason: 'wrong-hospital' });
  });

  it('refuses everyone else at the admin host', async () => {
    for (const who of [AYESHA, CITY_ADMIN]) {
      const res = await server().login(ADMIN, who);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ reason: 'wrong-role' });
    }
  });

  it('treats the bare root domain and plain localhost as the admin host', async () => {
    const s = server();
    expect((await s.login('http://swiftrx.com', PLATFORM_ADMIN)).status).toBe(200);
    expect((await s.login('http://localhost:5175', PLATFORM_ADMIN)).status).toBe(200);
  });

  it('takes ?hospital= only where the host names no hospital', async () => {
    const s = server();
    const local = await s.login('http://localhost:5174', AYESHA, {}, '?hospital=city-hospital');
    expect(local.status).toBe(200);
    expect(((await local.json()) as AuthSession).session).toMatchObject({
      hospitalSlug: 'city-hospital',
    });

    // On Northstar's own host the host wins, so this is a sign-in at Northstar.
    const res = await s.login(NORTHSTAR, AYESHA, {}, '?hospital=city-hospital');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'wrong-hospital' });
  });

  it('answers 404 where there is no sign-in', async () => {
    const s = server();
    for (const origin of ['http://swiftrx.onrender.com', 'http://no-such-hospital.swiftrx.com']) {
      const res = await s.login(origin, AYESHA);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ reason: 'no-hospital' });
    }
  });

  it('checks the password before it says anything about the account', async () => {
    const s = server();
    await database.db.update(users).set({ status: 'disabled' }).where(eq(users.id, 'd_002'));
    try {
      const wrong = await s.login(CITY, { ...BILAL, password: 'nope' });
      expect(wrong.status).toBe(401);
      const right = await s.login(CITY, BILAL);
      expect(right.status).toBe(403);
      expect(await right.json()).toMatchObject({ reason: 'disabled' });
    } finally {
      await database.db.update(users).set({ status: 'active' }).where(eq(users.id, 'd_002'));
    }
  });

  it('refuses a user who has no password yet', async () => {
    const where = eq(users.id, 'u_hadmin_ns');
    const [{ passwordHash }] = await database.db.select().from(users).where(where);
    await database.db.update(users).set({ passwordHash: null }).where(where);
    try {
      const res = await server().login(NORTHSTAR, {
        email: 'admin@northstar-medical.com',
        password: 'demo1234',
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ reason: 'invalid-credentials' });
    } finally {
      await database.db.update(users).set({ passwordHash }).where(where);
    }
  });

  it('refuses sign-in at a suspended hospital', async () => {
    const id = await hospitalId('northstar-medical');
    await database.db.update(hospitals).set({ status: 'suspended' }).where(eq(hospitals.id, id));
    try {
      const res = await server().login(NORTHSTAR, SANA);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ reason: 'hospital-suspended' });
    } finally {
      await database.db.update(hospitals).set({ status: 'active' }).where(eq(hospitals.id, id));
    }
  });

  it('rejects a body without an email and a password', async () => {
    const s = server();
    for (const body of ['{}', '{"email":"a@b.c"}', 'not json', '{"email":"a@b.c","password":""}']) {
      const res = await s.app.request(`${CITY}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: CITY },
        body,
      });
      expect(res.status).toBe(400);
    }
  });

  it('refuses a body that is not JSON, which an HTML form would send', async () => {
    const res = await server().app.request(`${CITY}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: CITY },
      body: 'email=ayesha%40city-hospital.com&password=demo1234',
    });
    expect(res.status).toBe(415);
  });

  it('refuses a sign-in posted from another origin, even another hospital', async () => {
    const s = server();
    for (const origin of ['https://evil.example', NORTHSTAR, 'null']) {
      const res = await s.login(CITY, AYESHA, { origin });
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    const crossSite = await s.app.request(`${CITY}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify(AYESHA),
    });
    expect(crossSite.status).toBe(403);
  });

  it('upgrades a hash made with older parameters when its owner signs in', async () => {
    const weak = await hash('demo1234', { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    await database.db
      .update(users)
      .set({ passwordHash: weak })
      .where(eq(users.id, 'u_hadmin_city'));

    await signedIn(server(), CITY, CITY_ADMIN);

    const [user] = await database.db.select().from(users).where(eq(users.id, 'u_hadmin_city'));
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("ends this browser's previous session when it signs in again", async () => {
    const s = server();
    const first = await signedIn(s, CITY, AYESHA);
    const second = await s.login(CITY, AYESHA, { cookie: first.cookie.pair });
    expect(second.status).toBe(200);
    const tokens = (await sessionRows('d_001')).map((r) => r.tokenHash);
    expect(tokens).not.toContain(hashToken(first.cookie.value));
    expect(tokens).toContain(hashToken(cookieOf(second).value));
  });
});

describe('GET /api/auth/me', () => {
  it('answers with the session its cookie names, and keeps tokens out of the table', async () => {
    const s = server();
    const { cookie, body } = await signedIn(s, CITY, AYESHA);

    const res = await s.me(CITY, cookie.pair);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(body);

    const tokens = (await sessionRows('d_001')).map((r) => r.tokenHash);
    expect(tokens).toContain(hashToken(cookie.value));
    expect(tokens).not.toContain(cookie.value);
  });

  it('answers null without a cookie, and clears a cookie it does not know', async () => {
    const s = server();
    const none = await s.me(CITY);
    expect(none.status).toBe(200);
    expect(await none.json()).toBeNull();
    expect(none.headers.getSetCookie()).toEqual([]);

    const forged = await s.me(CITY, 'swiftrx_portal=made-up-token');
    expect(await forged.json()).toBeNull();
    expect(cookieOf(forged)).toMatchObject({ name: 'swiftrx_portal', value: '' });
    expect(cookieOf(forged).attributes).toContain('Max-Age=0');
  });

  it('ends a session 12 hours after sign-in', async () => {
    const s = server();
    const { cookie } = await signedIn(s, NORTHSTAR, SANA);

    s.advance(SESSION_TTL_MS - 1000);
    expect(await s.whoIs(NORTHSTAR, cookie.pair)).toBe('d_003');

    s.advance(1000);
    const res = await s.me(NORTHSTAR, cookie.pair);
    expect(await res.json()).toBeNull();
    expect(cookieOf(res).attributes).toContain('Max-Age=0');
    const tokens = (await sessionRows('d_003')).map((r) => r.tokenHash);
    expect(tokens).not.toContain(hashToken(cookie.value));
  });

  it('counts a session only at the hospital it was made at', async () => {
    const s = server();
    const { cookie } = await signedIn(s, CITY, AYESHA);

    // Planted on Northstar's host (the browser itself never sends it there).
    const elsewhere = await s.me(NORTHSTAR, cookie.pair);
    expect(await elsewhere.json()).toBeNull();
    expect(elsewhere.headers.getSetCookie()).toEqual([]);

    // On a host both portals share (dev's localhost), the browser does send it.
    const local = 'http://localhost:5174';
    expect(await s.whoIs(local, cookie.pair, {}, '?hospital=northstar-medical')).toBeNull();
    expect(await s.whoIs(local, cookie.pair, {}, '?hospital=city-hospital')).toBe('d_001');

    // At the admin host, under the admin cookie's name.
    expect(await s.whoIs(ADMIN, `swiftrx_admin=${cookie.value}`)).toBeNull();

    // None of that ended it at City Hospital.
    expect(await s.whoIs(CITY, cookie.pair)).toBe('d_001');
  });

  it("doesn't let an admin-panel session into a hospital portal", async () => {
    const s = server();
    const { cookie } = await signedIn(s, ADMIN, PLATFORM_ADMIN);
    expect(await s.whoIs(ADMIN, cookie.pair)).toBe('u_admin_001');
    expect(await s.whoIs(CITY, `swiftrx_portal=${cookie.value}`)).toBeNull();
  });

  it('ends a session when its user is disabled', async () => {
    const s = server();
    const { cookie } = await signedIn(s, CITY, BILAL);
    await database.db.update(users).set({ status: 'disabled' }).where(eq(users.id, 'd_002'));
    try {
      expect(await s.whoIs(CITY, cookie.pair)).toBeNull();
    } finally {
      await database.db.update(users).set({ status: 'active' }).where(eq(users.id, 'd_002'));
    }
    // Ended, not paused.
    expect(await s.whoIs(CITY, cookie.pair)).toBeNull();
  });

  it('ends a session when its hospital is suspended', async () => {
    const s = server();
    const { cookie } = await signedIn(s, NORTHSTAR, SANA);
    const id = await hospitalId('northstar-medical');
    await database.db.update(hospitals).set({ status: 'suspended' }).where(eq(hospitals.id, id));
    try {
      expect(await s.whoIs(NORTHSTAR, cookie.pair)).toBeNull();
    } finally {
      await database.db.update(hospitals).set({ status: 'active' }).where(eq(hospitals.id, id));
    }
    expect((await sessionRows('d_003')).map((r) => r.tokenHash)).not.toContain(
      hashToken(cookie.value),
    );
  });

  it('ends a session when its user loses their role there', async () => {
    const s = server();
    const { cookie } = await signedIn(s, NORTHSTAR, SANA);
    const id = await hospitalId('northstar-medical');
    const where = and(eq(memberships.userId, 'd_003'), eq(memberships.hospitalId, id));
    await database.db.delete(memberships).where(where);
    try {
      expect(await s.whoIs(NORTHSTAR, cookie.pair)).toBeNull();
    } finally {
      await database.db
        .insert(memberships)
        .values({ hospitalId: id, userId: 'd_003', role: 'doctor' });
    }
    expect(await s.whoIs(NORTHSTAR, cookie.pair)).toBeNull();
  });

  it("lists every role a user holds at the hospital, the admin's first", async () => {
    const id = await hospitalId('city-hospital');
    await database.db
      .insert(memberships)
      .values({ hospitalId: id, userId: 'u_hadmin_city', role: 'doctor' });
    try {
      const s = server();
      const { cookie } = await signedIn(s, CITY, CITY_ADMIN);
      const body = (await (await s.me(CITY, cookie.pair)).json()) as AuthSession;
      expect(body.session.role).toBe('hospital_admin');
      expect(body.user.role).toBe('hospital_admin');
      expect(body.memberships).toEqual([
        { hospitalSlug: 'city-hospital', role: 'hospital_admin' },
        { hospitalSlug: 'city-hospital', role: 'doctor' },
      ]);
    } finally {
      await database.db
        .delete(memberships)
        .where(
          and(
            eq(memberships.userId, 'u_hadmin_city'),
            eq(memberships.hospitalId, id),
            eq(memberships.role, 'doctor'),
          ),
        );
    }
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const s = server();
    const { cookie } = await signedIn(s, CITY, AYESHA);

    const res = await s.logout(CITY, cookie.pair);
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatchObject({ name: 'swiftrx_portal', value: '' });
    expect(cookieOf(res).attributes).toContain('Max-Age=0');

    const tokens = (await sessionRows('d_001')).map((r) => r.tokenHash);
    expect(tokens).not.toContain(hashToken(cookie.value));
    expect(await s.whoIs(CITY, cookie.pair)).toBeNull();
  });

  it('answers 204 with no session too', async () => {
    expect((await server().logout(CITY)).status).toBe(204);
  });

  it('refuses a sign-out posted from another origin', async () => {
    const s = server();
    const { cookie } = await signedIn(s, CITY, AYESHA);
    const res = await s.app.request(`${CITY}/api/auth/logout`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', cookie: cookie.pair },
    });
    expect(res.status).toBe(403);
    expect(await s.whoIs(CITY, cookie.pair)).toBe('d_001');
  });
});

describe('sign-in rate limits', () => {
  const limits = {
    perAddress: { max: 5, windowMs: 60_000 },
    perAccount: { max: 3, windowMs: 60_000 },
  };

  it('locks an account after repeated failures, from any address, until the window ends', async () => {
    const s = server({ signInLimits: limits });
    for (let i = 0; i < 3; i++) {
      const ip = { 'x-test-ip': `198.51.100.${i}` };
      expect((await s.login(CITY, { ...AYESHA, password: 'guess' }, ip)).status).toBe(401);
    }

    // Even the right password is refused now, without being checked.
    const locked = await s.login(CITY, AYESHA, { 'x-test-ip': '198.51.100.9' });
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBe('60');
    expect(await locked.json()).toMatchObject({ reason: 'rate-limited' });

    // Another account isn't affected.
    expect((await s.login(CITY, BILAL, { 'x-test-ip': '198.51.100.9' })).status).toBe(200);

    s.advance(60_000);
    expect((await s.login(CITY, AYESHA)).status).toBe(200);
  });

  it('limits failures from one address across accounts', async () => {
    const s = server({ signInLimits: limits });
    const ip = { 'x-test-ip': '192.0.2.50' };
    for (let i = 0; i < 5; i++) {
      const res = await s.login(CITY, { email: `guess${i}@city-hospital.com`, password: 'x' }, ip);
      expect(res.status).toBe(401);
    }
    expect((await s.login(CITY, AYESHA, ip)).status).toBe(429);
    expect((await s.login(CITY, AYESHA, { 'x-test-ip': '192.0.2.51' })).status).toBe(200);
  });

  it("doesn't count successful sign-ins, and a success clears the account's failures", async () => {
    const s = server({ signInLimits: limits });
    for (let i = 0; i < 10; i++) expect((await s.login(CITY, AYESHA)).status).toBe(200);

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 2; i++) {
        const ip = { 'x-test-ip': `203.0.113.${100 + round * 2 + i}` };
        expect((await s.login(CITY, { ...AYESHA, password: 'typo' }, ip)).status).toBe(401);
      }
      expect((await s.login(CITY, AYESHA, { 'x-test-ip': '203.0.113.200' })).status).toBe(200);
    }
  });
});

describe('GET /api/auth/demo-accounts', () => {
  const list = async (origin: string, deps: Partial<AppDeps> = {}) => {
    const res = await server(deps).app.request(`${origin}/api/auth/demo-accounts`);
    return { status: res.status, body: (await res.json()) as { accounts?: unknown[] } };
  };

  it("lists this hospital's demo accounts, doctors first", async () => {
    expect((await list(CITY)).body.accounts).toEqual([
      {
        email: 'ayesha@city-hospital.com',
        password: 'demo1234',
        name: 'Dr. Ayesha Khan',
        role: 'doctor',
      },
      {
        email: 'bilal@city-hospital.com',
        password: 'demo1234',
        name: 'Dr. Bilal Ahmed',
        role: 'doctor',
      },
      {
        email: 'admin@city-hospital.com',
        password: 'demo1234',
        name: 'Faisal Rehman',
        role: 'hospital_admin',
      },
    ]);
  });

  it('lists the platform admin at the admin host, and nothing where there is no sign-in', async () => {
    expect((await list(ADMIN)).body.accounts).toEqual([
      {
        email: 'admin@swiftrx.com',
        password: 'admin1234',
        name: 'Sarah Mitchell',
        role: 'platform_admin',
      },
    ]);
    expect((await list('http://swiftrx.onrender.com')).body.accounts).toEqual([]);
  });

  it('lists nothing when demo mode is off', async () => {
    expect(await list(CITY, { demoMode: false })).toEqual({ status: 200, body: { accounts: [] } });
  });
});
