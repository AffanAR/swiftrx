# SwiftRx Doctor Portal

Per-hospital sign-in portal, planned for `<hospital-slug>.swiftrx.com`.
Doctors and hospital admins sign in with their hospital-issued email,
sessions are scoped to that hospital, and every page shows the hospital's
identity. Doctors open the Rx pad from their dashboard; hospital admins
can't prescribe.

> Mock build — sign-in runs in the browser against
> `apps/shared/src/mockDb.ts` and sessions live in localStorage. See the
> root [README](../../README.md) and [PLAN.md](../../PLAN.md).

## Tenant model

| Subdomain                       | Tenant             |
| ------------------------------- | ------------------ |
| `city-hospital.swiftrx.com`     | City Hospital      |
| `northstar-medical.swiftrx.com` | Northstar Medical  |
| `riverside-clinic.swiftrx.com`  | Riverside Clinic   |

The portal resolves its tenant from the host (subdomain) when it loads, or
from a `?hospital=<slug>` query param. Local development uses `*.localhost`,
which Chrome and Firefox resolve to `127.0.0.1` without DNS changes.

## Develop

From the repo root (one install covers every app — npm workspaces):

```bash
npm install
npm run dev:portal
```

Then visit:

- `http://city-hospital.localhost:5174` — City Hospital portal
- `http://northstar-medical.localhost:5174` — Northstar portal
- `http://localhost:5174/?hospital=city-hospital` — fallback via query param

Demo accounts are listed in the [root README](../../README.md#demo-credentials).

## Rx pad hand-off

When a doctor signs in, `src/auth.ts` saves a small "bridge" session to
localStorage. The dashboard's **Start a new prescription** link passes it to
the Rx pad as `?session=<token>`; the link target comes from
`VITE_RX_APP_URL` (default `http://localhost:5173`). Hospital admins get no
bridge, and any left over on the browser is cleared when they sign in.

## Replacing the mock backend

`src/auth.ts` exposes `login`, `logout`, `loadSession` and
`getUserFromSession`. Swap their bodies for API calls once the backend
exists. Pages read the session through `useSession()` in
`src/useSession.ts`, which also exposes `refresh()` for the login page.
