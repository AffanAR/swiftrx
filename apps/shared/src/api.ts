// =============================================================================
//  SwiftRx Shared — Data client
// =============================================================================
//  The one way the apps read and write data. Each method notes its endpoint.
//  Everything goes to the server (apps/api) except the admin's list of every
//  account (users.list), which still answers from the seed in the browser
//  (mockDb.ts) until GET /users exists, as an async copy, like JSON over HTTP.
//  The pages, the query hooks (queries.ts) and the Rx store don't change when
//  a method moves.
// =============================================================================

import { MOCK_LATENCY_MS } from './config';
import { ApiError, callApi } from './http';
import { MOCK_USERS } from './mockDb';
import {
  type AuditEvent,
  type Catalog,
  type Hospital,
  type HospitalFeatures,
  type HospitalProfile,
  type Patient,
  type PrescriptionDraft,
  type RxDesign,
  type SignedRx,
  type User,
} from './types';

/** The patient fields a client sends; the server assigns the id and creation time. */
/** The facts a client sends to edit a patient: all of them, each time. */
export type PatientFacts = Pick<
  Patient,
  | 'weightKg'
  | 'pregnancy'
  | 'kidney'
  | 'egfr'
  | 'allergyStatus'
  | 'allergies'
  | 'activeProblems'
  | 'activeMedications'
>;

export type NewPatient = Pick<
  Patient,
  | 'hospitalSlug'
  | 'name'
  | 'dateOfBirth'
  | 'dateOfBirthEstimated'
  | 'sex'
  | 'weightKg'
  | 'contact'
  | 'pregnancy'
  | 'kidney'
  | 'egfr'
  | 'allergyStatus'
  | 'allergies'
  | 'activeProblems'
>;

/** The fields an admin sends to provision a hospital; the rest start at their defaults. */
export type NewHospital = Pick<
  Hospital,
  'slug' | 'name' | 'city' | 'country' | 'plan' | 'contactEmail' | 'monthlyRxCap'
>;

/** A doctor a hospital admin invites; the server makes the account and a link. */
export interface DoctorInvite {
  email: string;
  name: string;
  licenseNo: string;
  specialty?: string;
}

/**
 * A one-time link to set a password, as the server hands it to the admin who
 * asked: they pass it on (there's no email sender yet). setPasswordUrl()
 * turns the token into the link.
 */
export interface PasswordLink {
  token: string;
  purpose: 'invite' | 'reset';
}

