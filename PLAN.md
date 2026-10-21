# SwiftRx — Code Review & Re-plan

Reviewed 2026-10-22. Covers all source in `src/` (Rx pad), `apps/shared`,
`apps/doctor-portal`, `apps/admin`, `scripts/` and `deploy/`.

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
- **The duplicate-therapy check never fires.** It compares the first word of
  the drug class ("Calcium", "Biguanide") with the patient's medication
  *names*. Prescribing Amlodipine to Bilal, who already takes Amlodipine,
  raises no alert. `src/safety.ts:86-87`
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
  `App.tsx:33`
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
- The default-language list has no Urdu, though every tenant is in Pakistan.
  `apps/shared/src/types.ts:35`
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

---

## 3. Re-plan

### 3.1 Architecture decisions (recommended)

1. **Merge the Rx pad into the doctor portal** as a lazy-loaded `/rx` route.
   Same origin and same session removes: the bridge token, `src/session.ts`,
   `scripts/check-bridge.mjs`, the nginx `/rx` alias, the per-tenant
   `RX_APP_URL` problem, and the gateway's `/rx` rule. Keep **admin** as its
   own app, since it's a different security boundary.
2. **Add a real backend:** a TypeScript API (Fastify or Hono) with
   PostgreSQL and Prisma.
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

- [ ] `git init`, add `.gitignore` (`node_modules`, `dist`, `*.tsbuildinfo`,
      `.puku/*.db*`), first commit.
- [ ] Convert to npm workspaces. Delete the portal's own lockfile and
      `node_modules`. One install at the root.
- [ ] Fix P0 #1–#7:
  - print the just-signed Rx;
  - portal login updates session state;
  - one session source in the Rx pad;
  - modal closes after Create;
  - modal ⌘↵ saves instead of signing;
  - Tailwind `content` includes `../shared/src/**/*.{ts,tsx}`;
  - remap hotkeys to Alt+1/2/3 and Alt+N.
- [ ] Interim safety:
  - block signing on critical alerts unless a reason is entered;
  - reject dose ≤ 0;
  - print a "DRAFT — NOT VALID" watermark on unsigned prints;
  - bridge only for `doctor` users with a license;
  - remove the hard-coded doctor fallback and the cross-tenant patient
    fallback.
- [ ] Restore visible focus rings.
- [ ] Fix README / `deploy/ONLINE.md` drift.

**Exit:** sign in → open Rx → add meds → sign → the signed Rx prints. No
console errors.

#### Phase 1: Consolidate the frontend (≈1 week)

- [ ] Move the Rx pad to `apps/doctor-portal/src/rx/` and route `/rx` with
      `React.lazy`. Delete the bridge, `session.ts`, `check-bridge.mjs`, the
      gateway `/rx` rule and the nginx alias.
- [ ] Remove the duplicates and shims from §2.5. Use one CSS file plus the
      shared Tailwind preset.
- [ ] Move the print template into `apps/shared` (`renderRxHtml`) and use it
      for both real print and the admin preview.
- [ ] Vitest unit tests for `safety.ts`, `search.ts`, `resolveSurface`, the
      print renderer and store actions.
- [ ] ESLint and Prettier, plus GitHub Actions for typecheck, test and build
      on every push.

**Exit:** two apps (admin; portal + Rx), CI green, and pure logic covered by
tests.

#### Phase 2: Backend MVP (≈3–4 weeks)

- [ ] `apps/api` (Fastify/Hono + Prisma + Postgres). Tables:
  - `hospitals`, `users`, `memberships` (role per hospital), `patients`
  - `patient_allergies` (status: *none known* / *not recorded* / *recorded*)
  - `prescriptions`, `prescription_items`, `investigations`
  - `audit_events` (append-only)
  - `drugs`, `diagnoses`, `quick_packs`, `hospital_settings`
- [ ] Endpoints that mirror the `mockDb` helpers, plus a seed script that
      ports the `MOCK_*` data.
- [ ] Cookie auth on `.swiftrx.com`, login rate-limiting, password reset, and
      a real invite flow (makes "Invite doctor" work).
- [ ] Server-side enforcement: tenant scoping, caps, flags, suspended status
      and reserved slugs.
- [ ] Frontend: swap `mockDb` imports for an API client (TanStack Query), and
      add loading/error states and error boundaries.
- [ ] Playwright e2e:
  - sign in → Rx → sign → visible in the portal and the admin audit log;
  - cross-tenant access is refused.

**Exit:** data persists and flows across apps. No secrets in any bundle.

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
- [ ] Catalog source: DRAP-registered brands plus an interaction dataset
      (a licensing decision; see §4).
- [ ] Paediatric quick packs, and quick packs configurable per hospital.
- [ ] A clinician signs off on all rules before any pilot.

#### Phase 4: Pilot readiness (≈2–3 weeks)

- [ ] Server-rendered PDF, plus a verification page and QR code per Rx (City
      Hospital's footer already promises a verify URL).
- [ ] PMDC license verification for doctors.
- [ ] Urdu patient instructions (add `ur`; right-to-left print).
- [ ] Hosting with backups, monitoring (e.g. Sentry) and logs that contain no
      patient data.
- [ ] Security review, privacy policy, data-retention rules and a
      data-processing agreement with hospitals.
- [ ] Pilot with one hospital.

#### Phase 5: Later

- Real pharmacy routing (a true "Send to Pharmacy").
- FHIR/HL7 export.
- Billing (confirm your payment provider supports your business's country
  first).
- Real admin analytics and trends.
- Quick packs ranked from real prescribing data.

---

## 4. Decisions needed

1. **Merge the Rx pad into the portal?** Recommended: yes (§3.1-1).
2. **Backend:** a custom Node API + Postgres (more control; recommended) or
   Supabase (faster; RLS and auth built in)?
3. **Can hospital admins prescribe?** Recommended: no, unless they also hold
   a doctor membership with a verified license.
4. **Drug and interaction data:** which source, and what budget for licensing?
5. **Hosting region and data residency** required by your target hospitals.
