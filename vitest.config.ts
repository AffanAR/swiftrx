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
  },
});
