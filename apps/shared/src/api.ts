// =============================================================================
//  SwiftRx Shared — Data client
// =============================================================================
//  The one way the apps read and write data. Each method notes its endpoint.
//  Sign-in (auth.ts), hospitals, patients, doctors, the audit log and the
//  catalog go to the server (apps/api); the account list and prescriptions
//  still answer from the in-memory mock db (mockDb.ts) until their endpoints
//  exist. The pages, the query hooks (queries.ts) and the Rx store don't
//  change when a method moves.
//
//  Like JSON over HTTP, every mock method is async and returns copies, so a
//  caller can't change stored data by mutating a result. Mock writes assign
//  ids and timestamps and record the audit event, as the server does.
// =============================================================================

import { MOCK_LATENCY_MS } from './config';
import { ApiError, callApi } from './http';
import {
  MOCK_SIGNED_RX,
  MOCK_USERS,
  appendAudit,
  appendSignedRx,
  listSignedRxForHospital,
} from './mockDb';
import {
  type AuditEvent,
  type Catalog,
  type Hospital,
  type HospitalFeatures,
  type HospitalProfile,
  type Patient,
  type RxDesign,
  type SignedRx,
  type User,
} from './types';

/**
 * Who is making a change, for the audit row. A real backend takes this from
 * the session cookie instead of trusting the client.
 */
export interface Actor {
  id: string;
  email: string;
}

/** The patient fields a client sends; the server assigns the id and creation time. */
export type NewPatient = Pick<
  Patient,
  | 'hospitalSlug'
  | 'name'
  | 'age'
  | 'sex'
  | 'weightKg'
  | 'contact'
  | 'allergyStatus'
  | 'allergies'
  | 'activeProblems'
>;

/** The fields an admin sends to provision a hospital; the rest start at their defaults. */
export type NewHospital = Pick<
  Hospital,
  'slug' | 'name' | 'city' | 'country' | 'plan' | 'contactEmail' | 'monthlyRxCap'
>;

/** A prescription as the Rx pad sends it; the server assigns the id and time. */
export type PrescriptionDraft = Omit<SignedRx, 'id' | 'signedAt'>;

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
  },

  users: {
    /** GET /users — every account, for the platform admin. */
    list: (): Promise<User[]> => reply(MOCK_USERS),

    /** GET /hospitals/:slug/doctors — from the server, with invited doctors. */
    listDoctors: (slug: string): Promise<User[]> =>
      callApi<User[]>(`/hospitals/${encodeURIComponent(slug)}/doctors`),

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
  },

  prescriptions: {
    /** GET /hospitals/:slug/prescriptions, or GET /prescriptions for every hospital. */
    list: (slug?: string): Promise<SignedRx[]> =>
      reply(slug ? listSignedRxForHospital(slug) : MOCK_SIGNED_RX),

    /** POST /hospitals/:slug/prescriptions — the server assigns the id and time. */
    sign: async (draft: PrescriptionDraft, by: Actor): Promise<SignedRx> => {
      const rx: SignedRx = { ...structuredClone(draft), id: newId('rx'), signedAt: now() };
      appendSignedRx(rx);
      audit({
        kind: 'sign_rx',
        userId: by.id,
        userEmail: by.email,
        at: rx.signedAt,
        hospitalSlug: rx.hospitalSlug,
        rxId: rx.id,
        patientName: rx.patient.name,
        overrideReason: rx.safetyOverride?.reason,
      });
      return reply(rx);
    },
  },

  audit: {
    /**
     * GET /audit-events, or GET /hospitals/:slug/audit-events. The server's
     * log (the seed, sign-ins, invitations), plus what this tab wrote through
     * the mock above, until those writes move to the server too.
     */
    list: async (slug?: string): Promise<AuditEvent[]> => {
      const path = slug ? `/hospitals/${encodeURIComponent(slug)}/audit-events` : '/audit-events';
      const server = await callApi<AuditEvent[]>(path);
      const local = writtenHere.filter((e) => !slug || e.hospitalSlug === slug);
      return [...server, ...structuredClone(local)].sort((a, b) => b.at.localeCompare(a.at));
    },
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

const now = () => new Date().toISOString();

/** Time-based, with a random tail so two writes in the same millisecond differ. */
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Audit events the mock wrote in this tab, which the server hasn't seen. */
const writtenHere: AuditEvent[] = [];

const audit = (e: AuditEvent) => {
  appendAudit(structuredClone(e));
  writtenHere.push(structuredClone(e));
};
