#!/usr/bin/env node
// =============================================================================
//  SwiftRx bundle check
// =============================================================================
//  Fails if a browser build carries anything that would help someone sign in:
//  a password hash (bcrypt or Argon2), the field that held one, bcrypt's code,
//  or one of the demo accounts' passwords. Those live on the server only
//  (apps/api); the demo's sign-in pages fetch them from the API in demo mode.
//
//    npm run build && npm run check:bundles      (part of `npm run check`)
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const BUILDS = ['apps/admin/dist', 'apps/doctor-portal/dist'];
const TEXT = /\.(html|js|mjs|css|json|map|txt|svg|webmanifest)$/;

const demoPasswords = new Set(
  Object.values(
    JSON.parse(readFileSync(path.join(REPO, 'apps/api/src/db/demo-passwords.json'), 'utf8')),
  ),
);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FORBIDDEN = [
  { what: 'a bcrypt hash', pattern: /\$2[aby]\$\d\d\$/ },
  { what: 'an Argon2 hash', pattern: /\$argon2(id|i|d)\$/ },
  { what: 'a password-hash field', pattern: /password_?hash/i },
  { what: 'bcrypt code', pattern: /bcrypt/i },
  ...[...demoPasswords].map((p) => ({
    what: 'a demo password',
    pattern: new RegExp(`(?<![\\w-])${escape(p)}(?![\\w-])`),
  })),
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (TEXT.test(name)) yield full;
  }
}

const hits = [];
let scanned = 0;
for (const build of BUILDS) {
  const dir = path.join(REPO, build);
  if (!existsSync(path.join(dir, 'index.html'))) {
    console.error(`[check-bundles] No build at ${build}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  for (const file of files(dir)) {
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    for (const { what, pattern } of FORBIDDEN) {
      const m = pattern.exec(text);
      if (m) {
        const around = text.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' ');
        hits.push(`${path.relative(REPO, file)}: ${what}: …${around}…`);
      }
    }
  }
}

if (hits.length > 0) {
  console.error(`[check-bundles] Found what must stay on the server:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `[check-bundles] ${scanned} files in ${BUILDS.join(' and ')}: no passwords, hashes or bcrypt.`,
);
