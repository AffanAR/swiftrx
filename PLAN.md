# SwiftRx — Code Review & Re-plan

Reviewed 2026-10-22. Covers all source in `src/` (Rx pad), `apps/shared`,
`apps/doctor-portal`, `apps/admin`, `scripts/` and `deploy/`. Backend
readiness re-checked 2026-10-30 (§2.7).

The plan for the whole project (milestones, dates, decisions, risks and
budget) is in [`ROADMAP.md`](ROADMAP.md). This file keeps the review
findings and the engineering checklist for each phase.

**How findings were checked:** `tsc --noEmit` passes for all three apps. A
fresh portal build (to a temp folder) was used to confirm the Tailwind and
React findings. Everything else was traced through the code and confirmed
with searches. Nothing was clicked through in a browser.

---

## 1. Where the project is today

SwiftRx is a **polished UI prototype**: three Vite + React SPAs (admin,
doctor portal, Rx pad) over a shared TypeScript package. **There is no
backend.** The "database" (`apps/shared/src/mockDb.ts`) is a JS module, so
each browser tab gets its own in-memory copy. Login runs in the browser
against plaintext passwords that ship in the bundle.

Because of that, the core story (a doctor signs in, writes an Rx, and it
shows up for the hospital and the platform) can't work end to end yet.

**Worth keeping:**
- The keyboard-first Rx pad UX and its visual design.
- `apps/shared/src/types.ts`, a clean cross-app contract.
- The `mockDb.ts` helper functions (`listPatientsForHospital`,
  `appendSignedRx`, …), the right seam to swap for an API client.
- `resolveSurface()`, a pure function that's easy to test.
- The print template driven by a per-hospital `RxDesign`.
- Strict TypeScript everywhere.

---

## 2. Findings

> Paths below are as of the review. Since then the Rx pad has moved from
> root `src/` to `apps/doctor-portal/src/rx/` (Phase 1), and the bridge
> session (`src/session.ts`) is gone.

### 2.1 Broken core flows (P0)

| # | Problem | Where | Effect |
|---|---------|-------|--------|
| 1 | **Sign & Print prints nothing.** `window.__signedRxList` is read but never assigned anywhere. `sign()` clears the pad first, so `printCurrent()` falls back to `buildDraftRx()`, which then returns `null`. | `src/print.ts:8,250`, `src/store.ts:258-266` | The headline action signs but never prints (⌘S, ⌘↵ and the button). |
| 2 | **Portal login bounces back to the login page.** `useSession()` reads storage once on mount. `LoginPage` writes the session and navigates, but never updates hook state, so `/dashboard` redirects to `/`. | `apps/doctor-portal/src/useSession.ts:24`, `pages/LoginPage.tsx:27` | Doctors have to hard-reload after signing in. (The admin app does this correctly with a `signIn` callback.) |
| 3 | **Rx pad Sign out doesn't lock the workspace.** `SessionGate` and `App` each call `useSession()` and hold separate state. | `src/components/SessionGate.tsx:17`, `src/App.tsx:16` | After sign-out the pad is still fully usable. |
| 4 | **New-patient modal never closes after Create.** Neither `createPatient()` nor `submit()` resets `showNewPatient`. | `src/store.ts:149`, `src/components/NewPatientModal.tsx:78` | A second click creates a duplicate patient. |
| 5 | **⌘/Ctrl+Enter in the new-patient modal runs Sign & Print.** The modal advertises ⌘↵ as Save, but the global hotkey wins. | `src/App.tsx:100`, `NewPatientModal.tsx:106` | Wrong action fires. |
| 6 | **Shared-component styles are missing in portal and admin.** Their Tailwind `content` only scans their own `src/`. A fresh build lacks `translate-x-4`, `pr-10`, `right-2` and `resize-y`. | `apps/*/tailwind.config.js:6` | Toggle knobs don't slide. The password Show/Hide button is mispositioned. |
| 7 | **Ctrl+1/2/3 (quick packs) and Ctrl+N (new patient) don't work in Chrome on Windows/Linux.** The browser reserves them for tab switching and new windows. | `src/App.tsx:93-143` | Part of the keyboard contract fails on Windows. |
| 8 | **Data never flows between apps.** Each SPA mutates its own in-memory arrays. Admin feature edits go to the admin origin's `localStorage` only. | `apps/shared/src/mockDb.ts:605-628` | A patient added in the portal never reaches the Rx pad. Signed Rx never reach the portal or admin. |

### 2.2 Clinical safety (must fix before any real patient)

- **Critical alerts don't block signing.** An allergy-contraindicated drug
  can be signed in one keystroke. Example: Bilal Ahmed (penicillin allergy)
  plus J02.9 Quick Pack #1, which contains Amoxicillin. `src/store.ts:229`
- ~~**The duplicate-therapy check never fires.**~~ Fixed 2026-10-31 with the
  Bangladesh medicine list: it now matches the same generic by name
  ("Amlodipine" = Amlodipine Besilate) and other generics by drug class.
  Classes come from the dataset and are uneven (statins are filed under
  "Other Anti-anginal & Anti-ischaemic drugs"), so it still needs the Phase 3
  drug model.
