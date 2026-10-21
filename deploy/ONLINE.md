# Putting SwiftRx Online (free, for testing)

This doc covers three things, in the order you should try them:

1. **[5 min] Share the local dev environment with anyone, anywhere** via
   a Cloudflare quick tunnel — no DNS, no signup, no credit card.
2. **[30 min] Publish all three apps on Vercel** with the free `*.vercel.app`
   subdomain. The admin, hospital portal, and Rx pad each get their own
   URL, and the dev gateway still routes them by host.
3. **[optional] Get a real wildcard domain** like `*.swiftrx.com` for free
   (or nearly so) so hospitals can live on `<slug>.swiftrx.com`.

> ⚠️ This is a **testing** deployment. The mock database is in localStorage
> and lives per-browser. For a real launch, swap `apps/shared/src/mockDb.ts`
> for a real backend (the API surface it exposes is what the real backend
> should mirror).

---

## Part 1 — Share the local dev build instantly (Cloudflare Quick Tunnel)

This is the fastest path. You keep running the dev server, and anyone with
the URL hits your machine through Cloudflare's edge. Zero config, zero
signup, zero cost. The tunnel URL is random and changes every time you
restart it, so it's only good for live demos.

### 1.1 Install `cloudflared`

Pick one:

- **macOS** — `brew install cloudflared`
- **Windows (winget)** — `winget install Cloudflare.cloudflared`
- **Windows (scoop)** — `scoop install cloudflared`
- **Linux** — grab the binary from <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
  or `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/`

Verify: `cloudflared --version`

### 1.2 Start the dev gateway

From the repo root:

```bash
npm run dev
```

That boots all four servers:

| Surface         | Local URL                       |
| --------------- | ------------------------------- |
| Dev gateway     | http://localhost:5172           |
| Admin panel     | http://admin.localhost:5172     |
| Hospital portal | http://city-hospital.localhost:5172 |
| Rx pad          | http://localhost:5173/rx        |

### 1.3 Open the tunnel

In a second terminal:

```bash
cloudflared tunnel --url http://localhost:5172
```

Cloudflare prints a `https://<random-words>.trycloudflare.com` URL.
That's your public entry point. Send it to anyone:

| URL                                       | Goes to                |
| ----------------------------------------- | ---------------------- |
| `https://<rand>.trycloudflare.com/`              | Admin panel (root path) |
| `https://<rand>.trycloudflare.com/rx`            | Rx pad                  |
| `https://<rand>.trycloudflare.com/city-hospital` | City Hospital portal    |

> **Note on subdomains:** quick tunnels give you one host, not many. So
> the `<slug>.swiftrx.com` style routing only works in Part 2+. For Part 1
> we use the path-based fallback at the gateway. If you want the subdomain
> feel in Part 1, run named tunnels (see Cloudflare docs) — those require
> a free Cloudflare account and a domain you control.

### 1.4 Demo credentials

| Role           | Email                          | Password    | Lands on            |
| -------------- | ------------------------------ | ----------- | ------------------- |
| Platform admin | `admin@swiftrx.com`            | `admin1234` | Admin panel         |
| Hospital admin | `admin@city-hospital.com`      | `admin1234` | City Hospital       |
| Doctor         | `ayesha@city-hospital.com`     | `dr1234`    | City Hospital (simple UI) |
| Doctor         | `sana@northstar-medical.com`   | `dr1234`    | Northstar           |
| Hospital admin | `admin@riverside-clinic.com`   | `admin1234` | Riverside           |

> Doctor sign-in is intentionally a tiny UI — no subscription, doctor
> roster, or settings. See `apps/doctor-portal/src/components/PortalShell.tsx`
> for the role-based nav.

---

## Part 2 — Free static hosting

Vercel hosts the three static SPAs for free. The gateway (a long-lived
Node Web proxy) lives on a small free VM. The two are wired together
with a single public hostname.

### 2.1 One-time setup

```bash
npm i -g vercel
vercel login
```

### 2.2 Deploy the three static apps to Vercel

In the repo root, run:

```bash
# Admin panel  →  https://swiftrx-admin.vercel.app
cd apps/admin && vercel --prod --yes
cd ../..

# Hospital portal → https://swiftrx-portal.vercel.app
cd apps/doctor-portal && vercel --prod --yes
cd ../..

# Rx pad → https://swiftrx-rx.vercel.app
vercel --prod --yes      # project root for the Rx pad
cd ..
```

Each app already has a `vercel.json` that rewrites every path to
`index.html` so client-side routing keeps working on hard reload.

If you prefer the Vercel UI: click *Add New → Project*, **Import** the
repo three times, and set each project's **Root Directory** to
`apps/admin`, `apps/doctor-portal`, or repo root respectively. The
`vercel.json` files take care of the rest.

### 2.3 Deploy the gateway to a free VM

Vercel serverless functions can't run a long-lived Web proxy, so the
gateway lives on a small free VM. Pick whichever you like:

| Service              | Free tier                       | Setup                                            |
| -------------------- | ------------------------------- | ------------------------------------------------ |
| Render               | Free web service (spins down after idle, but free) | New → Web Service → connect repo, root = `scripts`, build = `npm install`, start = `node dev.mjs` |
| Railway              | $5 free credit / month          | New → Deploy from repo, set `scripts` as root, start = `node dev.mjs` |
| Fly.io               | Free allowance for small VMs    | `fly launch --copy-config` then `fly deploy`     |
| Glitch               | Always-free Node project        | New Project → `hello-node`, paste in the gateway code |

Set these env vars on the gateway host:

