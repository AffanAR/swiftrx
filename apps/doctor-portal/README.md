# SwiftRx Doctor Portal

Per-hospital login portal deployed on `<hospital-slug>.swiftrx.com`.
Doctors sign in with their hospital-issued email, sessions are scoped to that
tenant, and every navigation surfaces the hospital's identity.

> Mock build — auth is local-only (`localStorage` keyed by session). Swap
> `src/auth.ts` for a real API call when the backend is ready.

## Tenant model

| Subdomain                    | Tenant             |
| ---------------------------- | ------------------ |
| `city-hospital.swiftrx.com`  | City Hospital      |
| `northstar-medical.swiftrx.com` | Northstar Medical |
| `riverside-clinic.swiftrx.com`  | Riverside Clinic   |

The portal resolves its tenant from the host (subdomain) on every load.
Local development uses `*.localhost`, which Chrome and Firefox resolve to
`127.0.0.1` without DNS changes.

## Develop

```bash
cd apps/doctor-portal
npm install
npm run dev
```

Then visit:

- `http://city-hospital.localhost:5174` — City Hospital portal
- `http://northstar-medical.localhost:5174` — Northstar portal
- `http://localhost:5174/?hospital=riverside-clinic` — fallback via query param

### Demo credentials

| Email                         | Password   | Tenant                |
| ----------------------------- | ---------- | --------------------- |
| ayesha@city-hospital.com      | demo1234   | city-hospital         |
| bilal@city-hospital.com       | demo1234   | city-hospital         |
| sana@northstar-medical.com    | demo1234   | northstar-medical     |

## Wiring to SwiftRx main app

The doctor's workspace (Rx pad, patient queue) will live inside this same
portal. Each card on the dashboard is a placeholder that points to a route
under construction. When the real workspace is ready, link it from
`pages/DashboardPage.tsx`.

## Replacing the mock backend

`src/auth.ts` exposes `login`, `logout`, `loadSession`, and `getDoctorById`.
Each of those is a single function — swap their bodies for `fetch` calls
when the API is online. The rest of the app uses session state via the
`useSession` hook, so no other files need to change.