- **Interactions are only checked against the patient's existing meds,** not
  between drugs on the same Rx. Ibuprofen + Lisinopril on one pad gives no
  alert. `src/safety.ts:51`
- **There are no dose checks** (weight, age or daily maximum). Example: J02.9
  Quick Pack #1 gives Paracetamol 500 mg QID (2 g/day). For Ayan Khan (6 y,
  21 kg) that's about 95 mg/kg/day, above common paediatric ceilings. Nothing
  warns. *Any dose rules must be reviewed by a clinician.*
- **The dose field turns an empty value into 0,** and 0 mg or 0 days is
  accepted. `src/components/MedicationRow.tsx:158`
- **"No allergies" shows for patients whose allergies were never recorded.**
  The portal's add-patient form has no allergy field.
  `apps/doctor-portal/src/pages/PatientsPage.tsx:45`
- **Non-doctors can prescribe.** Hospital admins get an Rx bridge session with
  an empty license, and the dashboard offers to "prescribe as any doctor".
  `apps/doctor-portal/src/auth.ts:50`, `pages/DashboardPage.tsx:196`.
  Without a session the store falls back to a hard-coded
  "Dr. Affan Ahmed / PMDC-78421". `src/store.ts:95`
- **"Send to Pharmacy" prints an unsigned draft** that still says "Verified
  digitally · signature hash". `src/components/CenterColumn.tsx:34`,
  `src/print.ts:203`
- **Esc (outside inputs) wipes the whole prescription,** with no confirm and
  no undo. `src/App.tsx:120`

### 2.3 Security and tenant isolation

Most of this comes from having no backend. Each item needs a server-side
fix, not a UI patch.

- **Plaintext passwords** for every user ship in every bundle.
  `apps/shared/src/mockDb.ts:148-219`
- **Sessions and the bridge token are unsigned base64 JSON.** Anyone can craft
  `?session=…` and sign Rx as any doctor at any hospital. The token also sits
  in the URL (history, logs, Referer). `apps/shared/src/auth.ts:77-97`,
  `src/session.ts:62`
- **A hospital with zero patients sees other hospitals' patients,** because
  bootstrap falls back to the global list. `src/store.ts:322-327`
- **The portal doesn't check that the signed-in user belongs to the URL's
  tenant.** On a single origin (dev `?hospital=`), switching tenants shows
  another hospital's roster. `apps/doctor-portal/src/useSession.ts`,
  `App.tsx:33`. (Fixed 2026-10-30: it also worked on real subdomains, since
  `?hospital=` overrode the host. Now the host wins over the query, and a
  session only counts on its own hospital's portal, `sessionBelongsTo()`.
  Checked in the browser. The server must still enforce this in Phase 2.)
- **A platform admin can sign in to any hospital portal**
  (`expectedRole: 'any'`). `apps/doctor-portal/src/auth.ts:43`
- **Suspended hospitals can still sign in.** Status is checked only on
  reload, and the Rx pad never checks status, caps or flags.
- **Feature flags and limits are configured but enforced nowhere:** brand
  search, quick packs, safety alerts, investigations, PDF export, max meds per
  Rx, max patients and monthly Rx cap.
- **Reserved slugs aren't blocked.** A hospital named "Admin" or "Rx"
  collides with the admin or Rx surfaces.
  `apps/admin/src/pages/NewHospitalPage.tsx:27`
