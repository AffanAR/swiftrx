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
npm run dev:all    # portal :5174 (incl. the Rx pad), admin :5175, gateway :5172
```

Then open, in Chrome or Firefox (they resolve `*.localhost` to 127.0.0.1;
other browsers need the hosts-file entries in [`DNS.md`](DNS.md)):

| URL                                        | Shows                          |
| ------------------------------------------ | ------------------------------ |
| `http://admin.localhost:5172`              | Admin panel sign-in            |
| `http://city-hospital.localhost:5172`      | City Hospital portal sign-in   |
| `http://northstar-medical.localhost:5172`  | Northstar portal sign-in       |
| `http://city-hospital.localhost:5172/rx`   | Rx pad (after signing in as a doctor) |
| `http://localhost:5174/?hospital=city-hospital` | Portal without the gateway |

**Rx pad:** it's the portal's `/rx` route. Sign in as a **doctor**, then use
**Start a new prescription** or **Rx pad** in the nav. Hospital admins can't
open it.

Demo accounts are listed in the [README](../README.md#demo-credentials).

---

## 2. Why it can't be shared yet

- **No backend.** All data lives in each browser tab's memory (admin
  feature edits go to that browser's localStorage). Within one tab the
  portal and its Rx pad share data, but different people, devices, and the
  admin panel never see each other's changes, and a reload resets
  everything.
- **Mock sign-in.** Passwords ship inside the app bundles and sessions are
  unsigned. Acceptable on your own machine, not on the internet.
- **One URL can't reach both apps.** The dev gateway picks the app by
  hostname (`admin.localhost` vs `<slug>.localhost`). A single tunnel URL
  has one hostname, so through the gateway it can only reach the portal
  and its Rx pad (add `?hospital=<slug>` on the first page load), not the
  admin panel. This hasn't been tested end to end with a real tunnel.
- **The dev servers reject outside hostnames.** Tunnelling straight to an
  app port (e.g. 5174) returns *"Blocked request. This host is not
  allowed"* unless the host is added to `server.allowedHosts` in that
  app's `vite.config.ts`.

---

## 3. What has to happen first

These are phases in [`PLAN.md`](../PLAN.md):

1. **Phase 1 — consolidate the frontend.** Moving the Rx pad into the
   portal as its `/rx` route is done (2026-10-22): each hospital is one app
   on one hostname, with no session hand-off. Tests and CI are still to come.
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
  portal build; the portal's SPA fallback also serves `/rx`.
- **Build-time env vars:** none are needed today.
  `VITE_ADMIN_APP_URL`, `VITE_PORTAL_APP_URL` and `VITE_DEV_GATEWAY_URL`
  are defined in `apps/shared/src/config.ts` but nothing uses them yet.

---

## 5. Production checklist

Before any real doctor signs in:

- [ ] Replace `apps/shared/src/mockDb.ts` with a real backend. Its exports
      (`getHospital`, `listPatientsForHospital`, `appendSignedRx`,
      `appendAudit`, …) are the contract.
- [ ] Replace the localStorage session with server-issued, HTTP-only
      session cookies.
- [ ] Enforce roles, tenant isolation, plan limits and feature flags on the
      server.
- [ ] Store the audit log append-only.
- [ ] Rate-limit sign-in; add MFA for admins.
- [ ] Encrypt data at rest, take backups, and meet the privacy rules and
      hospital agreements that apply to patient data.
- [ ] Have a clinician review the safety rules (allergy, interaction, dose).
- [ ] Add monitoring and error reporting that never logs patient data.
