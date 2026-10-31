// Unit tests for the shared package, the doctor portal (incl. the Rx pad) and
// the API. Everything under test is plain TypeScript, so the tests run in Node.
// The API tests run against PGlite (Postgres in WebAssembly), so they need no
// database server.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const SHARED_SRC = fileURLToPath(new URL('./apps/shared/src/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // The API imports single modules (`@swiftrx/shared/schemas`) so that it
      // doesn't load the React half of the index.
      { find: /^@swiftrx\/shared\/(.+)$/, replacement: `${SHARED_SRC}$1` },
      { find: /^@swiftrx\/shared$/, replacement: `${SHARED_SRC}index.ts` },
    ],
  },
  test: {
    include: ['apps/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      // Scope to the pure logic that carries clinical and security risk and
      // has real tests. The React components are not included: there are no DOM
      // tests, so counting them would drag the number down without guarding
      // anything. Widen this list as DOM tests are added.
      include: [
        'apps/shared/src/{api,auth,tenant,print,schemas}.ts',
        'apps/doctor-portal/src/rx/{store,safety,search}.ts',
        // Entry points (server.ts, db/cli.ts, env.ts) are left out: they only
        // wire these modules to the process.
        'apps/api/src/{app,listener}.ts',
        'apps/api/src/auth/*.ts',
        'apps/api/src/db/{client,schema,seed}.ts',
      ],
      thresholds: {
        // Calibrated just under the measured numbers so CI fails on a
        // regression rather than on day one. Raise deliberately as tests are
        // added; never lower these to make a build pass.
        lines: 80,
        functions: 65,
        branches: 80,
        statements: 80,
      },
    },
  },
});
