import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import { openDatabase, type Database, type Db } from './db/client';

describe('GET /api/health', () => {
  let database: Database;

  beforeAll(async () => {
    // PGlite in memory, or the real Postgres in CI's Postgres job.
    const url = process.env.TEST_DATABASE_URL;
    database = await openDatabase(url ? { url } : {});
  }, 60_000);

  afterAll(() => database.close());

  it('answers 200 when the database answers', async () => {
    const res = await createApp({ db: database.db }).request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('answers 503 when the database is down, and keeps the reason out of the body', async () => {
    const down = {
      execute: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    } as unknown as Db;
    const logError = vi.fn();

    const res = await createApp({ db: down, logError }).request('/api/health');

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: 'error', database: 'unreachable' });
    expect(body).not.toContain('ECONNREFUSED');
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('the rest of the API', () => {
  const app = createApp({ db: {} as Db, logError: () => {} });

  it('answers JSON 404 for unknown routes, inside /api and out', async () => {
    for (const path of ['/api/nope', '/health', '/']) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found.' });
    }
  });

  it('answers 500 without details when a route throws', async () => {
    const logError = vi.fn();
    const failing = createApp({ db: {} as Db, logError });
    failing.get('/boom', () => {
      throw new Error('patient p_001 broke something');
    });

    const res = await failing.request('/api/boom');

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: 'Something went wrong.' });
    expect(body).not.toContain('p_001');
    expect(logError).toHaveBeenCalledWith('GET /api/boom failed.', expect.any(Error));
  });
});
