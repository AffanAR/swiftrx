// =============================================================================
//  SwiftRx API — Database commands
// =============================================================================
//    tsx src/db/cli.ts setup     migrate, then seed if the database is empty
//    tsx src/db/cli.ts migrate   apply pending migrations
//    tsx src/db/cli.ts seed      load the demo data into an empty database
//    tsx src/db/cli.ts reset     drop everything, migrate and seed (local only)
//    tsx src/db/cli.ts snapshot  write the demo database to dist/demo-db.tgz
//
//  The database is DATABASE_URL (from the shell or apps/api/.env), else PGlite
//  in apps/api/.pglite. `--url <postgres-url>` overrides both; `npm run db:up`
//  uses it to point at the Docker database.
//
//  `snapshot` (part of `npm run build`) always works on a fresh PGlite in
//  memory: it migrates and seeds one and saves its files, so the production
//  server can start from them instead of building a database at every boot.
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { loadLocalEnv } from '../env';
import {
  DEMO_SNAPSHOT,
  databaseConfigFromEnv,
  dropEverything,
  openDatabase,
  type DatabaseConfig,
} from './client';
import { seed, upgradeDemoPasswords } from './seed';

const COMMANDS = ['setup', 'migrate', 'seed', 'reset', 'snapshot'] as const;
type Command = (typeof COMMANDS)[number];

async function main(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (!COMMANDS.includes(command as Command)) {
    throw new Error(`Usage: cli.ts <${COMMANDS.join('|')}> [--url <postgres-url>]`);
  }
  if (command === 'snapshot') return writeDemoSnapshot();

  loadLocalEnv();
  const urlFlag = rest.indexOf('--url');
  const config: DatabaseConfig =
    urlFlag >= 0 && rest[urlFlag + 1]
      ? { url: rest[urlFlag + 1] }
      : databaseConfigFromEnv(process.env);

  const database = await openDatabase(config);
  console.log(`Database: ${database.describe}`);
  try {
    if (command === 'reset') {
      await dropEverything(database, config);
      console.log('Dropped every table.');
    }
    if (command !== 'seed') {
      await database.migrate();
      console.log('Migrations applied.');
    }
    if (command !== 'migrate') {
      const result = await seed(database.db);
      console.log(
        result.seeded
          ? `Seeded: ${Object.entries(result.counts)
              .map(([table, n]) => `${table} ${n}`)
              .join(', ')}.`
          : 'Already has data, so the seed was skipped. `npm run db:reset` starts over.',
      );
      if (!result.seeded) {
        const upgraded = await upgradeDemoPasswords(database.db);
        if (upgraded > 0) {
          console.log(`Gave ${upgraded} demo account(s) an Argon2id hash in place of bcrypt.`);
        }
      }
    }
  } finally {
    await database.close();
  }
}

async function writeDemoSnapshot(): Promise<void> {
  const database = await openDatabase({});
  try {
    await database.migrate();
    await seed(database.db);
    const bytes = await database.dump!();
    await mkdir(dirname(DEMO_SNAPSHOT), { recursive: true });
    await writeFile(DEMO_SNAPSHOT, bytes);
    console.log(
      `Wrote the demo database (${(bytes.length / 1e6).toFixed(1)} MB) to ${DEMO_SNAPSHOT}`,
    );
  } finally {
    await database.close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  // Drizzle wraps a failed statement; the Postgres reason is in `cause`.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  console.error(error instanceof Error ? error.message : error, cause ? `\n${cause}` : '');
  process.exitCode = 1;
});