- **Security toggles in the UI are wired to no-ops** ("Auto-expire sessions
  after 12h", "Require strong passwords"), and the UI also claims to be
  "HIPAA-aware". `apps/doctor-portal/src/pages/HospitalSettingsPage.tsx:40`,
  `apps/admin/src/pages/PlatformSettingsPage.tsx:17`

### 2.4 Smaller bugs

- `appendSignedRx` bumps the usage counter on a *copy* whenever admin
  overrides exist for that hospital. `apps/shared/src/mockDb.ts:591`
- Admin "Rx this month" double-counts (seed Rx plus `monthlyRxUsed`). Trends
  and login-page stats are hard-coded. `apps/admin/src/pages/DashboardPage.tsx:17,39-41`
- Audit entries for new hospitals use a hard-coded admin id instead of the
  session user. `NewHospitalPage.tsx:50`
- "Suspend" does nothing, and "Open portal" is hard-coded to
  `*.localhost:5172`. `HospitalDetailPage.tsx:51-54`
- A doctor's "My Rx" lists every doctor's prescriptions.
  `apps/doctor-portal/src/pages/PrescriptionsPage.tsx:6`
- "Invite doctor" does nothing. `DoctorsPage.tsx:23`
- In the new-patient modal, Enter only moves the highlight, not focus.
  `NewPatientModal.tsx:130`
- Portal add-patient rejects age 0 (infants). `PatientsPage.tsx:35`
- `RX_APP_URL` is a single build-time value, so it can't point each tenant at
  its own `<slug>.swiftrx.com/rx`. `apps/shared/src/config.ts:21`
- `*:focus { outline: none; }` in all three `index.html` files leaves buttons
  with no visible focus, in a keyboard-first app.
- The admin "live preview" is a separate JSX copy of the print template, so
  preview and real print can drift. `HospitalFeaturesPage.tsx:433`
- ~~The default-language list has no Urdu.~~ The market is Bangladesh now
  (ROADMAP.md D13), and since 2026-11-02 the list is English and Bangla.
- `useHotkeys` re-subscribes on every render (it gets a new array each time).

### 2.5 Structure and duplication

- **Not a git repository.** No `.gitignore`. `dist/` and `*.tsbuildinfo`
  sit in the tree.
- **Not npm workspaces.** The portal has its own `package-lock.json` and a
  full second `node_modules` (Vite's React dedupe hides the duplicate React at
  build time). Admin's `node_modules` is empty and relies on the root.
- The Rx pad lives in root `src/`, while the other apps are under `apps/`.
- **Duplicates:**
  - `src/components/Fx.tsx` ≈ `apps/shared/src/ui.tsx`
  - `LiveDot` ×3, `Kbd` ×2, `cx` ×2
  - three near-identical CSS files
  - root `tailwind.config.js` ≈ shared preset
  - `src/session.ts` ≈ shared bridge helpers
  - `scripts/check-bridge.mjs` re-implements token encoding
  - `auditTitle`/`auditColor` ×3
- **Re-export shims that only add indirection:** `src/data.ts`,
  `src/types.ts`, `src/shared-bridge.ts`,
  `apps/doctor-portal/src/tenant.ts`,
  `apps/doctor-portal/src/components/LiveDot.tsx`.
- **No tests** (only ad-hoc scripts in `.puku/`), no linter, no CI.

### 2.6 Docs and deploy drift

- **nginx can't serve the Rx pad at `/rx/`.** The Rx build uses base `/`, so
  its `/assets/…` requests hit the portal. The `alias` + `try_files` fallback
  also lands on the portal's `index.html`. `deploy/nginx.swiftrx.com.conf:47-53`,
  `vite.config.ts`
- **`deploy/ONLINE.md` is out of date:**
  - `npm run dev` doesn't exist (line 44).
  - Demo passwords are wrong (lines 83-87 say `admin1234`/`dr1234`; the seed
    uses `demo1234`).
  - `SWIFTRX_*_URL` env vars aren't read by `scripts/dev.mjs`.
  - Path routing (`/city-hospital`) isn't implemented.
  - A `trycloudflare.com` host resolves to an "unknown" tenant.
- Free tunnels and free VMs are fine for a UI demo. They aren't for anything
  that holds patient data.

### 2.7 Backend readiness (reviewed 2026-10-30)

There is still no backend. `scripts/serve.mjs` (on GitHub `main`) only serves
the two builds as static files. Login, safety checks and signing all run in
the browser against `mockDb.ts`. What has to change, most important first:

- **Login protects nothing yet.** An in-progress change (not committed as of
  2026-10-30) stores bcrypt hashes instead of plaintext passwords, but the
  hashes still ship in the bundle at cost 8, so they can be cracked offline.
  The session is plain JSON in localStorage, and `readSessionFromStorage()`
  in `apps/shared/src/auth.ts` only checks that the user id exists. Anyone
  can paste a doctor's session in DevTools and sign as that doctor.
  (`bcryptjs` is also listed as a devDependency but ships in the browser
  bundle.)
- **A signed Rx can't be trusted:**
  - The id is `'rx_' + Date.now().toString(36)`
    (`apps/doctor-portal/src/rx/store.ts:298`), so two signings in the same
    millisecond get the same id.
  - The printed "signature hash" is a 32-bit hash of the id only
    (`shortHash()` in `apps/shared/src/print.ts`). Editing the medications
    doesn't change it, yet the print says "Verified digitally".
  - The safety checks, the override reason and the license check run only
    in the browser.
- **The API seam is wider than the docs say.** 11 files read the `MOCK_*`
  arrays directly instead of going through the helpers:
  - admin: `AuditLogPage`, `DashboardPage`, `HospitalsListPage`,
    `NewHospitalPage`;
  - portal: `PatientsPage`;
  - Rx pad: `RxPad`, `store.ts`, `DiagnosisField`, `MedicationRow`,
    `MedicationSearch`, `RightColumn`.

  Every helper is synchronous and an API is not, so each call site needs
  loading and error states. That is most of the frontend cost of Phase 2.
  (Fixed 2026-10-30 by the async data client, Phase 2's first item. The real
  count was 20 files: helper calls had to move as well as the `MOCK_*` reads.)
- **Data-model gaps to settle before the schema:**
  - A prescription keeps `patient_id` *and* a frozen copy of the patient as
    signed (name, age, weight, allergies). Storing only a reference, as the
    seed JSON does, suits seed data but not a legal record.
  - Users have one `hospitalSlug`. Use `memberships` (a role per hospital).
  - Allergies need three states: none known, not recorded, recorded.
  - Admin overrides live in localStorage. They belong in
    `hospital_settings`.
- **Hosting:**
  - Serve the API on the same origin under `/api`, so cookies stay
    same-site and no CORS is needed. `serve.mjs` can grow into the API
    server.
  - `serve.mjs` sends no Content-Security-Policy (the print page is built
    from strings) and no HSTS (or set HSTS at Cloudflare).
  - Render's free plan sleeps when idle and has no persistent disk, so the
    database has to be a managed Postgres.
  - Hosting region and data residency are still open (§4, item 5).

---

## 3. Re-plan

### 3.1 Architecture decisions (recommended)

1. **Merge the Rx pad into the doctor portal** as a lazy-loaded `/rx` route.
   Same origin and same session removes: the bridge token, `src/session.ts`,
   `scripts/check-bridge.mjs`, the nginx `/rx` alias, the per-tenant
   `RX_APP_URL` problem, and the gateway's `/rx` rule. Keep **admin** as its
   own app, since it's a different security boundary.
2. **Add a real backend:** a TypeScript API (Hono) with PostgreSQL and
   Drizzle. (Decided 2026-10-30; the reasons are under Phase 2.)
   - Every tenant table carries `hospital_id`.
   - The server derives the tenant from Host + session, never from the client.
   - Postgres row-level security is a second fence.
3. **Server-side auth:**
   - Sessions in `httpOnly`, `Secure`, `SameSite=Lax` cookies.
   - Argon2id password hashes.
   - Server-enforced expiry.
   - TOTP for platform admins.
4. **Keep `types.ts` as the contract.** Add zod schemas in `apps/shared` so
   the API and UI validate the same shapes. The `mockDb` helper names become
   the API client, so components barely change.
5. **Signing becomes a server operation.** The server:
   - assigns the id and timestamp;
   - snapshots patient and `RxDesign`;
   - stores an immutable record plus hash;
   - enforces role = doctor, license, caps, flags and safety-override reasons.

### 3.2 Phases

Durations are rough, for one developer.

#### Phase 0: Stabilize the prototype (≈2–3 days)

Goal: the demo works end to end in one browser, and the repo is safe to
iterate on.

- [x] `git init`, add `.gitignore` (`node_modules`, `dist`, `*.tsbuildinfo`,
      `.puku/`), first commit.
- [x] Convert to npm workspaces (done 2026-10-22). Delete the portal's own lockfile and
      `node_modules`. One install at the root.
- [x] Fix P0 #1–#7 (done 2026-10-22; checked in the browser):
  - print the just-signed Rx;
  - portal login updates session state;
  - one session source in the Rx pad;
  - modal closes after Create;
  - modal ⌘↵ saves instead of signing;
  - Tailwind `content` includes `../shared/src/**/*.{ts,tsx}`;
  - remap hotkeys to Alt+1/2/3 and Alt+N.
- [x] Interim safety (done 2026-10-22; checked in the browser):
  - block signing on critical alerts unless a reason is entered;
  - reject dose ≤ 0;
  - print a "DRAFT — NOT VALID" watermark on unsigned prints;
  - bridge only for `doctor` users with a license;
  - remove the hard-coded doctor fallback and the cross-tenant patient
    fallback.
- [x] Restore visible focus rings (done 2026-10-22).
- [x] Fix README / `deploy/ONLINE.md` drift (done 2026-10-22). The docs now
      say `/rx` routing (gateway and nginx) doesn't work yet; Phase 1's move
      of the Rx pad into the portal removes it.

**Exit:** sign in → open Rx → add meds → sign → the signed Rx prints. No
console errors.

#### Phase 1: Consolidate the frontend (≈1 week)

- [x] Move the Rx pad to `apps/doctor-portal/src/rx/` and route `/rx` with
      `React.lazy`. Delete the bridge, `session.ts`, `check-bridge.mjs`, the
      gateway `/rx` rule and the nginx alias. (Done 2026-10-22; checked in the
      browser. The pad now shares the portal's session and in-memory data.)
- [x] Remove the duplicates and shims from §2.5. Use one CSS file plus the
      shared Tailwind preset. (Done 2026-10-22: Rx code imports UI primitives
      and data straight from `@swiftrx/shared`; both apps load
      `apps/shared/src/shared.css`; admin audit helpers live in
      `apps/admin/src/audit.ts`. Checked in the browser.)
- [x] Move the print template into `apps/shared` (`renderRxHtml`) and use it
      for both real print and the admin preview. (Done 2026-10-22: output
      identical to the old template for all seeded Rx × designs × draft;
      the accent color is now validated; the preview draws the true-size
      page scaled to fit. Checked in the browser.)
- [x] Vitest unit tests for `safety.ts`, `search.ts`, `resolveSurface`, the
      print renderer and store actions. (Done 2026-10-22: 55 tests. Two
      `it.fails` tests track the §2.2 safety gaps. The tests found that
      `127.0.0.1` resolved to a hospital named "127", now fixed.)
- [x] ESLint and Prettier, plus GitHub Actions for typecheck, test and build
      on every push. (Done 2026-10-22: `.github/workflows/ci.yml`; the same
      steps run locally with `npm run check`. The repo has been on GitHub,
      `AffanAR/swiftrx` branch `main`, since 2026-10-22.)

**Exit:** two apps (admin; portal + Rx), CI green, and pure logic covered by
tests. (Met locally. The CI result on GitHub hasn't been checked here.)

#### Phase 2: Backend MVP (≈3–4 weeks)

Findings are in §2.7. Stack: a TypeScript API in `apps/api` (Hono,
Postgres, Drizzle), with zod schemas in `apps/shared`. It was chosen
2026-10-30; the reasons are under the `apps/api` skeleton item below. Prefer it over Supabase (§4, item 2): signing and the safety
rules have to run on the server, in the TypeScript that already exists.
(GitHub `main` was merged into local `master` on 2026-10-30.)

In this order:

- [x] **Async data client, no server yet.** An async client in `apps/shared`
      backed by `mockDb`. Move the 11 files from §2.7 onto it with TanStack
      Query, and add loading/error states and error boundaries. After this,
      switching to HTTP touches one file. (Done 2026-10-30, checked in the
      browser:
  - `api.ts` is the client. Each method is async, returns copies, notes its
    future endpoint, never returns password hashes, and assigns ids,
    timestamps and the audit row on writes.
  - `queries.ts` holds the TanStack Query hooks; pages suspend, and
    `PageBoundary` / `AppCrashBoundary` (`status.tsx`) show loading, error and
    crash states.
  - All 20 data-touching files moved, including the Rx store: `sign()` and
    `createPatient()` are async, with a double-submit guard and an error banner.
  - ESLint now rejects mock-db imports in app code.
  - `VITE_MOCK_LATENCY_MS` adds a delay to see the loading states.
  - Side fixes: the new-hospital audit row uses the signed-in admin instead
    of a hard-coded id (§2.4), and Rx ids get a random tail, so two signs in
    the same millisecond almost never share one (§2.7).
  - Sign-in still goes through `auth.ts`, which the auth step replaces.)
- [x] **`apps/api` skeleton:** Postgres in Docker for local dev, migrations,
      and a seed script that loads `apps/shared/src/seed/*.json`. Tables:
  - `hospitals`, `users`, `memberships` (role per hospital), `patients`
  - `patient_allergies` (status: *none known* / *not recorded* / *recorded*)
  - `prescriptions` (with a frozen patient copy), `prescription_items`,
    `investigations`
  - `audit_events` (append-only)
  - `drugs`, `diagnoses`, `quick_packs`, `hospital_settings`

  (Done 2026-10-30.) The stack, and why:
  - **Hono** (on `@hono/node-server`), not Fastify. Its handlers take and
    return Web `Request`/`Response`, so tests call `app.request()` with no
    socket, and the app can later be mounted under `/api` in `serve.mjs`. It
    pulls in very few dependencies, which matters while strict `npm ci` breaks
    on peer conflicts.
  - **Drizzle**, not Prisma. The schema is TypeScript, and migrations are
    plain SQL files to review and hand-edit (the audit trigger, and RLS later).
    There is no codegen step before `tsc`, and it runs on PGlite as well as
    Postgres.
  - **zod 4** in `apps/shared/src/schemas.ts`, with a compile-time check that
    each schema matches its type in `types.ts`. The seed validates against it
    today; the API will check requests with it.
  - **PGlite** (Postgres 17 compiled to WebAssembly) when `DATABASE_URL` is
    unset. This machine has no Docker (virtualization is off in the BIOS), so
    `npm run db:setup` works without installing anything, and the tests run in
    memory with no database server. `compose.yaml` and `npm run db:up` give a
    real Postgres where Docker exists. The CI job "Postgres (Docker)" runs that
    path, then the API tests again against the real server, which covers what
    PGlite can't (it allows one connection and is its own build). It can't
    run on this machine. Its first version (setup and health route) passed on
    GitHub on 2026-10-30, and the full job, with the API tests, passed in
    run #8.

  What was built:
  - **Server.** `apps/api` serves `GET /api/health` (503 when the database
    doesn't answer). Unknown routes and errors get a JSON 404 or 500 with no
    details.
  - **Migrations.** `0000_init` creates 15 tables; `0001` adds a trigger that
    rejects UPDATE, DELETE and TRUNCATE on `audit_events`.
  - **Seed.** It validates the JSON with zod, then writes it in one
    transaction, and only into an empty database.
  - **Tests.** 27 new tests cover the seed (counts, memberships, allergy status,
    frozen Rx, append-only audit, cross-tenant refusal, rollback on bad data),
    the health route and the shared schemas.

  Decisions the next steps inherit:
  - **Tenancy.** Every tenant table has `hospital_id`. Child rows reference
    their parent by `(id, hospital_id)`, so the database itself refuses a
    prescription for another hospital's patient. The catalog tables and
    `users` are not tenant tables; users join hospitals through `memberships`.
    Platform admins are `users.is_platform_admin` and have no membership.
  - **Allergies.** The three-way status is `patients.allergy_status`, since
    "none known" and "not recorded" have no allergy rows to hang it on.
    `patient_allergies` has one row per recorded allergy. Seed patients with
    `allergies: []` are *not recorded*, the safe guess. `types.ts` doesn't
    carry the status yet; the read endpoints need to add it.
  - **Investigations.** `investigations` is the catalog. The tests ordered on
    an Rx go in `prescription_investigations`, mirroring
    `drugs`/`prescription_items`. A diagnosis's suggested tests are in
    `diagnosis_investigations`.
  - **Prescriptions.** Each one freezes the patient, the diagnosis, the
    hospital's `RxDesign`, and the doctor's name and license as signed.
    Prescriptions are not append-only yet; `POST /prescriptions` should make
    them so, like `audit_events`.
  - **Usage.** `monthlyRxUsed` isn't stored. It should be counted from
    `prescriptions` for the current month, which makes the seed's demo figures
    (1247, 412, 31) disappear.
  - **Patient age.** Patients still store an age, because the contract has no
    date of birth, and an age goes stale. Switch to `date_of_birth` before
    real patients.
  - **Not done.** There is no row-level security yet; that belongs to the
    server-side tenant-scoping item. The API isn't deployed: Render still runs
    only `serve.mjs`.
  - **npm quirk.** npm leaves `drizzle-orm` in `apps/api/node_modules`, where
    the hoisted `drizzle-kit` can't load it, so it's also a root
    devDependency. Keep the two version ranges the same
    (`apps/api/drizzle.config.ts`).
- [x] **Auth:** `/auth/login`, `/auth/logout` and `/auth/me` with `httpOnly`,
      `Secure`, `SameSite=Lax` cookie sessions, Argon2id hashes on the
      server, and the tenant taken from Host on the server. Then login
      rate-limiting, password reset and a real invite flow (makes "Invite
      doctor" work). No hashes or passwords left in any bundle. (Sign-in done
      2026-10-31 and live on the demo the same day; invitations, reset links,
      ended sessions and the server's audit log followed on 2026-10-31. Checked
      in the browser. Self-service "forgot password" waits for an email
      sender, below.)

  What was built (`apps/api/src/auth/`):
  - **Routes.** `POST /api/auth/login`, `POST /api/auth/logout`,
    `GET /api/auth/me` (the session, or `null`), and
    `GET /api/auth/demo-accounts`, which lists the sign-in page's demo
    accounts in demo mode only. The demo passwords left the bundles that way.
  - **Sessions** live in a new `sessions` table (migration `0002`). The
    cookie holds 256 random bits; the table keeps only their SHA-256. They
    last 12 hours from sign-in, and the server checks every request: the
    session exists and hasn't expired, it was made for this host's surface,
    and the user is active and still holds a role there (a suspended hospital
    ends it). Signing in again replaces the browser's old session.
  - **Tenant.** The server runs `resolveSurface()` on the Host header. A
    hospital's session only counts at that hospital; platform admins sign in
    only at the admin host and have no portal session. `?hospital=` counts
    only where the host names no subdomain (plain localhost), as in the apps.
  - **Passwords.** Argon2id (`@node-rs/argon2`: prebuilt per platform, no
    install script, hashes off the event loop) at OWASP's minimum (19 MiB,
    t=2, p=1), upgraded at sign-in when the parameters change. The seed's
    bcrypt hashes were replaced: `users.json` holds no credentials, and the
    seed hashes the demo passwords in `apps/api/src/db/demo-passwords.json`.
    An unknown email still costs one Argon2 run, so timing shows nothing.
  - **Rate limits,** in memory: 20 failed sign-ins per address and 10 per
    email in 15 minutes; refused before any hashing. Counts would need a
    shared store with more than one instance. The address comes from
    `CF-Connecting-IP` behind Render (its edge is Cloudflare), otherwise the
    last `X-Forwarded-For` entry; not yet checked on the live service.
  - **Writes** must come from the same origin (`Origin`, else
    `Sec-Fetch-Site`) and be JSON, which also stops login CSRF from another
    hospital's subdomain, which counts as the same site.
  - **Apps.** `apps/shared/src/auth.ts` is now the client for these routes.
    The portal keeps `SessionPayload` (plus `expiresAt`); `/me` adds the
    user's memberships at that hospital, and `canPrescribe()` admits only
    active users with a license and a doctor membership there (D3). `User`
    lost `passwordHash`, and `bcryptjs` is gone. `npm run check:bundles`
    (in `npm run check` and CI) fails the build if a hash, a demo password
    or bcrypt reaches a bundle.
  - **Same origin everywhere.** The gateway and both Vite servers pass `/api`
    to the API with the Host header untouched (`dev:all` starts the API too,
    after `db:setup`). `scripts/serve.mjs` hands `/api` to the API before its
    SPA fallback, so an unknown `/api` path is a JSON 404, not `index.html`.

  Decisions:
  - **Host-only cookies, not `Domain=.swiftrx.com`.** A cookie scoped to the
    parent domain goes to every hospital's subdomain and the admin panel,
    and any of them could overwrite it. Host-only, a hospital's cookie never
    leaves its subdomain, and over HTTPS the `__Host-` prefix stops a sibling
    subdomain from setting or shadowing it. Nothing needs a shared cookie:
    the Rx pad is a route of the portal. The admin panel and the portals use
    different cookie names, so on dev's shared `localhost` both stay signed
    in. `Secure` is set when the request came over HTTPS (Render and
    Cloudflare say so in `X-Forwarded-Proto`) and always with
    `NODE_ENV=production`.
  - **The demo's database** is PGlite in memory inside the web service.
    `npm run build` writes a migrated, seeded snapshot
    (`apps/api/dist/demo-db.tgz`) that the server starts from, and `npm
    start` runs Node with `--liftoff-only`. Measured peaks while the API
    starts (Windows working set): 398 MB this way, 931 MB without the flag
    (V8's optimizing compiler on PGlite's WebAssembly), 748 MB building the
    database at boot. Render's free instance has 512 MB. PGlite also runs
    with small Postgres buffers. Everything, sessions included, resets when
    the instance restarts or sleeps.

  Added after the first deploy (same day):
  - **Invitations and reset links** (`apps/api/src/auth/invites.ts`,
    migration `0003`). A hospital admin invites a doctor from the Doctors
    page, which creates an `invited` account with a doctor membership and a
    link; the admin also makes a new link for any of the hospital's users.
    Tokens are 256 random bits, kept as SHA-256 in `user_tokens`, single
    use, 7 days for an invitation and 24 hours for a reset, and good only at
    their hospital. The link carries the token after `#`, so it never
    reaches a server log or a Referer. `/set-password` sets the password,
    activates an invited account and ends the user's other sessions and
    links. There's no email sender yet, so the admin copies the link and
    sends it, which is also why there's no self-service "forgot password".
  - **First read endpoints:** `GET /api/hospitals/:slug/doctors` (invited
    doctors appear on the roster) and the audit log
    (`GET /api/audit-events`, `GET /api/hospitals/:slug/audit-events`),
    with 401 and 403 by role. The admin's audit log shows the server's
    events plus what the browser's mock wrote in that tab.
  - **Ended sessions.** A 401 from any API call, or the session's expiry
    time, sends the app to sign-in with "Your session ended", and sign-in
    returns to the page they were on. The Rx pad keeps its unsigned draft
    when the same doctor signs back in.
  - On plain localhost the portal keeps `?hospital=` in the URL, so a
    reload stays at the same hospital; `db:setup` re-hashes demo accounts a
    pre-Argon2 dev database left with bcrypt; `serve.mjs` logs its memory
    after start-up and at each new peak, for Render's 512 MB.

  - **A new hospital's first admin** (2026-11-02). The platform admin invites
    a hospital admin from the hospital's page in the admin panel
    (`POST /api/auth/hospital-admin-invites`); the link opens on that
    hospital's portal. Inviting the same still-invited admin again makes a
    new link. Before this, a hospital created in the admin panel had no way
    in.

  Left:
  - An email sender, then self-service password reset and emailed
    invitations.
  - Two-factor sign-in for platform admins (Phase 4).
  - Rate-limit counts in Postgres once there is more than one instance, and
    a check on the live service of which address Render passes on.
  - Admin stats still count doctors from the mock db, so an invited doctor
    shows on the hospital's roster but not in the admin's totals until the
    users endpoint moves.
- [x] **Read endpoints** that mirror the `mockDb` helpers: hospital,
      patients, and the drug, diagnosis and quick-pack catalog. (Done
      2026-11-01, with the writes that go with them, so nothing created in
      the browser vanishes on reload. Checked in the browser.)
  - **Catalog:** `GET /api/catalog` (2026-10-31, with the Bangladesh medicine
    list), sent compressed and built once per process.
  - **Hospitals** (`apps/api/src/hospitals.ts`): `GET /api/hospitals` and
    `POST /api/hospitals` for the platform admin; `GET /api/hospitals/:slug`
    for the admin or the hospital's users; `PATCH /api/hospitals/:slug` for
    features and the Rx design, platform admin only (D12). A public
    `GET /api/hospitals/:slug/profile` (name, city, plan) is what a portal's
    sign-in page reads; the full record waits for a session. New hospitals
    refuse the reserved subdomains `admin`, `www` and `api`.
  - **`monthlyRxUsed`** is counted from `prescriptions` signed since the
    start of the month in Bangladesh time (UTC+6). The seed's demo figures
    (1247, 412, 31) are gone, and until `POST /prescriptions` lands the
    count only sees seeded prescriptions, so it reads 0.
  - **Patients:** `GET` and `POST /api/hospitals/:slug/patients`. Only the
    hospital's own users add patients; the server assigns the id and writes
    the audit row in the same transaction.
  - **Allergy status** reached the contract: `Patient.allergyStatus` is
    `recorded`, `none_known` or `not_recorded`, and the schema refuses
    allergies that contradict it. The pad's new-patient form has a "No known
    allergies" box; the pad and the roster say "not recorded" instead of
    "no allergies" when nobody asked.
  - The client sends no actor any more for these writes: the server takes it
    from the session. The admin's localStorage overrides are gone.
  - Still from the browser's mock: the account list (`GET /users`, which the
    admin's doctor counts use) and prescriptions. A settings change isn't
    audited yet (no audit kind for it).
- [ ] **`POST /prescriptions`:** the server
  - assigns the id and timestamp;
  - re-runs `safety.ts` (pure, so it runs unchanged) and enforces role,
    license and the override reason;
  - freezes the patient and `RxDesign`;
  - stores a SHA-256 of the record, which the print shows instead of
    `shortHash(id)`;
  - writes the audit row in the same transaction.
- [ ] Server-side enforcement: tenant scoping, caps, flags, suspended status
      and reserved slugs.
- [x] Hosting: the API under `/api` on the same origin, CSP and HSTS headers,
      and a managed Postgres for the hosted demo. (The API under `/api` was
      done with the auth step, and the demo runs PGlite in memory instead of
      a managed Postgres, see above. CSP and HSTS were added 2026-11-03,
      checked in the browser: no violations on sign-in, the Rx pad, brand
      search, the theme switch, printing or the admin's Rx design preview.)
  - `apps/api/src/securityHeaders.ts` holds them for `serve.mjs` and the API
    alike: HSTS for a year with subdomains (no `preload`),
    `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` (not
    `no-referrer`, which makes browsers send `Origin: null` on the apps' own
    POSTs), `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
  - The pages' CSP allows the build's own files, the inline theme script by
    its SHA-256 (read from the built `index.html` at start-up), Google Fonts
    and inline styles (the print template needs them), and fetches to this
    origin only. Everything else, the API's JSON included, gets
    `default-src 'none'`.
  - `npm run check:headers` (in `npm run check` and CI) starts the
    production server and checks what it actually sends.
- [ ] Playwright e2e:
  - sign in → Rx → sign → visible in the portal and the admin audit log;
  - cross-tenant access is refused.

**Exit:** data persists and flows across apps. No secrets in any bundle. Only
the server creates a signed Rx.

#### Phase 3: Clinical safety v2 (≈2–3 weeks, plus clinician review)

- [ ] Drug model: ATC class, route, strengths/forms, and dose rules (mg/kg/day
      range, max daily dose, age bands).
- [ ] Checks:
  - allergy, including cross-sensitivity groups;
  - drug–drug interactions across the pad *and* active meds;
  - same-ingredient and same-class duplicates;
  - weight/age dose range;
  - pregnancy and renal flags.
- [ ] Override workflow with a mandatory reason, stored on the Rx and in the
      audit log.
- [ ] Catalog source: DGDA-registered brands plus an interaction dataset
      (a licensing decision; see §4). Until then the demo uses the Kaggle
      "Assorted Medicine Dataset of Bangladesh" (scraped from MedEx, about
      2022, licence unconfirmed), imported by `scripts/bd-medicines/import.mjs`:
      21,712 brands and 1,661 generics. Only the 12 generics in
      `scripts/bd-medicines/reviewed.json` have dose defaults and safety lists;
      the pad marks the rest "no safety data".
- [ ] Paediatric quick packs, and quick packs configurable per hospital.
- [ ] A clinician signs off on all rules before any pilot.

#### Phase 4: Pilot readiness (≈2–3 weeks)

- [ ] Server-rendered PDF, plus a verification page and QR code per Rx (City
      Hospital's footer already promises a verify URL).
- [ ] BMDC registration check for doctors (Bangladesh, ROADMAP.md D13; the
      seed uses BMDC-style numbers, "BMDC A-44121", since 2026-11-02).
- [ ] Bangla patient instructions. `languageSchema` is already English and
      Bangla (`en`, `bn`), stored per hospital but not used by the print;
      Bangla prints left to right, but needs a font with Bengali script.
- [ ] Hosting with backups, monitoring (e.g. Sentry) and logs that contain no
      patient data. (A public demo with no patient data is set up instead for
      now: Render + Cloudflare at `thesyndicate.bond`, `scripts/serve.mjs`,
      demo banner and DEMO print stamp. 2026-10-22; see `deploy/ONLINE.md`.)
- [ ] Security review, privacy policy, data-retention rules and a
      data-processing agreement with hospitals.
- [ ] Pilot with one hospital.

#### Phase 5 and later

[`ROADMAP.md`](ROADMAP.md) splits these: billing and real admin analytics
go in Phase 5 (paid launch), the rest in Phase 6 (growth).

- Real pharmacy routing (a true "Send to Pharmacy").
- FHIR/HL7 export.
- Billing (confirm your payment provider supports your business's country
  first).
- Real admin analytics and trends.
- Quick packs ranked from real prescribing data.

---

## 4. Decisions needed

[`ROADMAP.md`](ROADMAP.md) §7 tracks these and later decisions, each with a
date to decide by. Items 1, 2 and 3 have been decided since.

1. **Merge the Rx pad into the portal?** Recommended: yes (§3.1-1).
2. **Backend:** a custom Node API + Postgres (more control; recommended) or
   Supabase (faster; RLS and auth built in)?
3. **Can hospital admins prescribe?** Recommended: no, unless they also hold
   a doctor membership with a verified license. (Decided 2026-10-31: no,
   doctors only.)
4. **Drug and interaction data:** which source, and what budget for licensing?
5. **Hosting region and data residency** required by your target hospitals.
