#!/usr/bin/env node
// =============================================================================
//  SwiftRx production server
// =============================================================================
//  Serves both production builds from one process (one Render web service, or
//  any Node host) and picks the app by Host header, as the dev gateway does:
//    <root>, www.<root>, admin.<root>    → admin   (apps/admin/dist)
//    <slug>.<root>                       → portal  (apps/doctor-portal/dist;
//                                                   the Rx pad is its /rx route)
//    admin.localhost / <slug>.localhost  → same rules, for trying it locally
//    anything else (e.g. *.onrender.com) → admin
//  <root> is VITE_ROOT_DOMAIN, the same variable the apps are built with.
//
//  /api on every host is the API (apps/api, see its src/listener.ts), so
//  sign-in cookies stay on the apps' own origin. Without DATABASE_URL, as on
//  the hosted demo, the API runs on a PGlite in memory with the demo data,
//  started from the snapshot `npm run build` writes.
//
//  Memory, for Render's free instance (512 MB). Measured on Windows, Node 24,
//  2026-10-31, as the OS's peak working set while the API starts:
//    - 398 MB from the snapshot, with `node --liftoff-only` (`npm start`);
//    - 931 MB without that flag: V8's optimizing compiler for WebAssembly
//      briefly takes over 500 MB on PGlite's largest functions. Liftoff
//      alone runs this small database fast enough;
//    - 748 MB without the snapshot, which builds the database at boot.
//
//  Other paths without a file extension fall back to the app's index.html
//  (client-side routing); a missing file is a real 404. Run `npm run build`
//  first. Listens on $PORT (Render sets it), default 8080.
// =============================================================================

import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const DIST = {
  admin: path.join(REPO, 'apps', 'admin', 'dist'),
  portal: path.join(REPO, 'apps', 'doctor-portal', 'dist'),
};
const ROOT_DOMAIN = (process.env.VITE_ROOT_DOMAIN || 'swiftrx.com').toLowerCase();
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// Sent with every response. The demo holds no real data and shouldn't be
// indexed; the rest is cheap hardening for a public URL.
const BASE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function appFor(hostname) {
  for (const root of [ROOT_DOMAIN, 'localhost']) {
    if (hostname.endsWith('.' + root)) {
      const sub = hostname.slice(0, -(root.length + 1));
      return sub === 'admin' || sub === 'www' ? 'admin' : 'portal';
    }
  }
  return 'admin';
}

/** The file a URL path names inside `root`, or null if there isn't one. */
async function fileAt(root, urlPath) {
  const file = path.join(root, urlPath);
  // path.join resolves `..`; anything that lands outside the build is refused.
  if (!file.startsWith(root + path.sep)) return null;
  try {
    const s = await stat(file);
    return s.isFile() ? { file, size: s.size } : null;
  } catch {
    return null;
  }
}

function sendFile(req, res, { file, size }, cacheControl) {
  res.writeHead(200, {
    ...BASE_HEADERS,
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': cacheControl,
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(text);
}

for (const [app, dir] of Object.entries(DIST)) {
  if (!existsSync(path.join(dir, 'index.html'))) {
    console.error(`[serve] ${app} build missing at ${dir}. Run \`npm run build\` first.`);
    process.exit(1);
  }
}
if (!process.env.DATABASE_URL && !existsSync(path.join(REPO, 'apps/api/dist/demo-db.tgz'))) {
  console.warn(
    '[serve] No demo database snapshot (apps/api/dist/demo-db.tgz), so the API builds one at boot,',
    'which takes far more memory. `npm run build` writes it.',
  );
}

// The API is TypeScript; tsx compiles it as it loads, with the API's own
// tsconfig for its @swiftrx/shared paths. That, and starting its database,
// takes a while on a small instance, so the apps are served meanwhile and
// /api requests wait.
const api = tsImport('../apps/api/src/listener.ts', {
  parentURL: import.meta.url,
  tsconfig: path.join(REPO, 'apps', 'api', 'tsconfig.json'),
}).then(({ createApiListener }) => createApiListener());
api
  .then((loaded) => loaded.ready)
  .then(
    (where) => console.log(`[serve] API ready: ${where}`),
    (error) => console.error('[serve] The API could not start, so /api answers 503.', error),
  );

const server = createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }

  // Before the static rules: the API takes every method, and an unknown /api
  // path must be its JSON 404, not the app's index.html.
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
    return api.then(
      (loaded) => loaded.listener(req, res),
      () => {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'The API is unavailable.' }));
      },
    );
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }
  if (urlPath === '/healthz') return sendText(res, 200, 'ok');

  const hostname = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  const root = DIST[appFor(hostname)];

  const hit = await fileAt(root, urlPath);
  if (hit) {
    // Vite fingerprints everything under /assets/, so those never change.
    const cache = urlPath.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    return sendFile(req, res, hit, cache);
  }
  // A missing file is a real 404; answering a missing script with index.html
  // would surface as a confusing MIME-type error instead.
  if (path.extname(urlPath)) return sendText(res, 404, 'Not found');

  return sendFile(req, res, await fileAt(root, '/index.html'), 'no-cache');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    [
      `[serve] SwiftRx on port ${PORT}`,
      `[serve]   admin      ${ROOT_DOMAIN}, admin.${ROOT_DOMAIN}`,
      `[serve]   hospitals  <slug>.${ROOT_DOMAIN} (Rx pad at /rx)`,
      `[serve]   API        /api on every host`,
      `[serve]   locally    http://admin.localhost:${PORT}, http://city-hospital.localhost:${PORT}`,
    ].join('\n'),
  );
});

// Render sends SIGTERM before it replaces the instance.
async function shutdown() {
  server.close();
  await api.then((loaded) => loaded.close()).catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
