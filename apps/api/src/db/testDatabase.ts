// For tests only: a migrated, empty database.
//
// PGlite in memory, or, when TEST_DATABASE_URL is set (CI's Postgres job),
// that local Postgres wiped first. That run checks the same behaviour on the
// real server, which PGlite can't fully stand in for (one connection, its own
// build). Every test file that calls this wipes that one database, so the job
// runs them one file at a time (`--no-file-parallelism`).

import { dropEverything, openDatabase, type Database, type DatabaseConfig } from './client';

/** PGlite boots a WebAssembly Postgres per database, so setup gets a long timeout. */
export const SLOW = 60_000;

export async function freshDatabase(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  const config: DatabaseConfig = url ? { url } : {};
  const database = await openDatabase(config);
  if (url) await dropEverything(database, config);
  await database.migrate();
  return database;
}
