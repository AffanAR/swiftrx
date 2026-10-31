import { Hono } from 'hono';
import { once } from 'node:events';
import { createServer, request, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { openDatabase } from './db/client';
import { seed } from './db/seed';
import { SLOW } from './db/testDatabase';
import { createApiListener, forwardedClientIp, type ApiListener } from './listener';

/** Serve the listener on a free local port, as scripts/serve.mjs does on $PORT. */
async function serve(api: ApiListener) {
  const server = createServer(api.listener).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: (server.address() as AddressInfo).port };
}

/** One HTTP request with the Host header a browser at `host` would send. */
function send(
  port: number,
  host: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>(
    (resolve, reject) => {
      const req = request({ port, method, path, headers: { host, ...headers } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      });
      req.on('error', reject);
      req.end(body);
    },
  );
}

/** Sign Ayesha in at City Hospital through the listener, and check the session and the demo hint. */
async function signInThrough(api: ApiListener) {
  const { server, port } = await serve(api);
  try {
    const host = `city-hospital.localhost:${port}`;
    const login = await send(
      port,
      host,
      'POST',
      '/api/auth/login',
      { 'content-type': 'application/json', origin: `http://${host}` },
      JSON.stringify({ email: 'ayesha@city-hospital.com', password: 'demo1234' }),
    );
    expect(login.status).toBe(200);
    const [cookie] = login.headers['set-cookie'] ?? [];
    expect(cookie).toMatch(/^swiftrx_portal=[\w-]{43}; Max-Age=43200; Path=\/; HttpOnly;/);

    const me = await send(port, host, 'GET', '/api/auth/me', { cookie: cookie.split(';')[0] });
    expect(me.status).toBe(200);
    expect(JSON.parse(me.body).session).toMatchObject({ userId: 'd_001' });

    // The demo shows its accounts, and the API has its own 404.
    const demo = await send(port, host, 'GET', '/api/auth/demo-accounts');
    expect(JSON.parse(demo.body).accounts.length).toBeGreaterThan(0);
    const missing = await send(port, host, 'GET', '/api/nope');
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toEqual({ error: 'Not found.' });
  } finally {
    server.close();
    await api.close();
  }
}

describe('createApiListener', () => {
  it(
    'without a snapshot, migrates and seeds a new in-memory database',
    async () => {
      const api = createApiListener({}, join(tmpdir(), 'no-such-snapshot.tgz'));
      expect(await api.ready).toBe('PGlite in memory, seeded with the demo data');
      await signInThrough(api);
    },
    SLOW,
  );

  it(
    'starts from the snapshot the build writes',
    async () => {
      const source = await openDatabase({});
      await source.migrate();
      await seed(source.db);
      const file = join(mkdtempSync(join(tmpdir(), 'swiftrx-')), 'demo-db.tgz');
      writeFileSync(file, await source.dump!());
      await source.close();

      const api = createApiListener({}, file);
      expect(await api.ready).toBe('PGlite in memory, from the demo snapshot');
      await signInThrough(api);
    },
    SLOW,
  );

  it('answers 503 when the database never comes up', async () => {
    const api = createApiListener({ DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' });
    await expect(api.ready).rejects.toThrow();
    const { server, port } = await serve(api);
    try {
      const res = await send(port, 'admin.localhost', 'GET', '/api/health');
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toEqual({ error: 'The API is unavailable.' });
    } finally {
      server.close();
      await api.close();
    }
  });
});

describe('forwardedClientIp', () => {
  const app = new Hono().get('/', (c) => c.text(forwardedClientIp(c) ?? 'unknown'));
  const ip = async (headers: Record<string, string>) =>
    (await app.request('/', { headers })).text();

  it("takes Cloudflare's CF-Connecting-IP first", async () => {
    expect(
      await ip({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }),
    ).toBe('198.51.100.4');
  });

  it('else the last X-Forwarded-For entry, which the proxy added', async () => {
    expect(await ip({ 'x-forwarded-for': '6.6.6.6, 198.51.100.9' })).toBe('198.51.100.9');
  });

  it('else nothing it can trust', async () => {
    expect(await ip({})).toBe('unknown');
  });
});
