# SwiftRx

Keyboard-first, ultra-low-latency digital prescription pad for clinicians. The
workspace is **two** apps that run out of one repo and share a single source
of truth. The Rx pad is a route inside the doctor portal:

| App              | Surface                          | Planned production host   |
| ---------------- | -------------------------------- | ------------------------- |
| **Admin panel**  | Platform admin (tenants, users,  | `admin.swiftrx.com`       |
|                  | usage, audit log)                |                           |
| **Doctor portal**| Tenant-scoped doctor + admin     | `<slug>.swiftrx.com`      |
|                  | sign-in, patient roster, Rx log  |                           |
| ↳ **Rx pad**     | Keyboard-first prescription pad, | `<slug>.swiftrx.com/rx`   |
|                  | the portal's `/rx` route         |                           |

`swiftrx.com` stands for the root domain, set at build time with
`VITE_ROOT_DOMAIN`. The hosted demo uses `thesyndicate.bond`; see
[`deploy/ONLINE.md`](deploy/ONLINE.md).

Both apps are SPAs built with **Vite + React 18 + TypeScript** and styled with
a custom **Tailwind CSS** design system. They share data, types, auth
primitives and UI primitives via the local `@swiftrx/shared` package. The Rx
pad is lazy-loaded, so its code only downloads when a doctor opens `/rx`.

## Run it

```bash
# One install at the root covers every app (npm workspaces):
npm install

# First-time setup: checks Node, installs, then runs every CI check:
npm run setup

# Run the whole system (admin + portal + dev gateway on :5172):
npm run dev:all

# Or run a single app:
npm run dev:portal      # Hospital portal (incl. the Rx pad) on http://localhost:5174
npm run dev:admin       # Admin panel on http://localhost:5175
npm run dev:gateway     # Only the dev gateway on http://localhost:5172

# Slow every mock-data reply down (ms), to see the loading states:
VITE_MOCK_LATENCY_MS=800 npm run dev:portal

# Build both apps, then serve them on :8080 like production does:
npm run build
npm start

# Checks — the same steps CI runs (.github/workflows/ci.yml):
npm run check           # format, lint, type check, tests w/ coverage, build
npm test                # unit tests only (npm run test:watch re-runs on save)
npm run test:coverage   # unit tests + a coverage report in coverage/
npm run lint            # ESLint
npm run format          # rewrite files in Prettier style
```

A pre-commit hook (husky + lint-staged) formats and lints staged files, so
`npm run check` should already be clean when you commit.

### API and database (work in progress)

`apps/api` is the backend that will replace the mock data: a Hono server
with PostgreSQL through Drizzle. So far it has the schema, migrations, a seed
and a health route. The apps don't call it yet; they still read the mock db
through `apps/shared/src/api.ts`.

One command creates the database, applies the migrations and loads the demo
data from `apps/shared/src/seed/*.json`. Pick the line for your machine:

```bash
# No Docker needed: PGlite (Postgres compiled to WebAssembly) in apps/api/.pglite
npm run db:setup

# With Docker: Postgres 17 from compose.yaml on 127.0.0.1:5432
npm run db:up
```

Then start the API on `http://127.0.0.1:5176` (`GET /api/health` answers
`{"status":"ok","database":"ok"}`):

```bash
npm run dev:api
```

The API uses `DATABASE_URL` when it is set, and PGlite otherwise. To run it
against the Docker database, copy `apps/api/.env.example` to `apps/api/.env`
and uncomment `DATABASE_URL`.

```bash
npm run db:setup        # migrate, then seed if the database is empty (safe to re-run)
npm run db:migrate      # apply new migrations only
npm run db:reset        # drop everything, migrate and seed again (local databases only)
npm run db:generate     # after editing apps/api/src/db/schema.ts: write a new migration
docker compose down -v  # stop the Docker database and delete its data
```

The seed only fills an empty database, so it never overwrites data. The tests
run the migrations and the seed on an in-memory PGlite, so `npm test` and CI
need no database server. A separate CI job runs the Docker path against a real
Postgres.

Unit tests (Vitest) sit next to the code they cover as `*.test.ts`: the Rx
pad's safety checks, search and store actions, the shared print template and
the tenant resolver. Two `it.fails` tests in `safety.test.ts` track known
safety gaps from `PLAN.md` §2.2; when a gap is fixed, Vitest reports the test
as unexpectedly passing so the marker can be removed.

### Try it with the dev gateway

After `npm run dev:all`, open:

- `http://admin.localhost:5172`            — admin login
- `http://city-hospital.localhost:5172`   — portal login for City Hospital
- `http://northstar-medical.localhost:5172` — portal login for Northstar
- `http://riverside-clinic.localhost:5172` — portal login for Riverside (no accounts yet)
- `http://city-hospital.localhost:5172/rx` — Rx pad (sign in as a doctor first)

