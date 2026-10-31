// =============================================================================
//  SwiftRx API — Sign-in
// =============================================================================
//    POST /api/auth/login          { email, password } → the session, plus its cookie
//    POST /api/auth/logout         ends this browser's session
//    GET  /api/auth/me             the session, or null
//    GET  /api/auth/demo-accounts  this sign-in page's demo accounts (demo mode only)
//
//  The server keeps every session (the `sessions` table) and checks it on
//  each request: it must exist and be unexpired, belong to the surface this
//  host serves (the admin panel or one hospital, see surface.ts), and its user
//  must still be active and still hold a role there. A session lasts 12 hours
//  from sign-in, a clinic day, however busy it is.
//
//  /me answers 200 with null for "nobody is signed in here": that's the
//  answer to the question, not a failure, and a 401 there would put an error
//  in the browser's console on every visit. Routes that need a session (the
//  data endpoints to come) answer 401 without one.
//
//  The cookie carries a random token, and the table only its SHA-256. It is
//  httpOnly and SameSite=Lax, and host-only (no Domain attribute), so a
//  cookie made at city-hospital.<root> never reaches admin.<root> or another
//  hospital's subdomain. Over HTTPS it is also Secure, under the `__Host-`
//  prefix, which no other subdomain can set or shadow. The admin panel and
//  the portals use different cookie names, so on a host they share (plain
//  localhost in dev) signing in to one doesn't sign the other out.
// =============================================================================

import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';

import type {
  AuthSession,
  DemoAccount,
  Membership,
  SignInRefusal,
  User,
} from '@swiftrx/shared/types';

import type { Db } from '../db/client';
import {
  MEMBERSHIP_ROLES,
  auditEvents,
  hospitals,
  memberships,
  sessions,
  users,
} from '../db/schema';
import { hashPassword, needsRehash, verifyPassword } from './passwords';
import { RateLimiter, type SignInLimits } from './rateLimit';
import { surfaceOf } from './surface';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const COOKIE_NAMES = { admin: 'swiftrx_admin', hospital: 'swiftrx_portal' } as const;

export interface AuthDeps {
  db: Db;
  now: () => Date;
  rootDomain: string;
  /** The visitor's network address, for the rate limit and the audit log. */
  clientIp: (c: Context) => string | undefined;
  /** Mark cookies Secure even when the request didn't come over HTTPS. */
  secureCookies: boolean;
  /** Whether GET /demo-accounts lists anything. */
  demoMode: boolean;
  demoPasswords: Readonly<Record<string, string>>;
  signInLimits: SignInLimits;
}

const MESSAGES: Record<SignInRefusal, string> = {
  'invalid-credentials': 'Incorrect email or password.',
  'rate-limited': 'Too many failed sign-ins. Try again later.',
  'no-hospital': 'There is no SwiftRx sign-in at this address.',
  disabled: 'This account is disabled.',
  invited: "This account hasn't been activated yet.",
  'wrong-role': 'This account is not a platform admin.',
  'wrong-hospital': "This account isn't registered with this hospital.",
  'hospital-suspended': 'This hospital is suspended.',
};

const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  // Long enough for any passphrase, short enough that hashing it stays cheap.
  password: z.string().min(1).max(1024),
});

type Role = (typeof MEMBERSHIP_ROLES)[number];

/** The columns a session reply needs; never the password hash. */
const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  isPlatformAdmin: users.isPlatformAdmin,
  specialty: users.specialty,
  licenseNo: users.licenseNo,
  status: users.status,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

type UserRow = Pick<typeof users.$inferSelect, keyof typeof userColumns>;

interface HospitalRef {
  id: string;
  slug: string;
}

