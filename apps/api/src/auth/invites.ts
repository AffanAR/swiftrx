// =============================================================================
//  SwiftRx API — Invitations and password links
// =============================================================================
//    POST /api/auth/invites       a hospital admin invites a doctor → a link
//    POST /api/auth/hospital-admin-invites
//                                 the platform admin invites a hospital's
//                                 admin (its first, or another) → a link;
//                                 again for the same invited admin, a new link
//    POST /api/auth/reset-links   a hospital admin makes a new link for one of
//                                 its users (a reset, or a fresh invitation)
//    POST /api/auth/token-info    what a link is for (the set-password page)
//    POST /api/auth/set-password  { token, password }: sets it, once
//
//  There is no email sender yet, so the admin gets the link and passes it on.
//  For the same reason there is no "forgot password" that people start
//  themselves: a reset link may only reach the account's owner, which takes
//  email. The token rides after `#` in the link, which browsers send neither
//  to a server nor in a Referer, and the table keeps only its SHA-256, as for
//  sessions. An invitation lasts 7 days and a reset link 24 hours, and either
//  works once. Setting a password ends the user's other sessions.
// =============================================================================

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { MIN_PASSWORD_LENGTH } from '@swiftrx/shared/auth';
import type { AuthSession, User } from '@swiftrx/shared/types';

import { auditEvents, hospitals, memberships, sessions, userTokens, users } from '../db/schema';
import { hashPassword } from './passwords';
import { currentSession, hashToken, type AuthDeps } from './routes';
import { surfaceOf } from './surface';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIFETIME = { invite: 7 * DAY_MS, reset: DAY_MS } as const;

