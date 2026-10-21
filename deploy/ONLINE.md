# Putting SwiftRx online

> **Status (2026-10-22):** SwiftRx is a front-end prototype with no backend.
> There is **no tested way to host it for other people yet.** This page
> covers what works today, what doesn't and why, and what has to happen
> before it can go online. The roadmap is in [`PLAN.md`](../PLAN.md).
>
> Nothing here is suitable for real patient data.

---

## 1. What works today: a local demo

From the repo root:

```bash
npm install        # one install for every app (npm workspaces)
npm run dev:all    # Rx pad :5173, portal :5174, admin :5175, gateway :5172
```

Then open, in Chrome or Firefox (they resolve `*.localhost` to 127.0.0.1;
other browsers need the hosts-file entries in [`DNS.md`](DNS.md)):

| URL                                        | Shows                          |
| ------------------------------------------ | ------------------------------ |
| `http://admin.localhost:5172`              | Admin panel sign-in            |
| `http://city-hospital.localhost:5172`      | City Hospital portal sign-in   |
| `http://northstar-medical.localhost:5172`  | Northstar portal sign-in       |
| `http://localhost:5174/?hospital=city-hospital` | Portal without the gateway |

**Rx pad:** sign in to a portal as a **doctor** and click **Start a new
prescription**. That opens `http://localhost:5173` with the doctor's
session. Hospital admins can't open the Rx pad.

Demo accounts are listed in the [README](../README.md#demo-credentials).

---

## 2. Why it can't be shared yet

- **No backend.** All data lives in each browser tab's memory (admin
  feature edits go to that browser's localStorage). Different people,
  devices, and even different apps never see each other's changes, and a
  reload resets everything.
- **Mock sign-in.** Passwords ship inside the app bundles and sessions are
  unsigned. Acceptable on your own machine, not on the internet.
- **One URL can't reach all three apps.** The dev gateway picks the app by
  hostname (`admin.localhost` vs `<slug>.localhost`). A single tunnel URL
  has one hostname, so through the gateway it only reaches the portal
  (add `?hospital=<slug>`), and the portal's Rx pad link still points at
  `localhost:5173`, which is the *viewer's* own machine.
- **The dev servers reject outside hostnames.** Tunnelling straight to an
  app port (e.g. 5174) returns *"Blocked request. This host is not
  allowed"* unless the host is added to `server.allowedHosts` in that
  app's `vite.config.ts`.
- **`/rx` routing doesn't work yet**, neither through the dev gateway
  (the Rx dev server only listens on IPv6 `[::1]:5173`, and the Rx app
  has no `/rx` base path, so its scripts would load from the portal) nor
  in [`nginx.swiftrx.com.conf`](nginx.swiftrx.com.conf) (the Rx build
  uses base `/`, so its `/assets/…` requests hit the portal).

---

## 3. What has to happen first

These are phases in [`PLAN.md`](../PLAN.md):

1. **Phase 1 — move the Rx pad into the portal** as a `/rx` route. Each
   hospital is then one app on one hostname: no session hand-off, no
   `/rx` proxying, and a single tunnel URL can demo the whole doctor flow.
2. **Phase 2 — backend.** A real API and database, server-issued session
   cookies, and data that persists and is shared across apps and devices.
3. **Phase 4 — pilot readiness.** Hosting with backups and monitoring, a
   security review, and privacy and data-processing agreements with
   hospitals.

---

## 4. Hosting outline (for when those are done)

- **Domain with wildcard DNS** pointing at your server or load balancer:

  | Type | Name | Value         |
  | ---- | ---- | ------------- |
  | A    | `@`  | `<server-ip>` |
  | A    | `*`  | `<server-ip>` |

- **TLS for the apex and the wildcard**, e.g. a wildcard Let's Encrypt
  certificate (DNS challenge) or a proxy such as Cloudflare in front.
- **Reverse proxy:** [`nginx.swiftrx.com.conf`](nginx.swiftrx.com.conf)
  maps `admin.<domain>` to the admin build and `<slug>.<domain>` to the
  portal build. Its `/rx` block needs rework (see section 2).
- **Build-time env vars** (copy the `.env.example` files):

  | Var               | Read by  | Purpose                                    | Default                 |
  | ----------------- | -------- | ------------------------------------------ | ----------------------- |
  | `VITE_RX_APP_URL` | Portal   | Target of the "Open Rx Pad" link           | `http://localhost:5173` |
  | `VITE_PORTAL_URL` | Rx pad   | Target of "Open doctor portal" when signed out | `http://localhost:5174` |

  `VITE_ADMIN_APP_URL`, `VITE_PORTAL_APP_URL` and `VITE_DEV_GATEWAY_URL`
  are defined in `apps/shared/src/config.ts` but nothing uses them yet.

---

## 5. Production checklist

Before any real doctor signs in:

- [ ] Replace `apps/shared/src/mockDb.ts` with a real backend. Its exports
      (`getHospital`, `listPatientsForHospital`, `appendSignedRx`,
      `appendAudit`, …) are the contract.
- [ ] Replace the localStorage / URL session hand-off with server-issued,
      HTTP-only session cookies.
- [ ] Enforce roles, tenant isolation, plan limits and feature flags on the
      server.
- [ ] Store the audit log append-only.
- [ ] Rate-limit sign-in; add MFA for admins.
- [ ] Encrypt data at rest, take backups, and meet the privacy rules and
      hospital agreements that apply to patient data.
- [ ] Have a clinician review the safety rules (allergy, interaction, dose).
- [ ] Add monitoring and error reporting that never logs patient data.
