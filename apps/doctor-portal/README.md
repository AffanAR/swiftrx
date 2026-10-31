# SwiftRx Doctor Portal

Per-hospital sign-in portal, planned for `<hospital-slug>.swiftrx.com`.
Doctors and hospital admins sign in with their hospital-issued email,
sessions are scoped to that hospital, and every page shows the hospital's
identity. The Rx pad is this portal's `/rx` route; doctors open it from
their dashboard or the nav, and hospital admins can't prescribe.

> Sign-in and sessions are on the server (`apps/api`, `/api/auth`); the
> pages' data still comes from `apps/shared/src/mockDb.ts`. See the root
> [README](../../README.md) and [PLAN.md](../../PLAN.md).

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

## Rx pad

The Rx pad lives in `src/rx/` and is lazy-loaded at `/rx` (see `src/App.tsx`),
so its code only downloads when a doctor opens it. The route only renders for
users who pass `canPrescribe()` in `src/auth.ts` (active, licensed doctors of
this hospital); signed-out visitors go to the login page and everyone else to
the dashboard.

`src/rx/RxPad.tsx` passes the signed-in doctor to `loadWorkspace()` in
`src/rx/store.ts`, which reads the hospital's patients and signed Rx from the
same in-memory mock db as the portal pages. Prescriptions signed in the pad
show up in the portal, and patients added in the portal show up in the pad.

## Replacing the mock backend

Sign-in is already on the server. `src/useSession.ts` asks the API who is
signed in at this hospital (`GET /api/auth/me`) and exposes `signOut` and
`signedIn`, which the login page calls with the session the server made.
`src/auth.ts` holds the gates: `sessionBelongsTo()` and `canPrescribe()`,
which reads the user's memberships from that answer. Data still comes from
the mock db through `apps/shared/src/api.ts`.