Doctors also reach the Rx pad from **Start a new prescription** on their
dashboard or **Rx pad** in the top nav. Without the gateway, open the portal at
`http://localhost:5174/?hospital=city-hospital`.

Chrome and Firefox resolve `*.localhost` to `127.0.0.1` natively. Other
browsers may need a `/etc/hosts` entry — see `deploy/DNS.md`.

### Demo credentials

| Role            | Email                          | Password    | Sign in at          |
| --------------- | ------------------------------ | ----------- | ------------------- |
| Platform admin  | `admin@swiftrx.com`            | `admin1234` | Admin panel         |
| Hospital admin  | `admin@city-hospital.com`      | `demo1234`  | City Hospital       |
| Hospital admin  | `admin@northstar-medical.com`  | `demo1234`  | Northstar           |
| Doctor          | `ayesha@city-hospital.com`     | `demo1234`  | City Hospital       |
| Doctor          | `bilal@city-hospital.com`      | `demo1234`  | City Hospital       |
| Doctor          | `sana@northstar-medical.com`   | `demo1234`  | Northstar           |

Only doctors can open the Rx pad. Riverside Clinic has no accounts yet.

Passwords are stored as bcrypt hashes in `apps/shared/src/seed/users.json` and
checked by `verifyPassword()` in `apps/shared/src/auth.ts`, so no plaintext
credential is kept on the `User` type. The hashes still ship in the browser
bundle, so this is not real authentication yet (see `PLAN.md` §2.7).

## Repo layout

```
SwiftRX/
├─ apps/
│   ├─ shared/            # types, mock db, auth, tenant resolution, UI primitives
│   ├─ admin/             # platform console (port 5175)
│   ├─ doctor-portal/     # per-hospital portal (port 5174)
│   │   └─ src/rx/        #   the Rx pad, lazy-loaded at /rx
│   └─ api/               # Hono + Postgres API, not wired to the apps yet (port 5176)
│       └─ drizzle/       #   SQL migrations
├─ scripts/dev.mjs        # dev orchestrator + subdomain gateway (port 5172)
├─ scripts/serve.mjs      # production server: both builds, routed by host
├─ deploy/                # hosting guide, nginx config, DNS / hosts file docs
├─ compose.yaml           # local Postgres for the API (Docker)
├─ render.yaml            # Render Blueprint for the hosted demo
└─ package.json           # workspace root
```

`@swiftrx/shared` is consumed by each app via a Vite alias and a TypeScript
`paths` entry — there's no build step. The apps are npm workspaces
(`apps/*`), so there is one `package-lock.json` and one `node_modules` at
the root.
The apps read and write data through the data client in
`apps/shared/src/api.ts`, using the TanStack Query hooks in `queries.ts`.
Moving to a real backend means changing that one file (sign-in aside, see
below); see `docs/ARCHITECTURE.md`.

## Tenant model

Each hospital lives at its own subdomain. The dev gateway and, in production,
`scripts/serve.mjs` (or the example `deploy/nginx.swiftrx.com.conf`) do the
routing by host:

```
admin.swiftrx.com            → admin app
city-hospital.swiftrx.com    → doctor portal
city-hospital.swiftrx.com/rx → Rx pad (a portal route)
```

It can be hosted as a public demo (Render + Cloudflare); it isn't ready for
real patient data. [`deploy/ONLINE.md`](deploy/ONLINE.md) has the steps and
what has to happen first.

Inside the doctor portal, login is gated to the resolved tenant — a
doctor registered for `northstar-medical` cannot sign in at
`city-hospital`. A session also only counts on its own hospital's portal,
and `?hospital=` (for plain `localhost`) never overrides a hospital
subdomain. The Rx pad uses the portal's session, so there is no
separate Rx sign-in, and it only opens for active, licensed doctors of that
hospital. The signed-Rx payload carries the hospital slug so the portal and
admin panel stay isolated.

## Keyboard contract (Rx pad)

| Hotkey             | Action                                                  |
| ------------------ | ------------------------------------------------------- |
| `⌘/Ctrl + K`       | Jump focus to patient search                            |
| `Enter` (patient)  | Open the highlighted patient; focus moves to diagnosis  |
| `Esc` (patient)    | Clear the patient search                                |
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
| `⌘/Ctrl + P`       | Print a DRAFT of the current pad (not valid to dispense)|
| `Backspace`        | On empty input inside an open row → remove that row     |
| `Esc`              | Clear the workspace                                     |

Patient search matches a patient's name, contact or active problems. `↑ / ↓`
move the highlight and `Enter` opens that patient: the pad starts fresh for
them and focus moves to the diagnosis field. When nothing matches, the only
option is **Create**, and `Enter` opens the New Patient form.

