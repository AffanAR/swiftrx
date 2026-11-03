// =============================================================================
//  SwiftRx API — Crashes reported by the apps
// =============================================================================
//    POST /api/client-errors   a browser's uncaught error (reportClientError
//                              in @swiftrx/shared), logged and sent to the
//                              error sink like the server's own
//
//  Anyone may report, since a crash can happen before sign-in, so it is held
//  to a small body (a message, a stack and the page's path) and 20 reports
//  per address per 10 minutes. Everything goes through the same scrubber as
//  the server's errors (log.ts); the path loses its query, and the session's
//  role and hospital are added when there is one. Always 204, so a page
//  can't learn anything from the answer.
// =============================================================================

import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { currentSession, type AuthDeps } from './auth/routes';
import { RateLimiter } from './auth/rateLimit';
import { scrubText } from './log';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'> & {
  clientIp: (c: Context) => string | undefined;
  report: (event: string, error: unknown, context: Record<string, string>) => void;
};

const clientErrorSchema = z.object({
  /** "portal" or "admin". */
  app: z.enum(['portal', 'admin']),
  name: z.string().max(100),
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(300),
});

export function clientErrorRoutes(deps: Deps) {
  const routes = new Hono();
  const limiter = new RateLimiter({ max: 20, windowMs: 10 * 60_000 }, () => deps.now().getTime());

  routes.post('/client-errors', async (c) => {
    const ip = deps.clientIp(c) ?? 'unknown';
    if (limiter.retryAfter(ip) > 0) return c.body(null, 204);
    limiter.hit(ip);

    const parsed = clientErrorSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.body(null, 204);
    const { app, name, message, stack, path } = parsed.data;

    // Rebuilt as an Error so it is scrubbed exactly like the server's.
    const error = new Error(message);
    error.name = /^[A-Za-z]{1,60}$/.test(name) ? name : 'Error';
    error.stack = `${error.name}: ${message}\n${stack ?? ''}`;

    const auth = await currentSession(c, deps).catch(() => null);
    deps.report('client_error', error, {
      app,
      path: scrubText(path.split(/[?#]/)[0], 200),
      ...(auth ? { role: auth.session.role } : {}),
      ...(auth && auth.session.role !== 'platform_admin'
        ? { hospital: auth.session.hospitalSlug }
        : {}),
    });
    return c.body(null, 204);
  });

  return routes;
}
