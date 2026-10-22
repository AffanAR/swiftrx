// Shared cross-app configuration. The portal and admin read these so the URLs
// they hand to each other stay in sync no matter which surface the user lands
// on first. (The Rx pad is a route inside the portal, so it needs no URL here.)
//
// In dev, the defaults below match the ports set in scripts/dev.mjs.
// In prod, set VITE_ADMIN_APP_URL / VITE_PORTAL_APP_URL at build time
// (or via Vercel project env vars). Nothing reads them yet.

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