export function authRoutes(deps: AuthDeps) {
  const { db } = deps;
  const clock = () => deps.now().getTime();
  const perAddress = new RateLimiter(deps.signInLimits.perAddress, clock);
  const perAccount = new RateLimiter(deps.signInLimits.perAccount, clock);
  const routes = new Hono();

  // Nothing here may be cached: it is who is signed in.
  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.post('/login', async (c) => {
    const surface = surfaceOf(c.req.url, deps.rootDomain);
    if (surface.kind === 'unknown') return refuse(c, 404, 'no-hospital');
    const body = loginBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: 'Send an email and a password.' }, 400);
    const { email, password } = body.data;

    let hospital: (HospitalRef & { status: string }) | null = null;
    if (surface.kind === 'hospital') {
      const [row] = await db
        .select({ id: hospitals.id, slug: hospitals.slug, status: hospitals.status })
        .from(hospitals)
        .where(eq(hospitals.slug, surface.slug));
      if (!row) return refuse(c, 404, 'no-hospital');
      hospital = row;
    }

    // Refused before the password is checked, so a flood costs no hashing.
    const address = deps.clientIp(c) ?? 'unknown';
    const wait = Math.max(perAddress.retryAfter(address), perAccount.retryAfter(email));
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      return refuse(c, 429, 'rate-limited');
    }

    const [found] = await db
      .select({ user: userColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email));
    const stored = found?.passwordHash ?? null;
    // Runs Argon2 even for an unknown email, so timing doesn't reveal accounts.
    const verified = await verifyPassword(stored, password);
    if (!found || stored === null || !verified) {
      perAddress.hit(address);
      perAccount.hit(email);
      return refuse(c, 401, 'invalid-credentials');
    }
    perAccount.reset(email);
    const { user } = found;

    // The password was right; from here the reasons can be specific.
    if (user.status !== 'active') {
      return refuse(c, 403, user.status === 'invited' ? 'invited' : 'disabled');
    }
    let roles: Role[] = [];
    if (hospital) {
      if (hospital.status === 'suspended') return refuse(c, 403, 'hospital-suspended');
      roles = await rolesAt(db, user.id, hospital.id);
      if (roles.length === 0) return refuse(c, 403, 'wrong-hospital');
    } else if (!user.isPlatformAdmin) {
      return refuse(c, 403, 'wrong-role');
    }

    const upgraded = needsRehash(stored) ? await hashPassword(password) : null;
    const now = deps.now();
    const token = randomBytes(32).toString('base64url');
    const session = { createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
    const secure = cookiesSecure(c, deps);
    const replaced = readToken(c, surface.kind, secure);
    await db.transaction(async (tx) => {
      // Sweep expired sessions, and the one this browser's cookie is replacing.
      const expired = lte(sessions.expiresAt, now);
      await tx
        .delete(sessions)
        .where(replaced ? or(expired, eq(sessions.tokenHash, hashToken(replaced))) : expired);
      await tx.insert(sessions).values({
        tokenHash: hashToken(token),
        userId: user.id,
        hospitalId: hospital?.id ?? null,
        ...session,
      });
      await tx
        .update(users)
        .set({ lastLoginAt: now, ...(upgraded ? { passwordHash: upgraded } : {}) })
        .where(eq(users.id, user.id));
      await tx.insert(auditEvents).values({
        kind: 'login',
        actorId: user.id,
        actorEmail: user.email,
        hospitalId: hospital?.id ?? null,
        at: now,
        ip: isIP(address) ? address : null,
      });
    });

    setCookie(c, COOKIE_NAMES[surface.kind], token, {
      ...cookieOptions(secure),
      maxAge: SESSION_TTL_MS / 1000,
    });
    return c.json(authSession({ ...user, lastLoginAt: now }, hospital, roles, session));
  });

  routes.post('/logout', async (c) => {
    const surface = surfaceOf(c.req.url, deps.rootDomain);
    if (surface.kind !== 'unknown') {
      const secure = cookiesSecure(c, deps);
      const token = readToken(c, surface.kind, secure);
      if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      deleteCookie(c, COOKIE_NAMES[surface.kind], cookieOptions(secure));
    }
    return c.body(null, 204);
  });

  routes.get('/me', async (c) => {
    const nobody = () => c.json(null);
    const surface = surfaceOf(c.req.url, deps.rootDomain);
    if (surface.kind === 'unknown') return nobody();
    const secure = cookiesSecure(c, deps);
    const token = readToken(c, surface.kind, secure);
    if (!token) return nobody();

    // The session is no good anywhere (unknown, expired, or its user no
    // longer allowed in): remove it and the cookie.
    const ended = async () => {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      deleteCookie(c, COOKIE_NAMES[surface.kind], cookieOptions(secure));
      return nobody();
    };

    const [row] = await db
      .select({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        hospitalId: sessions.hospitalId,
        hospitalSlug: hospitals.slug,
        hospitalStatus: hospitals.status,
        user: userColumns,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(hospitals, eq(hospitals.id, sessions.hospitalId))
      .where(eq(sessions.tokenHash, hashToken(token)));
    if (!row || row.expiresAt <= deps.now()) return ended();

    // A session counts only where it was made. On a host several surfaces
    // share (dev's plain localhost), this browser may still use it there, so
    // it's left alone.
    const madeHere =
      surface.kind === 'admin'
        ? row.hospitalId === null
        : row.hospitalId !== null && row.hospitalSlug === surface.slug;
    if (!madeHere) return nobody();

    if (row.user.status !== 'active') return ended();
    if (row.hospitalId === null || row.hospitalSlug === null) {
      if (!row.user.isPlatformAdmin) return ended();
      return c.json(authSession(row.user, null, [], row));
    }
    if (row.hospitalStatus === 'suspended') return ended();
    const roles = await rolesAt(db, row.user.id, row.hospitalId);
    if (roles.length === 0) return ended();
    return c.json(
      authSession(row.user, { id: row.hospitalId, slug: row.hospitalSlug }, roles, row),
    );
  });

  routes.get('/demo-accounts', async (c) => {
    const surface = surfaceOf(c.req.url, deps.rootDomain);
    const ids = Object.keys(deps.demoPasswords);
    if (!deps.demoMode || surface.kind === 'unknown' || ids.length === 0) {
      return c.json({ accounts: [] });
    }

    const active = and(eq(users.status, 'active'), inArray(users.id, ids));
    const rows =
      surface.kind === 'admin'
        ? (
            await db
              .select({ id: users.id, email: users.email, name: users.name })
              .from(users)
              .where(and(active, eq(users.isPlatformAdmin, true)))
          ).map((u) => ({ ...u, role: 'platform_admin' as const }))
        : await db
            .select({ id: users.id, email: users.email, name: users.name, role: memberships.role })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .innerJoin(hospitals, eq(hospitals.id, memberships.hospitalId))
            .where(and(active, eq(hospitals.slug, surface.slug)));

    // One line per account (an admin who is also a doctor shows once, as the
    // admin), doctors first: they are who the demo is for.
    const byId = new Map<string, DemoAccount>();
    for (const r of rows) {
      const seen = byId.get(r.id);
      if (seen && seen.role !== 'doctor') continue;
      byId.set(r.id, {
        email: r.email,
        password: deps.demoPasswords[r.id],
        name: r.name,
        role: r.role,
      });
    }
    const order = { doctor: 0, hospital_admin: 1, platform_admin: 2 };
    const accounts = [...byId.values()].sort(
      (a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email),
    );
    return c.json({ accounts });
  });

  return routes;
}

// --- helpers -------------------------------------------------------------------

function refuse(c: Context, status: ContentfulStatusCode, reason: SignInRefusal) {
  return c.json({ error: MESSAGES[reason], reason }, status);
}

/** What the database keeps in place of a session token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/**
 * Whether this request's cookies are Secure: always in production, and
 * whenever the request reached us over HTTPS. Render and Cloudflare end TLS
 * and say so in X-Forwarded-Proto.
 */
function cookiesSecure(c: Context, deps: Pick<AuthDeps, 'secureCookies'>): boolean {
  if (deps.secureCookies) return true;
  const forwarded = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return forwarded === 'https' || new URL(c.req.url).protocol === 'https:';
}

function cookieOptions(secure: boolean) {
  return secure
    ? ({ httpOnly: true, sameSite: 'Lax', path: '/', secure: true, prefix: 'host' } as const)
    : ({ httpOnly: true, sameSite: 'Lax', path: '/' } as const);
}

function readToken(c: Context, kind: keyof typeof COOKIE_NAMES, secure: boolean) {
  return getCookie(c, COOKIE_NAMES[kind], secure ? 'host' : undefined) || undefined;
}

/** The user's roles at a hospital, admin first. */
async function rolesAt(db: Db, userId: string, hospitalId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.hospitalId, hospitalId)));
  return MEMBERSHIP_ROLES.filter((role) => rows.some((r) => r.role === role));
}

/** The reply to a sign-in or to /me. */
function authSession(
  user: UserRow,
  hospital: HospitalRef | null,
  roles: Role[],
  session: { createdAt: Date; expiresAt: Date },
): AuthSession {
  const base = {
    userId: user.id,
    issuedAt: session.createdAt.getTime(),
    expiresAt: session.expiresAt.getTime(),
    email: user.email,
    name: user.name,
  };
  const profile = {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    ...(user.specialty ? { specialty: user.specialty } : {}),
    ...(user.licenseNo ? { licenseNo: user.licenseNo } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
  };
  if (!hospital) {
    return {
      session: { role: 'platform_admin', ...base },
      user: { ...profile, role: 'platform_admin', hospitalSlug: null } satisfies User,
      memberships: [],
    };
  }
  const role: Role = roles.includes('hospital_admin') ? 'hospital_admin' : 'doctor';
  return {
    session: {
      role,
      ...base,
      hospitalSlug: hospital.slug,
      ...(user.licenseNo ? { licenseNo: user.licenseNo } : {}),
    },
    user: { ...profile, role, hospitalSlug: hospital.slug } satisfies User,
    memberships: roles.map((r): Membership => ({ hospitalSlug: hospital.slug, role: r })),
  };
}
