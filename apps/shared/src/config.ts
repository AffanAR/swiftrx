// Shared cross-app configuration. The portal, admin, and Rx pad all read
// these so the URLs they hand to each other stay in sync no matter which
// surface the user lands on first.
//
// In dev, the defaults below match the ports set in scripts/dev.mjs.
// In prod, set VITE_RX_APP_URL / VITE_ADMIN_APP_URL / VITE_PORTAL_APP_URL
// at build time (or via Vercel project env vars).

function readEnv(name: string, fallback: string): string {
  // Vite injects env at build time under import.meta.env. We also peek
  // process.env so the Node-side scripts (the dev gateway) can use the
  // same module.
  const fromVite =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.[name];
  const fromProcess =
    typeof process !== 'undefined' && (process as any).env?.[name];
  const raw = (fromVite || fromProcess || fallback) as string;
  return raw.replace(/\/+$/, '');
}

export const RX_APP_URL: string = readEnv('VITE_RX_APP_URL', 'http://localhost:5173');
export const ADMIN_APP_URL: string = readEnv('VITE_ADMIN_APP_URL', 'http://localhost:5175');
export const PORTAL_APP_URL: string = readEnv('VITE_PORTAL_APP_URL', 'http://localhost:5174');
export const DEV_GATEWAY_URL: string = readEnv('VITE_DEV_GATEWAY_URL', 'http://localhost:5172');

/** Build a deep link to the Rx pad that includes the bridge session token. */
export function rxDeepLink(token: string | null): string {
  if (!token) return RX_APP_URL;
  return `${RX_APP_URL}/?session=${encodeURIComponent(token)}`;
}