const inviteBody = z.object({
  email: z.email().trim().toLowerCase().max(254),
  name: z.string().trim().min(1).max(120),
  licenseNo: z.string().trim().min(1).max(40),
  specialty: z.string().trim().max(80).optional(),
});
const adminInviteBody = z.object({
  hospitalSlug: z.string().min(1).max(64),
  email: z.email().trim().toLowerCase().max(254),
  name: z.string().trim().min(1).max(120),
});
const resetBody = z.object({ userId: z.string().min(1).max(64) });
const tokenBody = z.object({ token: z.string().min(1).max(100) });
const setPasswordBody = tokenBody.extend({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

export function inviteRoutes(deps: Deps) {
  const { db } = deps;
  const routes = new Hono();

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.post('/invites', async (c) => {
    const admin = await hospitalAdmin(c, deps);
    if (!admin.ok) return admin.response;
    const body = inviteBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: 'Send a name, an email and a license number.' }, 400);
    const { email, name, licenseNo, specialty } = body.data;

    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email));
    if (taken) return c.json({ error: 'An account with this email already exists.' }, 409);

    const now = deps.now();
    const id = `u_${randomBytes(6).toString('hex')}`;
    const token = newToken();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        email,
        name,
        licenseNo,
        specialty: specialty || null,
        status: 'invited',
        passwordHash: null,
        createdAt: now,
      });
      await tx
        .insert(memberships)
        .values({ hospitalId: admin.hospitalId, userId: id, role: 'doctor', createdAt: now });
      await tx.insert(userTokens).values(tokenRow(token, id, admin, 'invite', now));
      await tx.insert(auditEvents).values({
        kind: 'invite_user',
        actorId: admin.auth.user.id,
        actorEmail: admin.auth.user.email,
        hospitalId: admin.hospitalId,
        at: now,
        details: { invitedEmail: email },
      });
    });

    const user: User = {
      id,
      email,
      name,
      role: 'doctor',
      hospitalSlug: admin.slug,
      licenseNo,
      ...(specialty ? { specialty } : {}),
      status: 'invited',
      createdAt: now.toISOString(),
    };
    return c.json({ user, token, purpose: 'invite' }, 201);
  });

  routes.post('/hospital-admin-invites', async (c) => {
    const auth = await currentSession(c, deps);
    if (!auth) return c.json({ error: 'Sign in first.' }, 401);
    if (auth.session.role !== 'platform_admin') {
      return c.json({ error: 'Only the SwiftRx team can do that.' }, 403);
    }
    const body = adminInviteBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: 'Send a hospital, a name and an email.' }, 400);
    const { hospitalSlug, email, name } = body.data;

    const [hospital] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, hospitalSlug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);
    const inviter = { hospitalId: hospital.id, auth };

    const [existing] = await db
      .select({ id: users.id, name: users.name, status: users.status, createdAt: users.createdAt })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email));
    const now = deps.now();
    const token = newToken();

    if (existing) {
      // Someone invited as this hospital's admin who lost the link (or let it
      // expire) gets a new one. Any other account with the email is a clash.
      const [admin] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, existing.id),
            eq(memberships.hospitalId, hospital.id),
            eq(memberships.role, 'hospital_admin'),
          ),
        );
      if (!admin || existing.status !== 'invited') {
        return c.json({ error: 'An account with this email already exists.' }, 409);
      }
      await db.insert(userTokens).values(tokenRow(token, existing.id, inviter, 'invite', now));
      const user: User = {
        id: existing.id,
        email,
        name: existing.name,
        role: 'hospital_admin',
        hospitalSlug,
        status: 'invited',
        createdAt: existing.createdAt.toISOString(),
      };
      return c.json({ user, token, purpose: 'invite' }, 201);
    }

    const id = `u_${randomBytes(6).toString('hex')}`;
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        email,
        name,
        status: 'invited',
        passwordHash: null,
        createdAt: now,
      });
      await tx
        .insert(memberships)
        .values({ hospitalId: hospital.id, userId: id, role: 'hospital_admin', createdAt: now });
      await tx.insert(userTokens).values(tokenRow(token, id, inviter, 'invite', now));
      await tx.insert(auditEvents).values({
        kind: 'invite_user',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: hospital.id,
        at: now,
        details: { invitedEmail: email },
      });
    });

    const user: User = {
      id,
      email,
      name,
      role: 'hospital_admin',
      hospitalSlug,
      status: 'invited',
      createdAt: now.toISOString(),
    };
    return c.json({ user, token, purpose: 'invite' }, 201);
  });

  routes.post('/reset-links', async (c) => {
    const admin = await hospitalAdmin(c, deps);
    if (!admin.ok) return admin.response;
    const body = resetBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: 'Name the user.' }, 400);

    const [target] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(eq(users.id, body.data.userId), eq(memberships.hospitalId, admin.hospitalId)))
      .limit(1);
    if (!target) return c.json({ error: 'No such user at this hospital.' }, 404);
    if (target.status === 'disabled') return c.json({ error: 'This account is disabled.' }, 409);

    // Someone who never accepted their invitation gets a new one.
    const purpose = target.status === 'invited' ? 'invite' : 'reset';
    const token = newToken();
    await db.insert(userTokens).values(tokenRow(token, target.id, admin, purpose, deps.now()));
    return c.json({ token, purpose }, 201);
  });

  routes.post('/token-info', async (c) => {
    const body = tokenBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json(null);
    const found = await usableToken(c, deps, body.data.token);
    return c.json(found ? { purpose: found.purpose, email: found.email, name: found.name } : null);
  });

  routes.post('/set-password', async (c) => {
    const body = setPasswordBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) {
      return c.json(
        { error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` },
        400,
      );
    }
    const found = await usableToken(c, deps, body.data.token);
    if (!found) return c.json({ error: 'This link has expired or was already used.' }, 410);

    const passwordHash = await hashPassword(body.data.password);
    const now = deps.now();
    const used = await db.transaction(async (tx) => {
      // Claims the token; a second request with it finds nothing to claim.
      const claimed = await tx
        .update(userTokens)
        .set({ usedAt: now })
        .where(and(eq(userTokens.tokenHash, hashToken(body.data.token)), isNull(userTokens.usedAt)))
        .returning({ userId: userTokens.userId });
      if (claimed.length === 0) return false;
      await tx
        .update(users)
        .set({ passwordHash, status: 'active' })
        .where(eq(users.id, found.userId));
      // The user's other links and sessions end with the old password.
      await tx
        .update(userTokens)
        .set({ usedAt: now })
        .where(and(eq(userTokens.userId, found.userId), isNull(userTokens.usedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, found.userId));
      return true;
    });
    if (!used) return c.json({ error: 'This link has expired or was already used.' }, 410);
    return c.body(null, 204);
  });

  return routes;
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokenRow(
  token: string,
  userId: string,
  admin: { hospitalId: string; auth: AuthSession },
  purpose: keyof typeof LIFETIME,
  now: Date,
) {
  return {
    tokenHash: hashToken(token),
    userId,
    hospitalId: admin.hospitalId,
    purpose,
    createdBy: admin.auth.user.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + LIFETIME[purpose]),
  };
}

/** The signed-in admin of the hospital this host serves, or the response refusing. */
async function hospitalAdmin(c: Context, deps: Deps) {
  const auth = await currentSession(c, deps);
  const slug =
    auth?.session.role === 'platform_admin' ? null : (auth?.session.hospitalSlug ?? null);
  if (!auth || !slug) {
    return { ok: false as const, response: c.json({ error: 'Sign in first.' }, 401) };
  }
  if (!auth.memberships.some((m) => m.role === 'hospital_admin')) {
    return {
      ok: false as const,
      response: c.json({ error: "Only the hospital's admins can do that." }, 403),
    };
  }
  const [hospital] = await deps.db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.slug, slug));
  return { ok: true as const, auth, slug, hospitalId: hospital.id };
}

/** An unused, unexpired token for this host's hospital, with whom it is for. */
async function usableToken(c: Context, deps: Deps, token: string) {
  const surface = surfaceOf(c.req.url, deps.rootDomain);
  if (surface.kind !== 'hospital') return null;
  const [found] = await deps.db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      purpose: userTokens.purpose,
    })
    .from(userTokens)
    .innerJoin(users, eq(users.id, userTokens.userId))
    .innerJoin(hospitals, eq(hospitals.id, userTokens.hospitalId))
    .where(
      and(
        eq(userTokens.tokenHash, hashToken(token)),
        isNull(userTokens.usedAt),
        gt(userTokens.expiresAt, deps.now()),
        eq(hospitals.slug, surface.slug),
      ),
    );
  return found && found.status !== 'disabled' ? found : null;
}
