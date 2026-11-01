// =============================================================================
//  SwiftRx Shared — Mock In-Memory Database
// =============================================================================
//  What the data client (api.ts) still answers from the browser: the account
//  list and prescriptions. Hospitals, patients, doctors, the audit log and the
//  catalog come from the server now. Tests also use the seed rows re-exported
//  here.
//
//  The data itself lives in seed/*.json and is rehydrated by seedData.ts —
//  this file holds no seed rows.
// =============================================================================

import type { AuditEvent, SignedRx } from './types';

// The seed data lives in `seed/*.json` and is rehydrated by seedData.ts.
// It is re-exported here so apps keep importing everything from one module.
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

import { MOCK_HOSPITALS, MOCK_USERS, MOCK_DRUGS, MOCK_SIGNED_RX, MOCK_AUDIT } from './seedData';

// --- Lookup helpers (used across all three apps) -----------------------------

export function getHospital(slug: string | null | undefined) {
  if (!slug) return null;
  return MOCK_HOSPITALS.find((h) => h.slug === slug) ?? null;
}

export function getUserByEmail(email: string) {
  return MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string) {
  return MOCK_USERS.find((u) => u.id === id);
}

export function listDoctorsForHospital(slug: string) {
  return MOCK_USERS.filter((u) => u.role === 'doctor' && u.hospitalSlug === slug);
}

export function listSignedRxForHospital(slug: string) {
  return MOCK_SIGNED_RX.filter((r) => r.hospitalSlug === slug);
}

export function listAuditForHospital(slug: string) {
  return MOCK_AUDIT.filter((e) => e.hospitalSlug === slug);
}

export function appendAudit(e: AuditEvent) {
  MOCK_AUDIT.unshift(e);
}

export function appendSignedRx(rx: SignedRx) {
  MOCK_SIGNED_RX.unshift(rx);
  // Bump hospital usage counter.
  const h = getHospital(rx.hospitalSlug);
  if (h) h.monthlyRxUsed += 1;
}

export function findDrug(drugId: string) {
  return MOCK_DRUGS.find((d) => d.id === drugId);
}
