// =============================================================================
//  SwiftRx Shared — Mock In-Memory Database
// =============================================================================
//  Provides the query + mutation surface the three apps use: lookups by slug
//  and id, per-tenant lists, appends, and the admin overrides.
//
//  The data itself lives in seed/*.json and is rehydrated by seedData.ts —
//  this file holds no seed rows. In production these helpers become the API
//  client, so the components do not change when the backend arrives.
//
//  Every entity is keyed by hospitalSlug where applicable so the admin
//  panel can show a global view and the hospital portal / rx pad can
//  filter to its own tenant.
// =============================================================================

import type { AuditEvent, Hospital, HospitalFeatures, RxDesign, SignedRx } from './types';

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

import {
  MOCK_HOSPITALS,
  MOCK_USERS,
  MOCK_PATIENTS,
  MOCK_DRUGS,
  MOCK_SIGNED_RX,
  MOCK_AUDIT,
} from './seedData';

// --- Lookup helpers (used across all three apps) -----------------------------

export function getHospital(slug: string | null | undefined) {
  if (!slug) return null;
  const raw = MOCK_HOSPITALS.find((h) => h.slug === slug);
  return raw ? applyOverrides(raw) : null;
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

export function listPatientsForHospital(slug: string) {
  return MOCK_PATIENTS.filter((p) => p.hospitalSlug === slug);
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

// --- Admin mutations ---------------------------------------------------------
//
// These are in-memory only for the mock build, but the API is the same one
// a real backend will eventually expose. They also persist to localStorage
// so admin changes survive a hard reload during testing.

const ADMIN_OVERRIDES_KEY = 'swiftrx:admin-overrides:v1';

type AdminOverrides = Record<
  string,
  Partial<Pick<Hospital, 'features' | 'rxDesign' | 'plan' | 'status'>>
>;

function loadOverrides(): AdminOverrides {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ADMIN_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as AdminOverrides) : {};
  } catch {
    return {};
  }
}

function saveOverrides(o: AdminOverrides) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_OVERRIDES_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function applyOverrides(h: Hospital): Hospital {
  const o = loadOverrides()[h.slug];
  if (!o) return h;
  return { ...h, ...o };
}

/** Public list view, with admin overrides applied. */
export function listHospitals(): Hospital[] {
  return MOCK_HOSPITALS.map(applyOverrides);
}

export function updateHospitalFeatures(slug: string, features: HospitalFeatures): Hospital | null {
  const h = MOCK_HOSPITALS.find((x) => x.slug === slug);
  if (!h) return null;
  h.features = features;
  const o = loadOverrides();
  o[slug] = { ...(o[slug] ?? {}), features };
  saveOverrides(o);
  return h;
}

export function updateHospitalRxDesign(slug: string, rxDesign: RxDesign): Hospital | null {
  const h = MOCK_HOSPITALS.find((x) => x.slug === slug);
  if (!h) return null;
  h.rxDesign = rxDesign;
  const o = loadOverrides();
  o[slug] = { ...(o[slug] ?? {}), rxDesign };
  saveOverrides(o);
  return h;
}

/** Returns the design the print pipeline should use for this hospital. */
export function getRxDesign(slug: string | null | undefined): RxDesign | null {
  return getHospital(slug)?.rxDesign ?? null;
}
