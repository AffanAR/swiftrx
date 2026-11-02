# Putting SwiftRx online

> **Status (2026-10-22):** SwiftRx is a front-end prototype with no backend.
> It can be hosted as a public **demo**: one Render web service behind
> Cloudflare, at `thesyndicate.bond` (section 3). The demo is a sandbox for
> showing the UI. Nothing here is suitable for real patient data. The roadmap
> is in [`ROADMAP.md`](../ROADMAP.md), and the engineering checklist in
> [`PLAN.md`](../PLAN.md).

---

## 1. Run it locally

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

## 2. What the hosted demo is (and isn't)

- **Most data is on the server, prescriptions aren't yet.** `scripts/serve.mjs`
  runs the API under `/api` on a PGlite database in memory, started from the
  snapshot `npm run build` writes. Sign-in, hospitals and their settings,
  patients, doctors, the audit log and the medicine catalog live there, so
  every visitor shares them, and they all reset whenever the instance
  restarts or sleeps. Signed prescriptions still live in each visitor's
  browser until `POST /prescriptions` exists: visitors don't see each other's,
  and a reload drops them. A hospital created in the admin panel gets a portal
  at its subdomain, with no users yet.
- **Anyone can sign in.** The sign-in pages show the demo passwords, which
  the API lists in demo mode (they are no longer in the bundles), so anyone
  can sign in as the platform admin or a doctor.
- **Memory.** Render's free instance has 512 MB. `npm start` runs Node with
  `--liftoff-only` and the API starts from the snapshot; that peaked near
  400 MB when measured locally (`scripts/serve.mjs` has the numbers). Check
  the service's memory graph after a deploy.
- **Demo mode is on in every production build.** Every page shows a banner,
  and every print is stamped "DEMO — NOT A VALID PRESCRIPTION", with no
  signature hash and no "valid until" date. `VITE_DEMO_MODE=false` at build
  time turns it off. Leave it on until the checklist in section 4 is done.
- **Not indexed.** The server sends `X-Robots-Tag: noindex, nofollow`.
- **Security headers.** Every response carries HSTS, a Content-Security-
  Policy and the rest of `apps/api/src/securityHeaders.ts`. HSTS covers
  subdomains, so every `*.thesyndicate.bond` host must serve HTTPS, as
  Render and Cloudflare do. A new outside resource (another font host, an
  analytics script) needs adding to the CSP there first, or browsers block
  it.
- **Optional: invited people only.** Cloudflare Zero Trust → Access can put an
  email sign-in in front of `thesyndicate.bond` and `*.thesyndicate.bond`
  (free for up to 50 users).

---

## 3. Host the demo on Render + Cloudflare

### How it fits together

```
browser ─▶ Cloudflare (DNS, TLS) ─▶ Render web service: node scripts/serve.mjs
                                       ├─ thesyndicate.bond, www., admin.  → apps/admin/dist
                                       └─ <slug>.thesyndicate.bond (+ /rx) → apps/doctor-portal/dist
```

One environment variable, `VITE_ROOT_DOMAIN`, sets the domain. The apps read
it at build time (which hospital a hostname belongs to, and the admin panel's
portal links), and [`scripts/serve.mjs`](../scripts/serve.mjs) reads it at
runtime to pick the app for each hostname. [`render.yaml`](../render.yaml)
sets it to `thesyndicate.bond`.

To try the production build locally first:

```bash
npm run build
npm start
```

Then open `http://admin.localhost:8080` and
`http://city-hospital.localhost:8080`.

### Step 1: push the repo to GitHub

Render deploys from a Git host. Create a **private** GitHub repository (the
demo passwords are in the code) and push this branch to it.

### Step 2: create the Render service

In Render: **New → Blueprint**, pick the repository. Render reads
`render.yaml` and creates a free web service named `swiftrx`. Without a
Blueprint, **New → Web Service** with the same settings works too:

