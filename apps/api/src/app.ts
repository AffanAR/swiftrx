// =============================================================================
//  SwiftRx API — HTTP routes
// =============================================================================
//  The API lives under /api on the same origin as the apps (PLAN.md §2.7), so
//  session cookies stay same-site and no CORS is needed. createApp() takes its
//  database rather than opening one, so tests hand it an in-memory PGlite and
//  call `app.request()` without a network socket.
//
//  Sign-in is under /api/auth (auth/routes.ts, auth/invites.ts), and the first
//  reads, doctors and the audit log, are in reads.ts; the Rx pad's catalog is in
//  catalog.ts. The routes to come take the paths that apps/shared/src/api.ts
//  notes beside each data-client method, under /api: GET /api/hospitals/:slug,
//  GET /api/hospitals/:slug/patients, and so on.
// =============================================================================

import { getConnInfo } from '@hono/node-server/conninfo';
import { sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';

import { ROOT_DOMAIN } from '@swiftrx/shared/config';

import { inviteRoutes } from './auth/invites';
import { catalogRoutes } from './catalog';
import { authRoutes } from './auth/routes';
import { SIGN_IN_LIMITS, type SignInLimits } from './auth/rateLimit';
import type { Db } from './db/client';
import demoPasswords from './db/demo-passwords.json';
import { readRoutes } from './reads';

export interface AppDeps {
  db: Db;
  /** Where server-side errors go; tests pass a stub to keep their output clean. */
  logError?: (message: string, error: unknown) => void;
  /** The clock. Tests move it to expire sessions and rate-limit windows. */
  now?: () => Date;
  /** The domain hospitals are subdomains of. Default: VITE_ROOT_DOMAIN, as in the apps. */
  rootDomain?: string;
  /**
   * The visitor's network address, for the sign-in rate limit and the audit
   * log. Default: the socket's peer, which behind a proxy is the proxy.
   */
  clientIp?: (c: Context) => string | undefined;
  /** Mark session cookies Secure even on plain HTTP (production). */
  secureCookies?: boolean;
  /**
   * Show the demo accounts and their passwords on the sign-in pages
   * (GET /api/auth/demo-accounts). Default on; see demoModeFromEnv().
   */
  demoMode?: boolean;
  signInLimits?: SignInLimits;
}

export function createApp({
  db,
  logError = console.error,
  now = () => new Date(),
  rootDomain = ROOT_DOMAIN,
  clientIp = socketAddress,
  secureCookies = false,
  demoMode = true,
  signInLimits = SIGN_IN_LIMITS,
}: AppDeps) {
  const app = new Hono().basePath('/api');

  app.use(async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
  });

  // Another site can't make a signed-in browser change anything here: a write
  // must come from this origin and carry JSON, which a plain HTML form can't
  // send. SameSite=Lax already keeps the cookie off other sites' POSTs; this
  // also covers a page on another hospital's subdomain, which counts as the
  // same site.
  app.use(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    if (!sameOrigin(c)) return c.json({ error: 'Cross-origin request refused.' }, 403);
    const type = c.req.header('content-type');
    if (type !== undefined && !/^application\/json\s*(;|$)/i.test(type)) {
      return c.json({ error: 'Send JSON.' }, 415);
    }
    return next();
  });

  /**
   * Liveness for the host's health check: 200 when the database answers,
   * 503 when it doesn't. The body never says why; the log does.
   */
  app.get('/health', async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      logError('Health check: the database did not answer.', error);
      return c.json({ status: 'error', database: 'unreachable' }, 503);
    }
  });

  app.route(
    '/auth',
    authRoutes({
      db,
      now,
      rootDomain,
      clientIp,
      secureCookies,
      demoMode,
      demoPasswords,
      signInLimits,
    }),
  );

  app.route('/auth', inviteRoutes({ db, now, rootDomain, secureCookies }));
  app.route('/', readRoutes({ db, now, rootDomain, secureCookies }));
  app.route('/', catalogRoutes({ db, now, rootDomain, secureCookies }));

  app.notFound((c) => c.json({ error: 'Not found.' }, 404));

  // An unexpected failure: log it, and keep the details out of the response.
  app.onError((error, c) => {
    logError(`${c.req.method} ${c.req.path} failed.`, error);
    return c.json({ error: 'Something went wrong.' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

/** Demo mode is on unless VITE_DEMO_MODE=false, the switch that also turns off the apps' demo banner. */
export function demoModeFromEnv(env: NodeJS.ProcessEnv): boolean {
  return env.VITE_DEMO_MODE !== 'false';
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a write came from a page on this same origin. Browsers send Origin
 * with every cross-origin request and with same-origin POSTs; Sec-Fetch-Site
 * is the fallback. A request with neither isn't from a browser, so it has no
 * one's cookies to misuse.
 */
function sameOrigin(c: Context): boolean {
  const origin = c.req.header('origin');
  if (origin) {
    try {
      return new URL(origin).host === new URL(c.req.url).host;
    } catch {
      return false; // "null", from a sandboxed frame or a privacy redirect
    }
  }
  const site = c.req.header('sec-fetch-site');
  return site === undefined || site === 'same-origin' || site === 'none';
}

/** The socket's peer, when the app runs on @hono/node-server; tests have none. */
export function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
