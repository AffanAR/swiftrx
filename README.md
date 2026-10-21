# SwiftRx

Keyboard-first, ultra-low-latency digital prescription pad for clinicians. The
workspace is split into **three** apps that all run out of one repo and share
a single source of truth:

| App              | Surface                          | Production host           |
| ---------------- | -------------------------------- | ------------------------- |
| **Admin panel**  | Platform admin (tenants, users,  | `admin.swiftrx.com`       |
|                  | usage, audit log)                |                           |
| **Doctor portal**| Tenant-scoped doctor + admin     | `<slug>.swiftrx.com`      |
|                  | sign-in, patient roster, Rx log  |                           |
| **Rx pad**       | Keyboard-first prescription pad  | `<slug>.swiftrx.com/rx`   |

The doctor portal and the admin panel are pure SPAs built with
**Vite + React 18 + TypeScript** and styled with a custom **Tailwind CSS**
design system. All three apps share the same data, types, auth primitives,
and UI primitives via the local `@swiftrx/shared` package.

## Run it

```bash
npm install

# Run the whole system (admin + portal + rx + dev gateway on :5172):
npm run dev:all

# Or run a single app:
npm run dev:rx          # Rx pad on http://localhost:5173
npm run dev:portal      # Hospital portal on http://localhost:5174
npm run dev:admin       # Admin panel on http://localhost:5175
npm run dev:gateway     # Only the dev gateway on http://localhost:5172

# Build all three apps:
npm run build
```

### Try it with the dev gateway

After `npm run dev:all`, open:

- `http://admin.localhost:5172`            — admin login
- `http://city-hospital.localhost:5172`   — portal login for City Hospital
- `http://northstar-medical.localhost:5172` — portal login for Northstar
- `http://riverside-clinic.localhost:5172` — portal login for Riverside
- `http://city-hospital.localhost:5172/rx` — Rx pad for City Hospital

Chrome and Firefox resolve `*.localhost` to `127.0.0.1` natively. Other
browsers may need a `/etc/hosts` entry — see `deploy/DNS.md`.

### Demo credentials

- **Admin**: `admin@swiftrx.com` / `admin1234`
- **City Hospital doctor**: `ayesha@city-hospital.com` / `demo1234`
  (also: `bilal@city-hospital.com`)
- **Northstar doctor**: `sana@northstar-medical.com` / `demo1234`

## Repo layout

```
SwiftRX/
├─ apps/
│   ├─ shared/         # types, mock db, auth, tenant resolution, UI primitives
│   ├─ admin/          # platform console (port 5175)
│   └─ doctor-portal/  # per-hospital doctor login (port 5174)
├─ src/                # Rx pad (port 5173)
├─ scripts/dev.mjs     # dev orchestrator + subdomain gateway (port 5172)
├─ deploy/             # nginx config + DNS / hosts file docs
└─ package.json        # workspace root
```

`@swiftrx/shared` is consumed by each app via a Vite alias and a TypeScript
`paths` entry — there's no build step, no monorepo tooling beyond `npm`.
Replace it with a real backend by swapping the `mockDb.ts` functions for
HTTP calls; the components don't change.

## Tenant model

Each hospital lives at its own subdomain. The dev gateway and the production
reverse proxy (see `deploy/nginx.swiftrx.com.conf`) do the routing by host:

```
admin.swiftrx.com           → admin app
city-hospital.swiftrx.com   → doctor portal
city-hospital.swiftrx.com/rx → Rx pad
```

Inside the doctor portal, login is gated to the resolved tenant — a
doctor registered for `northstar-medical` cannot sign in at
`city-hospital`. The signed-Rx payload carries the hospital slug so the
Rx pad, portal, and admin panel all stay isolated.

## Keyboard contract (Rx pad)

| Hotkey             | Action                                                  |
| ------------------ | ------------------------------------------------------- |
| `⌘/Ctrl + K`       | Jump focus to patient search                            |
| `/`                | Jump focus to diagnosis search                          |
| `Tab` / `Shift+Tab`| Traverse fields (browser-native)                        |
| `↑ / ↓`            | Move within an open suggestion list                     |
| `Enter`            | Accept highlighted suggestion (or sign via `⌘Enter`)    |
| `Tab` (in med box) | Accept top suggestion (brand → generic shortcut)        |
| `Alt + 1/2/3`      | Inject Quick Pack #1 / #2 / #3 for current diagnosis    |
| `Alt + N`          | New patient                                             |
| `Alt + R`          | Repeat the patient's last prescription (Previous Rx)    |
| `⌘/Ctrl + S`       | Sign & print                                            |
| `⌘/Ctrl + Enter`   | Sign & print (saves instead inside the New Patient form)|
| `⌘/Ctrl + P`       | Print current view (or browser print dialog)            |
| `Backspace`        | On empty input inside an open row → remove that row     |
| `Esc`              | Clear the workspace                                     |

Repeat fills an empty pad with the previous diagnosis, tests and medications.
If the pad already has content it keeps your diagnosis and only adds
medications that aren't on the pad yet.

Quick packs, New patient and Repeat use `Alt` because browsers reserve `Ctrl/⌘ + N`
(new window) and `Ctrl/⌘ + 1–8` (tab switching) and won't let a page take
them over. Firefox on Linux also uses `Alt + 1–8` for tabs.

## Production swap-ins

- **Database**: `apps/shared/src/mockDb.ts` → Postgres via Prisma. The
  `MOCK_*` constants and `getHospital` / `listPatientsForHospital` / etc.
  helpers are the seam.
- **Auth**: replace the `login` function in `apps/shared/src/auth.ts` with
  a real API call. The `BridgeSession` payload (written by the portal to
  localStorage and forwarded to the Rx pad) is the contract to keep.
- **Pharmacy / EHR**: `sign()` already returns a `SignedRx`. Wire it to a
  POST endpoint instead of `window.print()`.

## Files of note

| Path                                          | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `apps/shared/src/types.ts`                    | All cross-app types (Hospital, User, Patient, …)   |
| `apps/shared/src/mockDb.ts`                   | Seed data + per-tenant lookups                     |
| `apps/shared/src/auth.ts`                     | `login`, token encode/decode, session helpers     |
| `apps/shared/src/tenant.ts`                   | `resolveSurface()` — host / query → admin / hospital / rx |
| `apps/shared/src/components.tsx`              | Reusable form + identity components                |
| `apps/shared/tailwind-preset.js`              | Shared Tailwind theme (colors, keyframes)          |
| `src/store.ts`                                | Rx pad state + `useApp` hook                      |
| `src/safety.ts`                               | Allergy / interaction / duplicate checks          |
| `src/search.ts`                               | Fuzzy search + brand → generic matching           |
| `src/print.ts`                                | Render `#print-area` for browser print dialog     |
| `apps/admin/src/pages/*`                      | Admin console pages (dashboard, hospitals, audit)  |
| `apps/doctor-portal/src/pages/*`              | Portal pages (login, dashboard, patients, …)       |
| `scripts/dev.mjs`                             | Dev orchestrator + subdomain gateway              |
| `deploy/nginx.swiftrx.com.conf`               | Example production routing                        |
| `deploy/DNS.md`                               | DNS / hosts-file setup instructions                |
