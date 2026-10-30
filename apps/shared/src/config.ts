// Shared cross-app configuration. The portal and admin read these so the URLs
// they hand to each other stay in sync no matter which surface the user lands
// on first. (The Rx pad is a route inside the portal, so it needs no URL here.)
//
// In dev, the defaults below match the ports set in scripts/dev.mjs.
// In prod, set VITE_ROOT_DOMAIN at build time (hospitals live at
// <slug>.<root domain>). VITE_ADMIN_APP_URL / VITE_PORTAL_APP_URL exist too,
// but nothing reads them yet.

function readEnv(name: string, fallback: string): string {
  // Vite injects env at build time under import.meta.env. We also peek
  // process.env so the Node-side scripts (the dev gateway) can use the
  // same module.
  type Env = Record<string, string | undefined>;
  const fromVite = (import.meta as { env?: Env }).env?.[name];
  const fromProcess = (globalThis as { process?: { env?: Env } }).process?.env?.[name];
  const raw = fromVite || fromProcess || fallback;
  return raw.replace(/\/+$/, '');
}

export const ADMIN_APP_URL: string = readEnv('VITE_ADMIN_APP_URL', 'http://localhost:5175');
export const PORTAL_APP_URL: string = readEnv('VITE_PORTAL_APP_URL', 'http://localhost:5174');
export const DEV_GATEWAY_URL: string = readEnv('VITE_DEV_GATEWAY_URL', 'http://localhost:5172');

/** The domain hospitals are subdomains of, e.g. "thesyndicate.bond". */
export const ROOT_DOMAIN: string = readEnv('VITE_ROOT_DOMAIN', 'swiftrx.com').toLowerCase();

/**
 * Delay every data-client reply (api.ts) by this many milliseconds, to see
 * loading states before a real backend exists. 0 (the default) answers at once.
 */
export const MOCK_LATENCY_MS: number = Math.max(
  0,
  Number(readEnv('VITE_MOCK_LATENCY_MS', '0')) || 0,
);

// Demo mode marks the app as a demo: a banner on every page and a DEMO stamp
// on every print. There is no backend yet, so it's on for every production
// build (anything built is something someone might host) and off under
// `vite dev`. VITE_DEMO_MODE=true|false overrides either way.
const isProdBuild = !!(import.meta as { env?: { PROD?: boolean } }).env?.PROD;
export const DEMO_MODE: boolean =
  readEnv('VITE_DEMO_MODE', isProdBuild ? 'true' : 'false') !== 'false';
