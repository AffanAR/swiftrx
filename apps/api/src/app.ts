// =============================================================================
//  SwiftRx API — HTTP routes
// =============================================================================
//  The API lives under /api on the same origin as the apps (PLAN.md §2.7), so
//  session cookies stay same-site and no CORS is needed. createApp() takes its
//  database rather than opening one, so tests hand it an in-memory PGlite and
//  call `app.request()` without a network socket.
//
//  The routes to come take the paths that apps/shared/src/api.ts notes beside
//  each data-client method, under /api: GET /api/hospitals/:slug,
//  GET /api/hospitals/:slug/patients, GET /api/catalog, and so on.
// =============================================================================

import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Db } from './db/client';

export interface AppDeps {
  db: Db;
  /** Where server-side errors go; tests pass a stub to keep their output clean. */
  logError?: (message: string, error: unknown) => void;
}

export function createApp({ db, logError = console.error }: AppDeps) {
  const app = new Hono().basePath('/api');

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

  app.notFound((c) => c.json({ error: 'Not found.' }, 404));

  // An unexpected failure: log it, and keep the details out of the response.
  app.onError((error, c) => {
    logError(`${c.req.method} ${c.req.path} failed.`, error);
    return c.json({ error: 'Something went wrong.' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
