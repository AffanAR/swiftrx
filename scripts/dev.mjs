#!/usr/bin/env node
// =============================================================================
//  SwiftRx dev orchestrator
// =============================================================================
//  Boots the two Vite apps (portal :5174, admin :5175) and a gateway on :5172
//  that routes by Host header:
//    admin.*           → admin
//    *                 → portal (the Rx pad is the portal's /rx route)
//    *.localhost       → portal (Chrome/Firefox resolve *.localhost → 127.0.0.1)
//
//  In production the same mapping is done by a reverse proxy (see deploy/nginx
//  in the repo for an example).
// =============================================================================

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import httpProxyModule from 'http-proxy-middleware';
// CJS interop: prefer .default, fall back to the namespace itself.
const httpProxy =
  httpProxyModule.createProxyMiddleware || httpProxyModule.default || httpProxyModule;

const PORTAL_PORT = 5174;
const ADMIN_PORT = 5175;
const GATEWAY_PORT = 5172;

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function log(name, msg) {
  const tag = `${COLOR.dim}[${name}]${COLOR.reset}`;
  console.log(`${tag} ${msg}`);
}

function spawnOne(name, color, cwd, args, env = {}) {
  const child = spawn('npm', args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1', ...env },
    shell: true,
  });
  const tag = `${color}[${name}]${COLOR.reset}`;
  child.stdout.on('data', (b) => {
    process.stdout.write(
      b
        .toString()
        .split('\n')
        .map((l) => (l ? `${tag} ${l}` : ''))
        .join('\n') + '\n',
    );
  });
  child.stderr.on('data', (b) => {
    process.stderr.write(
      b
        .toString()
        .split('\n')
        .map((l) => (l ? `${tag} ${l}` : ''))
        .join('\n') + '\n',
    );
  });
  child.on('exit', (code) => log(name, `exited with code ${code}`));
  return child;
}

function pickTargets() {
  const mode = (process.argv[2] || 'all').toLowerCase();
  if (mode === 'gateway') return { portal: false, admin: false, gateway: true };
  if (mode === 'portal') return { portal: true, admin: false, gateway: false };
  if (mode === 'admin') return { portal: false, admin: true, gateway: false };
  return { portal: true, admin: true, gateway: true };
}

const targets = pickTargets();

if (targets.gateway) {
  const proxyToAdmin = httpProxy({
    target: `http://127.0.0.1:${ADMIN_PORT}`,
    changeOrigin: true,
    ws: true,
  });
  const proxyToPortal = httpProxy({
    target: `http://127.0.0.1:${PORTAL_PORT}`,
    changeOrigin: true,
    ws: true,
  });

  const server = createServer((req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    const url = req.url || '/';

    // Query ?as=admin → admin.
    if (url.includes('as=admin')) {
      log('gateway', `${host}${url}  →  admin`);
      return proxyToAdmin(req, res);
    }

    const sub = host.split('.')[0];

    if (sub === 'admin' || host === 'admin.localhost' || host.startsWith('admin.')) {
      log('gateway', `${host}${url}  →  admin`);
      return proxyToAdmin(req, res);
    }

    // Default (and any *.localhost): portal.
    log('gateway', `${host}${url}  →  portal`);
    return proxyToPortal(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    const host = (req.headers.host || '').toLowerCase();
    const sub = host.split('.')[0];
    if (sub === 'admin' || host.startsWith('admin.'))
      return proxyToAdmin.upgrade(req, socket, head);
    return proxyToPortal.upgrade(req, socket, head);
  });

  server.listen(GATEWAY_PORT, '127.0.0.1', () => {
    const banner = [
      '',
      '════════════════════════════════════════════════════════════════',
      '  SwiftRx dev gateway',
      '════════════════════════════════════════════════════════════════',
      `  Gateway    :  port ${GATEWAY_PORT}, routes by hostname:`,
      `  Admin      :  http://admin.localhost:${GATEWAY_PORT}`,
      `  Hospitals  :  http://city-hospital.localhost:${GATEWAY_PORT}`,
      `                http://northstar-medical.localhost:${GATEWAY_PORT}`,
      `                http://riverside-clinic.localhost:${GATEWAY_PORT}`,
      `  Rx pad     :  http://city-hospital.localhost:${GATEWAY_PORT}/rx (signed-in doctors)`,
      '',
      '  Each app also runs standalone on its own port:',
      `    Portal  http://localhost:${PORTAL_PORT}/?hospital=city-hospital`,
      `    Admin   http://localhost:${ADMIN_PORT}`,
      '════════════════════════════════════════════════════════════════',
      '',
    ].join('\n');
    console.log(banner);
  });
}

const children = [];
if (targets.portal)
  children.push(spawnOne('portal', COLOR.cyan, 'apps/doctor-portal', ['run', 'dev']));
if (targets.admin) children.push(spawnOne('admin', COLOR.magenta, 'apps/admin', ['run', 'dev']));

function shutdown() {
  children.forEach((c) => {
    try {
      c.kill('SIGINT');
    } catch {}
  });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
