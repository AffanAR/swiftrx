# Contributing to SwiftRx

SwiftRx is a prescription system. Read this before changing anything that touches
clinical logic — the rules below are not style preferences.

## Before you start

```bash
npm install      # one install at the root (npm workspaces)
npm run check    # format + lint + typecheck + tests w/ coverage + build
```

`npm run check` is exactly what CI runs. If it does not pass locally, it will not
pass on a pull request.

A pre-commit hook (husky + lint-staged) runs Prettier and ESLint on staged files,
so most formatting problems never reach a commit.

## Branches and commits

| | Convention |
| --- | --- |
| Branch | `feature/short-slug`, `fix/short-slug`, `chore/short-slug` |
| Commit | Imperative subject under ~72 chars: `Add allergy cross-sensitivity check` |
| Body | *Why* the change was needed, and anything a reviewer cannot infer from the diff |

One logical change per commit. A commit that fixes a typo and refactors a module
is two commits.

## Pull request checklist

- [ ] `npm run check` passes
- [ ] New logic in `apps/*/src/**/*.ts` has a test in a sibling `*.test.ts`
- [ ] Type changes updated `apps/shared/src/types.ts` **and** every app that uses them
- [ ] User-visible behaviour changed? The README or `deploy/ONLINE.md` is updated too
- [ ] Anything clinical is flagged for clinician review (see below)

## Clinical safety changes

The Rx pad refuses to sign when it detects a critical allergy or interaction
(`apps/doctor-portal/src/rx/safety.ts`), and `store.sign()` blocks on an
unresolved critical alert unless the doctor types an override reason.

If you touch safety rules, dose limits or quick packs:

1. Say so in the PR description, and name the clinician who reviewed it.
2. Do not raise or lower a dose ceiling without that review.
3. Add or update the tests in `safety.test.ts` — including the case that was
   previously wrong.

**No dose or interaction rule ships without a clinician sign-off.**

## Tenant isolation

Every entity is keyed by `hospitalSlug`, and the hospital is resolved from the
host, never from client input. A change that lets one tenant read another's data
is a security bug, not a UI bug. When you add a method to the data client
(`apps/shared/src/api.ts`), scope it by hospital slug and add a test for the
cross-tenant case (see `api.test.ts`). App code reads and writes only through
the client and its query hooks; ESLint rejects direct mock-db imports.

## Code conventions

- TypeScript `strict` is already on. Do not introduce `any` or `@ts-ignore`; if
  the type is wrong, fix the type.
- Comments explain *why*, not *what*. The existing files are the style reference.
- Prefer editing an existing file over adding a new one. New modules go next to
  the code they serve, with a `*.test.ts` beside them.
- Prettier and ESLint own formatting. Do not hand-format.

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/shared/` | Types, the data client and query hooks, mock data, auth, tenant resolution, UI primitives |
| `apps/admin/` | Platform console (tenants, users, usage, audit) — port 5175 |
| `apps/doctor-portal/` | Per-hospital portal and the Rx pad at `/rx` — port 5174 |
| `scripts/dev.mjs` | Dev orchestrator + subdomain gateway — port 5172 |
| `deploy/` | nginx config and DNS / hosts instructions |

`apps/shared` is consumed through a Vite alias and a TypeScript `paths` entry —
there is no build step. See `docs/ARCHITECTURE.md` for the full picture.

## Demo credentials

| Account | Email | Password |
| --- | --- | --- |
| Platform admin | `admin@swiftrx.com` | `admin1234` |
| City Hospital doctor | `ayesha@city-hospital.com` | `demo1234` |
| Northstar doctor | `sana@northstar-medical.com` | `demo1234` |

Passwords are bcrypt hashes in `apps/shared/src/seed/users.json`, verified by
`verifyPassword()`. To add a user, hash the password (cost 8 is enough for a
demo) rather than storing it in the clear.