| Setting           | Value                                         |
| ----------------- | --------------------------------------------- |
| Build command     | `npm ci --include=dev && npm run build`       |
| Start command     | `npm start`                                   |
| Health check path | `/healthz`                                    |
| Env var           | `VITE_ROOT_DOMAIN` = `thesyndicate.bond`      |
| Env var           | `NODE_VERSION` = `22`                         |

When the deploy finishes, the service's `https://<name>.onrender.com` URL
shows the admin sign-in.

### Step 3: move DNS to Cloudflare

1. In Cloudflare, **Add a site** → `thesyndicate.bond` → **Free** plan.
2. At your registrar, replace the nameservers with the two Cloudflare gives
   you. No glue records are needed. Cloudflare emails you when the zone is
   active.
3. Delete any `AAAA` records for `@` or `*` (Render has no IPv6).
4. **SSL/TLS → Overview:** set the mode to **Full**.

### Step 4: add the custom domains on Render

Render only answers for hostnames you add to the service. In the service's
**Settings → Custom Domains**, add both:

- `thesyndicate.bond`
- `*.thesyndicate.bond` (a wildcard doesn't cover the bare domain, so both
  are needed)

Render then lists the DNS records to create. Add them in Cloudflare exactly as
shown. They are along these lines:

| Type  | Name                  | Target                  |
| ----- | --------------------- | ----------------------- |
| CNAME | `@`                   | `<name>.onrender.com`   |
| CNAME | `*`                   | `<name>.onrender.com`   |
| CNAME | `_acme-challenge`     | value shown by Render   |
| CNAME | `_cf-custom-hostname` | value shown by Render   |

Leave every record **DNS only** (grey cloud) until Render shows both domains
as verified with certificates issued. After that you can switch `@` and `*`
to **Proxied** (orange cloud).

### Step 5: check it

| URL                                          | Expect                       |
| -------------------------------------------- | ---------------------------- |
| `https://thesyndicate.bond/healthz`          | `ok`                         |
| `https://thesyndicate.bond`                  | Admin sign-in                |
| `https://admin.thesyndicate.bond`            | Admin sign-in                |
| `https://city-hospital.thesyndicate.bond`    | City Hospital sign-in        |
| `https://city-hospital.thesyndicate.bond/rx` | Rx pad, after a doctor signs in |

### Limits of this setup

- **Cold starts.** A free Render instance sleeps after 15 minutes without
  traffic, and the next visit waits up to about a minute. A paid instance
  doesn't sleep.
- **One subdomain level.** The wildcard covers `city-hospital.thesyndicate.bond`,
  not `a.b.thesyndicate.bond`. Hospital slugs are single labels, so this is
  fine.
- **Reserved names.** `admin` and `www` always open the admin panel.
- **Other hosts.** `scripts/serve.mjs` runs on any Node host. For nginx, see
  [`nginx.swiftrx.com.conf`](nginx.swiftrx.com.conf): build with
  `VITE_ROOT_DOMAIN` set and change its `server_name` lines to your domain.

---

## 4. Before real doctors and patients

These are phases in [`PLAN.md`](../PLAN.md): Phase 2 (backend) and Phase 4
(pilot readiness).

- [ ] Replace `apps/shared/src/mockDb.ts` with a real backend. Its exports
      (`getHospital`, `listPatientsForHospital`, `appendSignedRx`,
      `appendAudit`, …) are the contract.
- [x] Replace the localStorage session with server-issued, HTTP-only
      session cookies, and remove the demo passwords from the bundles.
- [ ] Enforce roles, tenant isolation, plan limits and feature flags on the
      server.
- [ ] Store the audit log append-only.
- [ ] Rate-limit sign-in; add MFA for admins.
- [ ] Encrypt data at rest, take backups, and meet the privacy rules and
      hospital agreements that apply to patient data.
- [ ] Have a clinician review the safety rules (allergy, interaction, dose).
- [ ] Add monitoring and error reporting that never logs patient data.
- [ ] Only then build with `VITE_DEMO_MODE=false`.
