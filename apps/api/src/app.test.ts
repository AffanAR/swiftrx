import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import { openDatabase, type Database, type Db } from './db/client';
import { NOTHING_CSP, SECURITY_HEADERS } from './securityHeaders';

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
    const log = vi.fn();

    const res = await createApp({ db: down, log }).request('/api/health');

    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: 'error', database: 'unreachable' });
    expect(body).not.toContain('ECONNREFUSED');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', event: 'health_check_failed' }),
    );
  });
});

describe('the rest of the API', () => {
  const app = createApp({ db: {} as Db, log: () => {} });

  it('answers JSON 404 for unknown routes, inside /api and out', async () => {
    for (const path of ['/api/nope', '/health', '/']) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found.' });
    }
  });

  it('sends the security headers with every answer, errors included', async () => {
    const failing = createApp({ db: {} as Db, log: () => {} });
    failing.get('/boom', () => {
      throw new Error('boom');
    });
    const answers = [
      await failing.request('/api/nope'), // 404
      await failing.request('/api/boom'), // 500
      // 403: a write from another site.
      await failing.request('/api/auth/login', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{}',
      }),
    ];

    expect(answers.map((r) => r.status)).toEqual([404, 500, 403]);
    for (const res of answers) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(res.headers.get(name)).toBe(value);
      }
      expect(res.headers.get('content-security-policy')).toBe(NOTHING_CSP);
    }
  });

  it('answers 500 without details when a route throws, with an id for the log', async () => {
    const log = vi.fn();
    const failing = createApp({ db: {} as Db, log });
    failing.get('/boom', () => {
      throw new Error('patient p_001 broke something');
    });

    const res = await failing.request('/api/boom');

    expect(res.status).toBe(500);
    const body = await res.text();
    const requestId = res.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.parse(body)).toEqual({ error: 'Something went wrong.', requestId });
    expect(body).not.toContain('p_001');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        event: 'request_failed',
        method: 'GET',
        route: '/api/boom',
        requestId,
      }),
    );
  });

  it('logs each request by its route pattern, never its ids or query', async () => {
    const lines: Record<string, unknown>[] = [];
    const logged = createApp({ db: {} as Db, log: (l) => lines.push(l) });
    logged.get('/hospitals/:slug/patients/:id', (c) => c.json({ ok: true }));

    const res = await logged.request('/api/hospitals/city-hospital/patients/p_001?q=Rahima');

    expect(res.status).toBe(200);
    expect(lines).toEqual([
      {
        level: 'info',
        event: 'request',
        method: 'GET',
        route: '/api/hospitals/:slug/patients/:id',
        hospital: 'city-hospital',
        status: 200,
        ms: expect.any(Number),
        requestId: res.headers.get('x-request-id'),
      },
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/p_001|Rahima/);
  });

  it("logs the answering route's pattern past the routers' own middleware", async () => {
    const lines: Record<string, unknown>[] = [];
    const logged = createApp({ db: {} as Db, log: (l) => lines.push(l) });

    // Without a session: the quick-packs route itself answers 401.
    const res = await logged.request('/api/hospitals/city-hospital/quick-packs');

    expect(res.status).toBe(401);
    expect(lines[0]).toMatchObject({ route: '/api/hospitals/:slug/quick-packs', status: 401 });
    await logged.request('/api/nowhere');
    expect(lines[1]).toMatchObject({ route: '(no route)', status: 404 });
  });
});
