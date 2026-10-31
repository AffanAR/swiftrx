// =============================================================================
//  SwiftRx API — Dev server
// =============================================================================
//  `npm run dev:api` (from the repo root) sets up the database, then runs this
//  with reload on save; `npm run dev:all` starts it alongside the apps. The
//  Vite dev servers and the gateway pass /api through to it, so the apps call
//  it on their own origin. Production runs the same app inside
//  scripts/serve.mjs instead (listener.ts).
//
//  Listens on 127.0.0.1:5176 by default, like the Vite dev servers, so the API
//  isn't reachable from the LAN. API_PORT / API_HOST change that.
// =============================================================================

import { serve } from '@hono/node-server';
import { count, not, like } from 'drizzle-orm';

import { createApp, demoModeFromEnv } from './app';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { hospitals, users } from './db/schema';
import { loadLocalEnv } from './env';

loadLocalEnv();

const port = Number(process.env.API_PORT) || 5176;
const hostname = process.env.API_HOST || '127.0.0.1';

const database = await openDatabase(databaseConfigFromEnv(process.env));
try {
  await database.db.select({ n: count() }).from(hospitals);
  // Databases seeded before the move to Argon2id still hold bcrypt hashes,
  // which the server no longer reads.
  const [{ n }] = await database.db
    .select({ n: count() })
    .from(users)
    .where(not(like(users.passwordHash, '$argon2id$%')));
  if (n > 0) {
    console.warn(
      `${n} account(s) have a password hash from before Argon2id and can't sign in.`,
      'On a dev database, `npm run db:reset` seeds it again.',
    );
  }
} catch (error) {
  // Still start: /api/health reports whether the database itself answers.
  console.warn(
    `Can't read the hospitals and users tables (${error instanceof Error ? error.message : error}).`,
    'On a new database, run `npm run db:setup` to create and seed it.',
  );
}

const app = createApp({
  db: database.db,
  secureCookies: process.env.NODE_ENV === 'production',
  demoMode: demoModeFromEnv(process.env),
});
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`SwiftRx API on http://${hostname}:${info.port}/api (${database.describe})`);
});

async function shutdown() {
  server.close();
  await database.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
