// Unit tests for the shared package and the doctor portal (incl. the Rx pad).
// Everything under test is plain TypeScript, so the tests run in Node.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@swiftrx/shared': fileURLToPath(new URL('./apps/shared/src/index.ts', import.meta.url)),
    },
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
        'apps/shared/src/{auth,tenant,print}.ts',
        'apps/doctor-portal/src/rx/{store,safety,search}.ts',
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
