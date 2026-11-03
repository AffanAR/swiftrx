import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import type { Database } from './db/client';
import { patients } from './db/schema';
import { seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';
import { scrubError, scrubText, sentryReporter, type ScrubbedError } from './log';

const CITY = 'http://city-hospital.swiftrx.com';

describe('scrubText', () => {
  it('cuts query parameters, emails, quoted values and phone numbers', () => {
    expect(
      scrubText(
        'Failed query: insert into "patients" ("name") values ($1)\nparams: Rahima Begum,+880-1711-000001',
      ),
    ).toBe('Failed query: insert into "patients" ("name") values ($1) params: [removed]');
    expect(scrubText('mail to rahima@example.com failed')).toBe('mail to [email] failed');
    expect(scrubText(`where name = 'O''Brien'`)).toBe(`where name = '[value]'`);
    expect(scrubText('call +880 1711-000001 now')).toBe('call [number] now');
    expect(scrubText('x'.repeat(900))).toHaveLength(500);
  });
});

describe('scrubError', () => {
  it('keeps the type, code, constraint and frames, and nothing of the values', () => {
    const pg = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_unique"'),
      {
        code: '23505',
        constraint: 'users_email_unique',
        table: 'users',
        detail: 'Key (email)=(rahima@example.com) already exists.',
        where: 'anything',
      },
    );
    const wrapped = new Error(
      'Failed query: insert into "users" ("email") values ($1)\nparams: rahima@example.com',
      { cause: pg },
    );
    const scrubbed = scrubError(wrapped);
    expect(scrubbed).toMatchObject({
      type: 'Error',
      message: 'Failed query: insert into "users" ("email") values ($1) params: [removed]',
      cause: { code: '23505', constraint: 'users_email_unique', table: 'users' },
    });
    expect(scrubbed.stack[0]).toMatch(/^at /);
    expect(JSON.stringify(scrubbed)).not.toMatch(/rahima|Key \(email\)/);
  });

  it('handles things thrown that are not errors', () => {
    expect(scrubError('boom for rahima@example.com')).toEqual({
      type: 'string',
      message: 'boom for [email]',
      stack: [],
    });
  });
});

describe('a failed database write, end to end', () => {
  let database: Database;
  beforeAll(async () => {
    database = await freshDatabase();
    await seed(database.db);
  }, SLOW);
  afterAll(() => database.close());

  it("logs nothing of the patient's details", async () => {
    const lines: unknown[] = [];
    const sink = vi.fn();
    const app = createApp({
      db: database.db,
      rootDomain: 'swiftrx.com',
      log: (l) => lines.push(l),
      errorSink: sink,
    });
    // A route that writes a patient who already exists: Postgres refuses it,
    // and Drizzle's error carries the row's values.
    app.get('/explode', async () => {
      const [p] = await database.db.select().from(patients).limit(1);
      await database.db.insert(patients).values({ ...p, contact: '+880-1711-999999' });
      return new Response('unreachable');
    });

    const res = await app.request(`${CITY}/api/explode`);
    expect(res.status).toBe(500);

    const [patient] = await database.db.select().from(patients).limit(1);
    const logged = JSON.stringify(lines) + JSON.stringify(sink.mock.calls);
    expect(logged).toContain('request_failed');
    expect(logged).toContain('23505');
    for (const value of [patient.name, patient.contact, '1711-999999', patient.id]) {
      expect(logged).not.toContain(value);
    }
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Error' }),
      expect.objectContaining({ source: 'api', route: '/api/explode' }),
    );
  });
});

describe('POST /api/client-errors', () => {
  it('logs a browser crash scrubbed, and answers 204 whatever comes', async () => {
    const lines: Record<string, unknown>[] = [];
    const app = createApp({
      db: {} as never,
      log: (l) => lines.push(l),
      clientIp: () => '203.0.113.9',
    });
    const post = (body: unknown) =>
      app.request(`${CITY}/api/client-errors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: CITY },
        body: JSON.stringify(body),
      });

    const res = await post({
      app: 'portal',
      name: 'TypeError',
      message: "Cannot read 'x' of undefined for rahima@example.com",
      stack: 'at render (https://city-hospital.swiftrx.com/assets/index.js:1:2345)',
      path: '/patients?q=Rahima',
    });
    expect(res.status).toBe(204);
    const report = lines.find((l) => l.event === 'client_error')!;
    expect(report).toMatchObject({
      level: 'error',
      app: 'portal',
      path: '/patients',
      error: { type: 'TypeError' },
    });
    expect(JSON.stringify(report)).not.toMatch(/rahima/i);

    // Junk is dropped quietly, and a flood is cut off.
    expect((await post({ nonsense: true })).status).toBe(204);
    for (let i = 0; i < 25; i++)
      await post({ app: 'admin', name: 'E', message: `m${i}`, path: '/' });
    expect(lines.filter((l) => l.event === 'client_error').length).toBeLessThanOrEqual(20);
  });
});

describe('sentryReporter', () => {
  const error: ScrubbedError = {
    type: 'TypeError',
    message: 'boom',
    stack: ['at handler (/srv/app.js:10:5)', 'at run (/srv/hono.js:1:1)'],
  };

  it('sends an envelope to the DSN’s project with only the scrubbed error and tags', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const sink = sentryReporter('https://abc123@o1.ingest.sentry.io/4507', {
      environment: 'demo',
      release: 'deadbeef',
      send: send as unknown as typeof fetch,
    })!;
    sink(error, { source: 'api', route: '/api/boom' });

    const [url, init] = send.mock.calls[0];
    expect(url).toBe('https://o1.ingest.sentry.io/api/4507/envelope/');
    expect(init.headers['X-Sentry-Auth']).toContain('sentry_key=abc123');
    const [, item, eventJson] = String(init.body).split('\n');
    expect(JSON.parse(item)).toEqual({ type: 'event' });
    const event = JSON.parse(eventJson);
    expect(event).toMatchObject({
      level: 'error',
      environment: 'demo',
      release: 'deadbeef',
      tags: { source: 'api', route: '/api/boom' },
      exception: { values: [{ type: 'TypeError', value: 'boom' }] },
    });
    expect(
      event.exception.values[0].stacktrace.frames.map((f: { function: string }) => f.function),
    ).toEqual(['run', 'handler']);
    expect(Object.keys(event)).not.toContain('user');
    expect(Object.keys(event)).not.toContain('request');
  });

  it('refuses a DSN that is not one', () => {
    expect(sentryReporter('not a dsn')).toBeNull();
    expect(sentryReporter('http://key@sentry.example/1')).toBeNull();
    expect(sentryReporter('https://sentry.example/1')).toBeNull();
  });
});
