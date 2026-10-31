// =============================================================================
//  SwiftRx API — Reads
// =============================================================================
//    GET /api/hospitals/:slug/doctors        a hospital's doctors
//    GET /api/audit-events                   every hospital's audit log
//    GET /api/hospitals/:slug/audit-events   one hospital's
//
//  The first of the read endpoints that replace the mock db: these two moved
//  with sign-in, since invitations create doctors and sign-ins are audited on
//  the server. Each needs a session (401 without one) and answers only what
//  that session may see (403 otherwise): a platform admin, at the admin host,
//  sees every hospital; a hospital's own users see their hospital, and of
//  its audit log only its admins.
// =============================================================================

import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import type { AuditEvent, AuthSession, User } from '@swiftrx/shared/types';

import { currentSession, type AuthDeps } from './auth/routes';
import { auditEvents, hospitals, memberships, users } from './db/schema';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

export function readRoutes(deps: Deps) {
  const { db } = deps;
  const routes = new Hono();

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get('/hospitals/:slug/doctors', async (c) => {
    const slug = c.req.param('slug');
    const refused = await refuse(c, deps, (auth) => mayRead(auth, slug));
    if (refused) return refused;

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        specialty: users.specialty,
        licenseNo: users.licenseNo,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(hospitals, eq(hospitals.id, memberships.hospitalId))
      .where(and(eq(hospitals.slug, slug), eq(memberships.role, 'doctor')))
      .orderBy(users.createdAt);
    const doctors: User[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: 'doctor',
      hospitalSlug: slug,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      ...(u.specialty ? { specialty: u.specialty } : {}),
      ...(u.licenseNo ? { licenseNo: u.licenseNo } : {}),
      ...(u.lastLoginAt ? { lastLoginAt: u.lastLoginAt.toISOString() } : {}),
    }));
    return c.json(doctors);
  });

  routes.get('/audit-events', async (c) => {
    const refused = await refuse(c, deps, (auth) => auth.session.role === 'platform_admin');
    return refused ?? c.json(await auditLog(deps));
  });

  routes.get('/hospitals/:slug/audit-events', async (c) => {
    const slug = c.req.param('slug');
    const refused = await refuse(c, deps, (auth) =>
      auth.session.role === 'platform_admin'
        ? true
        : mayRead(auth, slug) && auth.memberships.some((m) => m.role === 'hospital_admin'),
    );
    return refused ?? c.json(await auditLog(deps, slug));
  });

  return routes;
}

/** Whether a session may read a hospital's data: a platform admin, or one of its users. */
function mayRead(auth: AuthSession, slug: string): boolean {
  return auth.session.role === 'platform_admin' || auth.session.hospitalSlug === slug;
}

/** 401 without a session, 403 when `allowed` says no; otherwise nothing. */
async function refuse(c: Context, deps: Deps, allowed: (auth: AuthSession) => boolean) {
  const auth = await currentSession(c, deps);
  if (!auth) return c.json({ error: 'Sign in first.' }, 401);
  if (!allowed(auth)) return c.json({ error: 'Not allowed.' }, 403);
  return null;
}

/** The audit log, newest first, in the shape the apps use. */
async function auditLog(deps: Deps, slug?: string): Promise<AuditEvent[]> {
  const rows = await deps.db
    .select({ event: auditEvents, hospitalSlug: hospitals.slug })
    .from(auditEvents)
    .leftJoin(hospitals, eq(hospitals.id, auditEvents.hospitalId))
    .where(slug ? eq(hospitals.slug, slug) : undefined)
    .orderBy(desc(auditEvents.at), desc(auditEvents.id));
  return rows.map(
    ({ event: e, hospitalSlug }) =>
      ({
        ...e.details,
        kind: e.kind,
        userId: e.actorId,
        userEmail: e.actorEmail,
        at: e.at.toISOString(),
        hospitalSlug,
        ...(e.ip ? { ip: e.ip } : {}),
      }) as AuditEvent,
  );
}
