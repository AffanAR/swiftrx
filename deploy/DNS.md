# SwiftRx — DNS / routing setup

This document explains how the three SwiftRx apps get wired together
for local development and production.

## App layout

| App              | Code path                | Planned production host    | Dev port |
|------------------|--------------------------|----------------------------|----------|
| Admin panel      | `apps/admin/`            | `admin.swiftrx.com`        | 5175     |
| Hospital portal  | `apps/doctor-portal/`    | `<slug>.swiftrx.com`       | 5174     |
| Rx pad           | `src/` (workspace root)  | `<slug>.swiftrx.com/rx`    | 5173     |
| Dev gateway      | `scripts/dev.mjs`        | — (dev only)               | 5172     |

## Production

> Nothing is hosted yet, and the `/rx` routing below doesn't work as
> written. See [`ONLINE.md`](ONLINE.md) for what has to happen first.

1. Add DNS records:
   - `A swiftrx.com        → <lb ip>`
   - `A *.swiftrx.com      → <lb ip>` (wildcard)
   - `A admin.swiftrx.com  → <lb ip>` (covered by the wildcard, but explicit
     makes intent obvious)
2. Point the wildcard at a load balancer that terminates TLS and forwards
   to your app servers.
3. Use the example nginx config in `deploy/nginx.swiftrx.com.conf` to map
   hostnames to bundles, or replicate the routing in your cloud LB. Its
   `/rx` block needs rework first: the Rx pad is built with base `/`, so
   under `/rx/` its assets would load from the portal.
4. The admin panel and the portal live at different hostnames, so cookies
   and localStorage are isolated — the portal writes a small `BridgeSession`
   to localStorage and passes it to the Rx pad via the `?session=<token>`
   query param on the "Open Rx Pad" link.

## Local development

Two ways to run the system locally:

### Option A — Dev gateway (recommended, single URL)

1. Run `npm install` at the workspace root.
2. Run `npm run dev:all`. This boots the three Vite apps and the dev
   gateway on port 5172.
3. Open any of these:
   - `http://admin.localhost:5172`       → admin login
   - `http://city-hospital.localhost:5172`  → portal login
   - `http://northstar-medical.localhost:5172`  → portal login
   - `http://riverside-clinic.localhost:5172`  → portal login (no accounts yet)

   The Rx pad isn't reachable through the gateway yet (`/rx` returns a
   proxy error). Sign in to a portal as a doctor and click **Start a new
   prescription**, which opens `http://localhost:5173` with the session.
   Plain `http://localhost:5172` has no hospital in it, so the portal shows
   "Hospital portal not found".

Chrome and Firefox natively resolve `*.localhost` to `127.0.0.1`. Other
browsers may need a `/etc/hosts` entry. See below.

### Option B — Standalone per app

Useful for focused work on a single app:

- `npm run dev:rx`        → Rx pad on http://localhost:5173
- `npm run dev:portal`    → Hospital portal on http://localhost:5174
- `npm run dev:admin`     → Admin panel on http://localhost:5175

When the portal is opened on `:5174` standalone, the tenant is resolved
from the `?hospital=<slug>` query param. Add `?hospital=city-hospital` to
the URL to scope to a specific tenant.

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
- `dist/`         (Rx pad)
- `apps/doctor-portal/dist/`
- `apps/admin/dist/`
