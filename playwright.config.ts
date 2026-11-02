// End-to-end tests (e2e/): a real browser against the production server
// (scripts/serve.mjs) and its API, started fresh from the build's demo
// database snapshot, so every run begins from the seed.
//
//   npm run build && npm run test:e2e
//
// Hospitals are subdomains, and browsers resolve *.localhost to 127.0.0.1,
// so the tests open http://city-hospital.localhost:<port> and so on.
//
// Locally the tests drive an installed Microsoft Edge (Windows has it), so
// nothing needs downloading; PLAYWRIGHT_CHANNEL=chrome picks Chrome instead.
// CI downloads Playwright's own Chromium (`npx playwright install chromium`).
import { defineConfig, devices } from '@playwright/test';

export const E2E_PORT = Number(process.env.E2E_PORT) || 8181;

export default defineConfig({
  testDir: './e2e',
  // One server and one in-memory database: the tests share them, in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : 'msedge'),
      },
    },
  ],
  webServer: {
    command: 'node --liftoff-only scripts/serve.mjs',
    env: { PORT: String(E2E_PORT) },
    // The API answers once its database has started from the snapshot.
    url: `http://localhost:${E2E_PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