Signing is refused when a dose or duration is 0, and when a critical alert
(an allergy) is on the pad until the doctor enters an override reason; the
reason is saved on the prescription and in the audit log. Only active doctors
with a license number can open the Rx pad.

Repeat fills an empty pad with the previous diagnosis, tests and medications.
If the pad already has content it keeps your diagnosis and only adds
medications that aren't on the pad yet.

Quick packs, New patient and Repeat use `Alt` because browsers reserve `Ctrl/⌘ + N`
(new window) and `Ctrl/⌘ + 1–8` (tab switching) and won't let a page take
them over. Firefox on Linux also uses `Alt + 1–8` for tabs.

## Production swap-ins

- **Database**: the data client, `apps/shared/src/api.ts`, is the seam. Each
  method answers from `mockDb.ts` today and is labelled with the HTTP endpoint
  it becomes, served by `apps/api` under `/api`. ESLint keeps app code off the
  mock db.
- **Auth**: replace the `login` function in `apps/shared/src/auth.ts` with
  a real API call. The portal's `SessionPayload` is the contract to keep;
  the Rx pad gets its doctor identity from that session.
- **Pharmacy / EHR**: `sign()` already returns a `SignedRx`. Wire it to a
  POST endpoint instead of `window.print()`.

## Files of note

| Path                                          | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `apps/shared/src/types.ts`                    | All cross-app types (Hospital, User, Patient, …)   |
| `apps/shared/src/api.ts`                      | The data client: every read and write goes through it |
| `apps/shared/src/queries.ts`                  | TanStack Query hooks and query keys over `api`     |
| `apps/shared/src/status.tsx`                  | Loading, error and crash screens (`PageBoundary`)  |
| `apps/shared/src/mockDb.ts`                   | The in-memory store `api.ts` answers from today    |
| `apps/shared/src/seed/*.json`                 | Seed data, loaded by `seedData.ts`                 |
| `apps/shared/src/schemas.ts`                  | zod schemas for `types.ts`, shared by the API and the apps |
| `apps/api/src/app.ts`                         | API routes (Hono), mounted under `/api`            |
| `apps/api/src/db/schema.ts`                   | The Postgres tables (Drizzle)                      |
| `apps/api/src/db/seed.ts`                     | Loads the seed JSON into an empty database         |
| `apps/api/drizzle/*.sql`                      | Migrations, generated from `schema.ts` (plus the audit-log trigger) |
| `apps/shared/src/auth.ts`                     | `login` + session storage helpers                  |
| `apps/shared/src/tenant.ts`                   | `resolveSurface()` — host / query → admin / hospital |
| `apps/shared/src/config.ts`                   | Build-time settings: `ROOT_DOMAIN`, `DEMO_MODE`    |
| `apps/shared/src/components.tsx`              | Reusable form + identity components                |
| `apps/shared/src/ui.tsx`                      | UI primitives (`cx`, `LiveDot`, `Kbd`, …) for every app |
| `apps/shared/src/shared.css`                  | The one stylesheet (Tailwind entry + `rx-*` classes) |
| `apps/shared/tailwind-preset.js`              | Shared Tailwind theme (colors, keyframes)          |
| `apps/doctor-portal/src/App.tsx`              | Portal routes, incl. the lazy `/rx` route          |
| `apps/doctor-portal/src/auth.ts`              | Portal session + `canPrescribe()`                  |
| `apps/doctor-portal/src/rx/RxPad.tsx`         | Rx pad entry (loads the doctor's workspace)        |
| `apps/doctor-portal/src/rx/store.ts`          | Rx pad state + `useApp` hook                       |
| `apps/doctor-portal/src/rx/safety.ts`         | Allergy / interaction / duplicate checks           |
| `apps/doctor-portal/src/rx/search.ts`         | Fuzzy search + brand → generic matching            |
| `apps/doctor-portal/src/rx/print.ts`          | Fill `#print-area` and open the browser print dialog |
| `apps/shared/src/print.ts`                    | `renderRxHtml()`, the one print template (Rx pad + admin preview) |
| `apps/admin/src/pages/*`                      | Admin console pages (dashboard, hospitals, audit)  |
| `apps/doctor-portal/src/pages/*`              | Portal pages (login, dashboard, patients, …)       |
| `scripts/dev.mjs`                             | Dev orchestrator + subdomain gateway               |
| `scripts/serve.mjs`                           | Production server (`npm start`), routes by host    |
| `render.yaml`                                 | Render Blueprint for the hosted demo               |
| `deploy/ONLINE.md`                            | Hosting the demo, and what it can't do             |
| `deploy/nginx.swiftrx.com.conf`               | Example production routing                         |
| `deploy/DNS.md`                               | DNS / hosts-file setup instructions                |
