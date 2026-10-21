// Runtime configuration for the Rx app.
//
// `VITE_PORTAL_URL` lets production deployments point the "Sign in" link at
// the real portal host without rebuilding. In dev we fall back to
// `http://localhost:5174` so a freshly-cloned repo works out of the box.
//
// Set via .env (Vite reads .env / .env.local at dev time and exposes
// `import.meta.env.VITE_PORTAL_URL`).

export const PORTAL_URL: string =
  (import.meta as any).env?.VITE_PORTAL_URL?.replace(/\/+$/, '') ||
  'http://localhost:5174';
