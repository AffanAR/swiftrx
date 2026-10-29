#!/usr/bin/env node
// =============================================================================
//  SwiftRx setup
// =============================================================================
//  One-time setup: checks the toolchain, installs the workspace dependencies and
//  reports what to run next.
//
//    node scripts/setup.mjs
// =============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_NODE_MAJOR = 20;

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function step(msg) {
  console.log(`${COLOR.cyan}==>${COLOR.reset} ${msg}`);
}
function ok(msg) {
  console.log(`${COLOR.green}  ok${COLOR.reset} ${msg}`);
}
function warn(msg) {
  console.log(`${COLOR.yellow}  !${COLOR.reset} ${msg}`);
}
function fail(msg) {
  console.log(`${COLOR.red}  x${COLOR.reset} ${msg}`);
}

// --- Node ---------------------------------------------------------------------

const major = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
  fail(`Node ${MIN_NODE_MAJOR}+ is required (found ${process.versions.node}).`);
  fail('Install a current Node from https://nodejs.org and re-run this script.');
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// --- npm ----------------------------------------------------------------------

const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8' });
if (npmVersion.error || npmVersion.status !== 0) {
  fail('npm was not found on PATH. Install Node, which bundles npm.');
  process.exit(1);
}
ok(`npm ${npmVersion.stdout.trim()}`);

// --- Layout sanity check ------------------------------------------------------

const expected = [
  'package.json',
  'apps/admin/package.json',
  'apps/doctor-portal/package.json',
  'apps/shared/package.json',
  'scripts/dev.mjs',
];
const missing = expected.filter((p) => !existsSync(join(ROOT, p)));
if (missing.length) {
  fail(`This does not look like the SwiftRx repo root — missing: ${missing.join(', ')}`);
  process.exit(1);
}
ok('repo layout');

// --- Dependencies -------------------------------------------------------------

step('Installing workspace dependencies (one install at the root)');
const install = spawnSync('npm', ['ci'], {
  cwd: ROOT,
  stdio: 'inherit',
  // `npm ci` needs an up-to-date lockfile. Fall back to `npm install` on a
  // fresh clone or when someone added a dependency without re-locking.
  shell: process.platform === 'win32',
});

if (install.status !== 0) {
  step('npm ci failed — retrying with npm install');
  const retry = spawnSync('npm', ['install'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (retry.status !== 0) {
    fail('Could not install dependencies. See the npm output above.');
    process.exit(1);
  }
}
ok('dependencies installed');

// --- Verify -------------------------------------------------------------------

step('Running the same checks CI runs (format, lint, types, tests, build)');
const check = spawnSync('npm', ['run', 'check'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (check.status !== 0) {
  warn('npm run check failed. Fix the problems above before committing.');
  process.exit(check.status ?? 1);
}
ok('all checks passed');

// --- Next steps ---------------------------------------------------------------

console.log(`
${COLOR.green}Setup complete.${COLOR.reset}

  Start everything (admin + portal + rx + dev gateway):
    ${COLOR.cyan}npm run dev:all${COLOR.reset}

  Then open:
    http://admin.localhost:5172              (platform admin)
    http://city-hospital.localhost:5172     (City Hospital portal)
    http://northstar-medical.localhost:5172 (Northstar portal)
    ${COLOR.dim}http://city-hospital.localhost:5172/rx  (the Rx pad)${COLOR.reset}

  Chrome and Firefox resolve *.localhost to 127.0.0.1. Other browsers may need
  a hosts entry — see deploy/DNS.md.

  Sign in with:
    admin@swiftrx.com / admin1234                  (platform admin)
    ayesha@city-hospital.com / demo1234           (City Hospital doctor)

  Docs: README.md · docs/ARCHITECTURE.md · CONTRIBUTING.md
`);
