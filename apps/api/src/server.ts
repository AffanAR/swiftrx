// =============================================================================
//  SwiftRx API — Server
// =============================================================================
//  `npm run dev:api` (from the repo root) runs this with reload on save.
//  Listens on 127.0.0.1:5176 by default, like the Vite dev servers, so the API
//  isn't reachable from the LAN. API_PORT / API_HOST change that.
//
//  Run `npm run db:setup` first: the server doesn't migrate or seed.
// =============================================================================

import { serve } from '@hono/node-server';
import { count } from 'drizzle-orm';

import { createApp } from './app';
import { databaseConfigFromEnv, openDatabase } from './db/client';
import { hospitals } from './db/schema';
import { loadLocalEnv } from './env';

loadLocalEnv();

const port = Number(process.env.API_PORT) || 5176;
const hostname = process.env.API_HOST || '127.0.0.1';

const database = await openDatabase(databaseConfigFromEnv(process.env));
try {
  await database.db.select({ n: count() }).from(hospitals);
} catch (error) {
  // Still start: /api/health reports whether the database itself answers.
  console.warn(
    `Can't read the hospitals table (${error instanceof Error ? error.message : error}).`,
    'On a new database, run `npm run db:setup` to create and seed it.',
  );
}

const server = serve({ fetch: createApp({ db: database.db }).fetch, port, hostname }, (info) => {
  console.log(`SwiftRx API on http://${hostname}:${info.port}/api (${database.describe})`);
});

async function shutdown() {
  server.close();
  await database.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
