// =============================================================================
//  SwiftRx Shared — Seed data for the browser
// =============================================================================
//  Everything the apps show comes from the server now, except the admin's
//  list of every account (api.users.list), which still reads MOCK_USERS here
//  until GET /users exists. Tests use the other seed rows re-exported here, as
//  the server would answer them.
//
//  The data itself lives in seed/*.json and is rehydrated by seedData.ts —
//  this file holds no seed rows. ESLint keeps app code off it (eslint.config).
// =============================================================================

import { MOCK_HOSPITALS } from './seedData';

export {
  MOCK_HOSPITALS,
  MOCK_USERS,
  MOCK_PATIENTS,
  MOCK_DRUGS,
  MOCK_DIAGNOSES,
  MOCK_INVESTIGATIONS,
  MOCK_QUICK_PACKS,
  MOCK_SIGNED_RX,
  MOCK_AUDIT,
} from './seedData';

/** A seed hospital by slug, for tests. */
export function getHospital(slug: string | null | undefined) {
  if (!slug) return null;
  return MOCK_HOSPITALS.find((h) => h.slug === slug) ?? null;
}
