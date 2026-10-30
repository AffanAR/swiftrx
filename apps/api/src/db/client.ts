// =============================================================================
//  SwiftRx API — Database connection
// =============================================================================
//  One code path, two engines:
//   - Postgres, when DATABASE_URL is set (Docker locally via compose.yaml, a
//     managed Postgres when hosted).
//   - PGlite otherwise: real Postgres compiled to WebAssembly, running inside
//     this Node process with its files in apps/api/.pglite. Nothing to install,
//     so it works on machines without Docker. The tests use it in memory.
//  Both run the same migrations from apps/api/drizzle/, and everything above
//  this file sees the same Drizzle `Db`.
// =============================================================================

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import * as schema from './schema';

/** The Drizzle handle the routes and the seed use, whichever engine is underneath. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Postgres at a URL, or PGlite in a folder (in memory when `dataDir` is omitted). */
export type DatabaseConfig = { url: string } | { dataDir?: string };

export interface Database {
  db: Db;
  /** Where the data lives, for log lines. Never includes a password. */
  describe: string;
  /** Apply any migrations in apps/api/drizzle/ that haven't run yet. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Where PGlite keeps its files when DATABASE_URL isn't set. Gitignored. */
export const DEFAULT_PGLITE_DIR = fileURLToPath(new URL('../../.pglite', import.meta.url));

/** DATABASE_URL if set, else PGlite in PGLITE_DIR (default apps/api/.pglite). */
export function databaseConfigFromEnv(env: NodeJS.ProcessEnv): DatabaseConfig {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL };
  return { dataDir: env.PGLITE_DIR || DEFAULT_PGLITE_DIR };
}

export async function openDatabase(config: DatabaseConfig): Promise<Database> {
  if ('url' in config) {
    const pool = new pg.Pool({ connectionString: config.url });
    const db = drizzlePostgres({ client: pool, schema });
    return {
      db,
      describe: `Postgres at ${redact(config.url)}`,
      migrate: () => migratePostgres(db, { migrationsFolder: MIGRATIONS }),
      close: () => pool.end(),
    };
  }
  const client = await PGlite.create(config.dataDir);
  const db = drizzlePglite({ client, schema });
  return {
    db,
    describe: config.dataDir ? `PGlite in ${config.dataDir}` : 'PGlite in memory',
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS }),
    close: () => client.close(),
  };
}

/**
 * Drop every table, the migration history and the audit trigger, so the next
 * migrate starts from nothing. Dev only: it refuses any Postgres that isn't on
 * this machine.
 */
export async function dropEverything(database: Database, config: DatabaseConfig): Promise<void> {
  if ('url' in config && !isLocal(config.url)) {
    throw new Error(`Refusing to reset ${redact(config.url)}: only a local database can be reset.`);
  }
  await database.db.execute(sql`drop schema if exists drizzle cascade`);
  await database.db.execute(sql`drop schema if exists public cascade`);
  await database.db.execute(sql`create schema public`);
}

/** The URL with any password masked. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

function isLocal(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