| Var                     | Value                            |
| ----------------------- | -------------------------------- |
| `SWIFTRX_ADMIN_URL`     | `https://swiftrx-admin.vercel.app`     |
| `SWIFTRX_PORTAL_URL`    | `https://swiftrx-portal.vercel.app`    |
| `SWIFTRX_RX_URL`        | `https://swiftrx-rx.vercel.app`        |
| `SWIFTRX_PUBLIC_HOST`   | `<your-gateway-hostname>`               |
| `PORT`                  | `8080` (Render/Railway convention)      |

The gateway reads these and rewrites `Host:` so the downstream Vercel
apps see a unified origin. With `SWIFTRX_PUBLIC_HOST=swiftrx-gateway.onrender.com`,
the router now resolves:

| URL                                                    | Goes to           |
| ------------------------------------------------------ | ----------------- |
| `https://swiftrx-gateway.onrender.com/`                | Admin panel       |
| `https://swiftrx-gateway.onrender.com/rx`              | Rx pad            |
| `https://swiftrx-gateway.onrender.com/city-hospital`   | Hospital portal   |
| `https://swiftrx-gateway.onrender.com/northstar-medical` | Hospital portal |
| `https://swiftrx-gateway.onrender.com/riverside-clinic` | Hospital portal  |

---

## Part 3 — Real wildcard domain (free options)

The hospital portal lives on `<slug>.swiftrx.com`. To make that work
without paying for a domain, pick one of these paths.

### 3.1 Free subdomains you actually own

| Provider        | What you get                            | Caveat                                                  |
| --------------- | --------------------------------------- | ------------------------------------------------------- |
| `eu.org`        | Free permanent subdomain under `eu.org` | Application takes 1–4 weeks. You become the registrant. |
| `is-a.dev`      | Free subdomain like `swiftrx.is-a.dev` (or any name you register) | GitHub PR registration. |
| `js.org`        | Free `swiftrx.js.org`                   | Project must be a JavaScript project (yours is).        |
| `onrender.com`  | `swiftrx.onrender.com`                  | Free Render static site, no wildcard.                   |
| `vercel.app`    | `swiftrx.vercel.app`                    | Free with Vercel, no wildcard (use a project per slug). |
| `glitch.com`    | `swift-rx.glitch.me`                    | Free, no wildcard.                                      |

For a true wildcard (`*.swiftrx.com` → one IP), you need your own
domain. Cheapest path is:

- **Porkbun** — `.com` is ~$9/yr, `.xyz` is ~$1/yr. Free WHOIS privacy.
- **Cloudflare Registrar** — at-cost, no markup. Requires a free
  Cloudflare account.
- **Spaceship** (Namecheap spinoff) — `.xyz` from ~$1/yr the first year.

### 3.2 DNS for `*.swiftrx.com`

Once you own `swiftrx.com`, in Cloudflare DNS add:

| Type | Name | Value                       | Proxy |
| ---- | ---- | --------------------------- | ----- |
| A    | `@`  | `<gateway-ipv4>`            | Proxied |
| A    | `*`  | `<gateway-ipv4>`            | Proxied |

Then in the Cloudflare dashboard, point `swiftrx.com` and `*.swiftrx.com`
at the gateway. Cloudflare's free tier terminates TLS for both apex and
wildcard automatically.

### 3.3 Gateway config for wildcard

Set on the gateway host:

```bash
SWIFTRX_WILDCARD_DOMAIN=swiftrx.com
SWIFTRX_GATEWAY_PORT=443
SWIFTRX_TLS_EMAIL=ops@swiftrx.com   # for Let's Encrypt
```

The gateway's router now resolves:

| Host                            | App            |
| ------------------------------- | -------------- |
| `admin.swiftrx.com`             | Admin panel    |
| `rx.swiftrx.com`                | Rx pad         |
| `city-hospital.swiftrx.com`     | City Hospital  |
| `northstar-medical.swiftrx.com` | Northstar      |
| `riverside-clinic.swiftrx.com`  | Riverside      |
| `swiftrx.com`                   | Admin panel (root) |

### 3.4 Local-only wildcard with `nip.io` / `sslip.io`

If you want `<slug>.swiftrx.com` to work on a dev machine without owning
the real domain:

- Use `nip.io`: add `127.0.0.1.nip.io` to your hosts file. `city-hospital.swiftrx.127.0.0.1.nip.io` resolves to 127.0.0.1.
- Or use `sslip.io`: `city-hospital.127.0.0.1.sslip.io` works the same.

Or just edit `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts`):

```
127.0.0.1   admin.swiftrx.com
127.0.0.1   rx.swiftrx.com
127.0.0.1   city-hospital.swiftrx.com
127.0.0.1   northstar-medical.swiftrx.com
127.0.0.1   riverside-clinic.swiftrx.com
```

Then run `npm run dev` and visit `http://city-hospital.swiftrx.com:5172/`.

---

## Part 4 — Production checklist (when you're ready)

These are the things to do **before** you let real doctors sign in:

- [ ] Replace `apps/shared/src/mockDb.ts` with a real backend.
      The exports there are the contract: `getHospital`, `getUserByEmail`,
      `appendSignedRx`, `appendAudit`, etc.
- [ ] Replace the localStorage bridge token with an HTTP-only signed
      cookie between the portal and the Rx pad.
- [ ] Move audit log to an append-only store (S3 + Object Lock, or a
      managed ledger).
- [ ] Add rate limiting on the login endpoints (1 attempt / 2s / IP).
- [ ] HIPAA: encrypt at rest, sign a BAA with the cloud provider, restrict
      egress, add SSO + MFA for doctors.
- [ ] Set up a real domain + Cloudflare + monitoring.

Until then, the Vercel + Cloudflare tunnel setup above is fine for
internal demos and stakeholder review.