export const api = {
  hospitals: {
    /** GET /hospitals — every hospital, for the platform admin. */
    list: (): Promise<Hospital[]> => callApi<Hospital[]>('/hospitals'),

    /** GET /hospitals/:slug — null for an unknown slug. Needs a session there. */
    get: (slug: string): Promise<Hospital | null> =>
      orNull(callApi<Hospital>(`/hospitals/${encodeURIComponent(slug)}`)),

    /** GET /hospitals/:slug/profile — name and plan, before anyone signs in; null if unknown. */
    profile: (slug: string): Promise<HospitalProfile | null> =>
      orNull(callApi<HospitalProfile>(`/hospitals/${encodeURIComponent(slug)}/profile`)),

    /** POST /hospitals — by the platform admin; the server audits it. */
    create: (input: NewHospital): Promise<Hospital> =>
      callApi<Hospital>('/hospitals', { method: 'POST', body: input }),

    /** PATCH /hospitals/:slug — feature flags, limits and the printed Rx design. */
    updateSettings: (
      slug: string,
      settings: { features: HospitalFeatures; rxDesign: RxDesign },
    ): Promise<Hospital> =>
      callApi<Hospital>(`/hospitals/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: settings,
      }),

    /**
     * PATCH /hospitals/:slug/status — by the platform admin. Suspending ends
     * every session at the hospital.
     */
    setStatus: (slug: string, status: Hospital['status']): Promise<Hospital> =>
      callApi<Hospital>(`/hospitals/${encodeURIComponent(slug)}/status`, {
        method: 'PATCH',
        body: { status },
      }),
  },

  users: {
    /** GET /users — every account, for the platform admin. */
    list: (): Promise<User[]> => reply(MOCK_USERS),

    /** GET /hospitals/:slug/doctors — from the server, with invited doctors. */
    listDoctors: (slug: string): Promise<User[]> =>
      callApi<User[]>(`/hospitals/${encodeURIComponent(slug)}/doctors`),

    /**
     * POST /auth/hospital-admin-invites — by the platform admin: an admin for
     * a hospital (a new hospital's first). Again for the same invited admin,
     * a new link.
     */
    inviteHospitalAdmin: (
      hospitalSlug: string,
      input: { email: string; name: string },
    ): Promise<PasswordLink & { user: User }> =>
      callApi('/auth/hospital-admin-invites', {
        method: 'POST',
        body: { hospitalSlug, ...input },
      }),

    /** POST /auth/invites — by a hospital admin, for their hospital. */
    invite: (input: DoctorInvite): Promise<PasswordLink & { user: User }> =>
      callApi('/auth/invites', { method: 'POST', body: input }),

    /** POST /auth/reset-links — a new link for one of the admin's hospital's users. */
    passwordLink: (userId: string): Promise<PasswordLink> =>
      callApi('/auth/reset-links', { method: 'POST', body: { userId } }),
  },

  patients: {
    /** GET /hospitals/:slug/patients */
    list: (slug: string): Promise<Patient[]> =>
      callApi<Patient[]>(`/hospitals/${encodeURIComponent(slug)}/patients`),

    /** POST /hospitals/:slug/patients — the server assigns the id and audits it. */
    create: ({ hospitalSlug, ...patient }: NewPatient): Promise<Patient> =>
      callApi<Patient>(`/hospitals/${encodeURIComponent(hospitalSlug)}/patients`, {
        method: 'POST',
        body: patient,
      }),

    /**
     * PATCH /hospitals/:slug/patients/:id — the facts that change (all of them,
     * each time); the server checks they agree with the rest and audits it.
     */
    update: (slug: string, id: string, facts: PatientFacts): Promise<Patient> =>
      callApi<Patient>(
        `/hospitals/${encodeURIComponent(slug)}/patients/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: facts },
      ),
  },

  prescriptions: {
    /** GET /hospitals/:slug/prescriptions, or GET /prescriptions for every hospital. */
    list: (slug?: string): Promise<SignedRx[]> =>
      callApi<SignedRx[]>(
        slug ? `/hospitals/${encodeURIComponent(slug)}/prescriptions` : '/prescriptions',
      ),

    /**
     * POST /hospitals/:slug/prescriptions — the server checks the doctor, the
     * patient, the catalog, the limits and the safety alerts, then assigns the
     * id, the time and the record hash, and audits it.
     */
    sign: (slug: string, draft: PrescriptionDraft): Promise<SignedRx> =>
      callApi<SignedRx>(`/hospitals/${encodeURIComponent(slug)}/prescriptions`, {
        method: 'POST',
        body: draft,
      }),
  },

  audit: {
    /** GET /audit-events, or GET /hospitals/:slug/audit-events, newest first. */
    list: (slug?: string): Promise<AuditEvent[]> =>
      callApi<AuditEvent[]>(
        slug ? `/hospitals/${encodeURIComponent(slug)}/audit-events` : '/audit-events',
      ),
  },

  catalog: {
    /**
     * GET /catalog — the generics, brands, diagnoses, investigations and quick
     * packs, from the server: the brand list is too big to bundle.
     */
    get: (): Promise<Catalog> => callApi<Catalog>('/catalog'),
  },
};

export type DataClient = typeof api;

export { ApiError };

// --- internals ---------------------------------------------------------------

/** A 404 as null, as the mock's lookups answered an unknown slug. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Answer like the network would: a copy, after the configured delay. */
async function reply<T>(value: T): Promise<T> {
  const copy = structuredClone(value);
  if (MOCK_LATENCY_MS > 0) await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
  return copy;
}
