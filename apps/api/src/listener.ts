// =============================================================================
//  SwiftRx API — Inside the production server
// =============================================================================
//  scripts/serve.mjs (what Render runs) serves the two app builds and hands
//  everything under /api to this listener, so the API shares the apps' origin.
//
//  The database:
//   - DATABASE_URL, when it's set: migrated on start, never seeded.
//   - Otherwise PGlite in memory, with the demo data. That is the hosted
//     demo, which has no database of its own. It starts from the snapshot
//     `npm run build` wrote (dist/demo-db.tgz, migrated and seeded), which
//     skips building a Postgres cluster at boot: quicker, and less memory on
//     a 512 MB instance. Without one it migrates and seeds a new database.
//     Either way it starts over on every boot: what visitors change, and
//     every session, lasts until the instance restarts or sleeps, and then
//     everyone is signed out (ROADMAP.md §5).
//
//  The listener exists at once and its requests wait for the database, so the
//  server can answer for the apps while PGlite boots.
// =============================================================================

import { getRequestListener } from '@hono/node-server';
import type { Context } from 'hono';
import { readFile } from 'node:fs/promises';

import { createApp, demoModeFromEnv, socketAddress } from './app';
import { jsonLogger, sentryReporter } from './log';
import { DEMO_SNAPSHOT, openDatabase, type DatabaseConfig } from './db/client';
import { seed } from './db/seed';

export interface ApiListener {
  /** Takes Node's request and response for any URL under /api. */
  listener: ReturnType<typeof getRequestListener>;
  /** Says where the data lives once the database is ready; rejects if it can't be. */
  ready: Promise<string>;
  close(): Promise<void>;
}

export function createApiListener(
  env: NodeJS.ProcessEnv = process.env,
  snapshotFile = DEMO_SNAPSHOT,
): ApiListener {
  const starting = start(env, snapshotFile);
  // Whoever awaits `ready` reports a failure; meanwhile requests answer 503.
  starting.catch(() => {});

  const listener = getRequestListener(async (request, bindings) => {
    let app;
    try {
      ({ app } = await starting);
    } catch {
      return Response.json({ error: 'The API is unavailable.' }, { status: 503 });
    }
    return app.fetch(request, bindings);
  });

  return {
    listener,
    ready: starting.then((s) => s.describe),
    async close() {
      const started = await starting.catch(() => null);
      await started?.database.close();
    },
  };
}

async function start(env: NodeJS.ProcessEnv, snapshotFile: string) {
  let config: DatabaseConfig = {};
  if (env.DATABASE_URL) {
    config = { url: env.DATABASE_URL };
  } else {
    const snapshot = await readFile(snapshotFile).catch(() => undefined);
    if (snapshot) config = { snapshot };
  }
  const database = await openDatabase(config);
  let describe = database.describe;
  try {
    // Both are no-ops on an up-to-date snapshot.
    await database.migrate();
    if (!env.DATABASE_URL) {
      const { seeded } = await seed(database.db);
      describe += seeded ? ', seeded with the demo data' : ', from the demo snapshot';
    }
  } catch (error) {
    await database.close();
    throw error;
  }
  const app = createApp({
    db: database.db,
    clientIp: forwardedClientIp,
    secureCookies: env.NODE_ENV === 'production',
    demoMode: demoModeFromEnv(env),
    errorSink: errorSinkFromEnv(env),
  });
  return { app, database, describe };
}

/**
 * Sentry, when SENTRY_DSN is set (Render: the service's Environment tab).
 * SENTRY_ENVIRONMENT names the deployment ("demo" by default) and Render's
 * own RENDER_GIT_COMMIT the release, so an error points at its commit.
 */
export function errorSinkFromEnv(env: NodeJS.ProcessEnv) {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return undefined;
  const sink = sentryReporter(dsn, {
    environment: env.SENTRY_ENVIRONMENT || (demoModeFromEnv(env) ? 'demo' : 'production'),
    release: env.RENDER_GIT_COMMIT,
    log: jsonLogger,
  });
  if (!sink) jsonLogger({ level: 'warn', event: 'sentry_dsn_invalid' });
  return sink ?? undefined;
}

/**
 * The visitor's address behind Render's proxy. Render's edge is Cloudflare,
 * which sets CF-Connecting-IP and replaces any value a client sends. Without
 * it, the last X-Forwarded-For entry: Render appends the address it saw, but
 * keeps whatever the client put before it.
 */
export function forwardedClientIp(c: Context): string | undefined {
  const cloudflare = c.req.header('cf-connecting-ip')?.trim();
  if (cloudflare) return cloudflare;
  const forwarded = c.req
    .header('x-forwarded-for')
    ?.split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? socketAddress(c);
}
