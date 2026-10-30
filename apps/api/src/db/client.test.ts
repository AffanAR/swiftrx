import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PGLITE_DIR,
  databaseConfigFromEnv,
  dropEverything,
  openDatabase,
  redact,
} from './client';

describe('databaseConfigFromEnv', () => {
  it('uses DATABASE_URL when it is set', () => {
    expect(databaseConfigFromEnv({ DATABASE_URL: 'postgres://localhost/x' })).toEqual({
      url: 'postgres://localhost/x',
    });
  });

  it('falls back to PGlite in PGLITE_DIR, else apps/api/.pglite', () => {
    expect(databaseConfigFromEnv({ PGLITE_DIR: '/tmp/db' })).toEqual({ dataDir: '/tmp/db' });
    expect(databaseConfigFromEnv({})).toEqual({ dataDir: DEFAULT_PGLITE_DIR });
    expect(DEFAULT_PGLITE_DIR).toMatch(/[\\/]apps[\\/]api[\\/]\.pglite$/);
  });
});

describe('redact', () => {
  it('masks the password and nothing else', () => {
    expect(redact('postgres://swiftrx:s3cret@db.example.com:5432/swiftrx')).toBe(
      'postgres://swiftrx:***@db.example.com:5432/swiftrx',
    );
    expect(redact('postgres://localhost/swiftrx')).toBe('postgres://localhost/swiftrx');
    expect(redact('not a url')).toBe('(unparseable DATABASE_URL)');
  });
});

describe('openDatabase with a URL', () => {
  // pg connects lazily, so none of this needs a running server.
  const config = { url: 'postgres://swiftrx:s3cret@db.example.com:5432/swiftrx' };

  it('describes the database without its password', async () => {
    const database = await openDatabase(config);
    expect(database.describe).toBe(
      'Postgres at postgres://swiftrx:***@db.example.com:5432/swiftrx',
    );
    await database.close();
  });

  it('refuses to reset a database on another machine', async () => {
    const database = await openDatabase(config);
    await expect(dropEverything(database, config)).rejects.toThrow(/only a local database/);
    await database.close();
  });
});
