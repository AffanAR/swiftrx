#!/usr/bin/env node
// =============================================================================
//  SwiftRx security-header check
// =============================================================================
//  Starts the production server (scripts/serve.mjs) on a spare port and checks
//  what it actually sends, for both apps, their files, the server's own text
//  answers and the API:
//    - every response: HSTS, nosniff, DENY framing, Referrer-Policy, ...;
//    - the app pages: a Content-Security-Policy whose script hashes are those
//      of the inline scripts in the very HTML that was served, and no
//      'unsafe-inline' or 'unsafe-eval' for scripts;
//    - everything else: a CSP that allows nothing.
//  The expected values are written out here rather than imported, so a wrong
//  edit to apps/api/src/securityHeaders.ts fails this check too.
//
//    npm run build && npm run check:headers      (part of `npm run check`)
// =============================================================================

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

const EVERY_RESPONSE = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'x-robots-tag': 'noindex, nofollow',
};
const NOTHING_CSP = "default-src 'none'; frame-ancestors 'none'";

const port = await sparePort();
const server = spawn(process.execPath, ['--liftoff-only', 'scripts/serve.mjs'], {
  cwd: REPO,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const exited = new Promise((resolve) => server.on('exit', resolve));

const failures = [];
let checked = 0;
try {
  await waitFor(() => get('admin.localhost', '/api/health').then((r) => r.status === 200));

  for (const host of ['admin.localhost', 'city-hospital.localhost']) {
    const index = await get(host, '/');
    checkPage(host, '/', index);
    // A client-side route is the same page.
    checkPage(host, '/rx', await get(host, '/rx'));

    const assets = [...index.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (assets.length === 0) failures.push(`${host}/: links to no /assets/ files`);
    for (const asset of assets) checkOther(host, asset, await get(host, asset), 200);

    checkOther(host, '/missing.js', await get(host, '/missing.js'), 404);
  }
  checkOther('admin.localhost', '/healthz', await get('admin.localhost', '/healthz'), 200);
  checkOther('admin.localhost', '/api/health', await get('admin.localhost', '/api/health'), 200);
  checkOther('admin.localhost', '/api/nope', await get('admin.localhost', '/api/nope'), 404);
  checkOther(
    'city-hospital.localhost',
    '/api/auth/me',
    await get('city-hospital.localhost', '/api/auth/me'),
    200,
  );
} catch (error) {
  failures.push(`The server didn't answer as expected: ${error.message}`);
} finally {
  server.kill();
  await exited;
}

if (failures.length > 0) {
  console.error(`[check-headers] ${failures.length} problem(s):\n  ${failures.join('\n  ')}`);
  if (log) console.error(`[check-headers] Server log:\n${log}`);
  process.exit(1);
}
console.log(`[check-headers] ${checked} responses from serve.mjs carry the security headers.`);

// --- checks ------------------------------------------------------------------

function checkCommon(where, res, status) {
  checked += 1;
  if (res.status !== status) failures.push(`${where}: status ${res.status}, expected ${status}`);
  for (const [name, value] of Object.entries(EVERY_RESPONSE)) {
    if (res.headers[name] !== value) {
      failures.push(`${where}: ${name} is ${JSON.stringify(res.headers[name])}, not "${value}"`);
    }
  }
}

function checkPage(host, urlPath, res) {
  const where = `${host}${urlPath}`;
  checkCommon(where, res, 200);
  if (!res.headers['content-type']?.startsWith('text/html')) {
    failures.push(`${where}: not HTML (${res.headers['content-type']})`);
  }
  const csp = res.headers['content-security-policy'] ?? '';
  const directives = new Map(
    csp.split(';').map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  const scripts = directives.get('script-src') ?? [];
  const inline = [...res.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes))
    .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);

  if (inline.length === 0) failures.push(`${where}: no inline theme script found`);
  for (const hash of inline) {
    if (!scripts.includes(hash)) failures.push(`${where}: script-src lacks ${hash}`);
  }
  if (scripts[0] !== "'self'") failures.push(`${where}: script-src doesn't start with 'self'`);
  if (scripts.length !== 1 + inline.length) {
    failures.push(`${where}: script-src allows more than the page's own scripts: ${scripts}`);
  }
  for (const [name, expected] of [
    ['default-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['connect-src', "'self'"],
    ['frame-ancestors', "'none'"],
  ]) {
    if (directives.get(name)?.join(' ') !== expected) {
      failures.push(`${where}: ${name} is not ${expected}`);
    }
  }
}

function checkOther(host, urlPath, res, status) {
  const where = `${host}${urlPath}`;
  checkCommon(where, res, status);
  if (res.headers['content-security-policy'] !== NOTHING_CSP) {
    failures.push(`${where}: CSP is ${JSON.stringify(res.headers['content-security-policy'])}`);
  }
}

// --- plumbing ----------------------------------------------------------------

/** GET with a Host header, as a browser on that subdomain would send it. */
function get(host, urlPath) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: urlPath, headers: { host: `${host}:${port}` } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Retries until `ready` resolves true; the API takes a few seconds to start. */
async function waitFor(ready, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`serve.mjs exited (${server.exitCode})`);
    if (await ready().catch(() => false)) return;
    if (Date.now() > until) throw new Error('serve.mjs did not start in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

function sparePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}
