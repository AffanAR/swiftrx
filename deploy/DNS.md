# SwiftRx — DNS / routing setup

This document explains how the two SwiftRx apps get wired together
for local development and production.

## App layout

| App              | Code path                     | Planned production host    | Dev port |
|------------------|-------------------------------|----------------------------|----------|
| Admin panel      | `apps/admin/`                 | `admin.swiftrx.com`        | 5175     |
| Hospital portal  | `apps/doctor-portal/`         | `<slug>.swiftrx.com`       | 5174     |
| ↳ Rx pad         | `apps/doctor-portal/src/rx/`  | `<slug>.swiftrx.com/rx`    | (portal) |
| Dev gateway      | `scripts/dev.mjs`             | — (dev only)               | 5172     |

## Production

> Nothing is hosted yet. See [`ONLINE.md`](ONLINE.md) for what has to
> happen first.

1. Add DNS records:
   - `A swiftrx.com        → <lb ip>`
   - `A *.swiftrx.com      → <lb ip>` (wildcard)
   - `A admin.swiftrx.com  → <lb ip>` (covered by the wildcard, but explicit
     makes intent obvious)
2. Point the wildcard at a load balancer that terminates TLS and forwards
   to your app servers.
3. Use the example nginx config in `deploy/nginx.swiftrx.com.conf` to map
   hostnames to bundles, or replicate the routing in your cloud LB. The Rx
   pad is the portal's `/rx` route, so the portal's SPA fallback serves it.
4. The admin panel and each hospital portal live at different hostnames, so
   cookies and localStorage are isolated per app and per hospital. The Rx
   pad shares its hospital portal's origin and session.

## Local development

Two ways to run the system locally:

### Option A — Dev gateway (recommended, single URL)

1. Run `npm install` at the workspace root.
2. Run `npm run dev:all`. This boots the two Vite apps and the dev
   gateway on port 5172.
3. Open any of these:
   - `http://admin.localhost:5172`       → admin login
   - `http://city-hospital.localhost:5172`  → portal login
   - `http://northstar-medical.localhost:5172`  → portal login
   - `http://riverside-clinic.localhost:5172`  → portal login (no accounts yet)
   - `http://city-hospital.localhost:5172/rx`  → Rx pad (sign in as a doctor first)

   Plain `http://localhost:5172` has no hospital in it, so the portal shows
   "Hospital portal not found".

Chrome and Firefox natively resolve `*.localhost` to `127.0.0.1`. Other
browsers may need a `/etc/hosts` entry. See below.

### Option B — Standalone per app

Useful for focused work on a single app:

- `npm run dev:portal`    → Hospital portal (incl. the Rx pad) on http://localhost:5174
- `npm run dev:admin`     → Admin panel on http://localhost:5175

When the portal is opened on `:5174` standalone, the tenant is resolved
from the `?hospital=<slug>` query param. Add `?hospital=city-hospital` to
the URL to scope to a specific tenant. It's read on page load only, so
reloading a deeper page such as `/rx` without it shows "Hospital portal not
found"; `http://city-hospital.localhost:5174/rx` works on reload.

## Hosts file (for browsers that don't honor `*.localhost`)

If your browser doesn't resolve `*.localhost` to 127.0.0.1, add the
following to your OS hosts file:

```
127.0.0.1   admin.localhost
127.0.0.1   city-hospital.localhost
127.0.0.1   northstar-medical.localhost
127.0.0.1   riverside-clinic.localhost
```

- macOS / Linux: `/etc/hosts`
- Windows (admin): `%WINDIR%\System32\drivers\etc\hosts`

## Demo credentials

See the table in the [README](../README.md#demo-credentials). The portal
rejects accounts that don't belong to the hospital in the URL, so open the
right hospital subdomain for each account.

## Build all apps

```
npm run build
```

Produces:
- `apps/doctor-portal/dist/` (portal; the Rx pad is a separate lazy-loaded chunk)
- `apps/admin/dist/`
