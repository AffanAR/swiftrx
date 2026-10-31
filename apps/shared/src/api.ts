// =============================================================================
//  SwiftRx Shared — Data client
// =============================================================================
//  The one way the apps read and write data. Today every method answers from
//  the in-memory mock db (mockDb.ts). When the backend arrives, this is the
//  file that changes: each method becomes a fetch() to the endpoint noted
//  beside it, and the pages, the query hooks (queries.ts) and the Rx store
//  stay as they are.
//
//  Like JSON over HTTP, every method is async and returns copies, so a caller
//  can't change stored data by mutating a result. Writes assign ids and
//  timestamps and record the audit event, as the server will.
//
//  Sign-in already goes to the server (auth.ts, /api/auth). Passwords live
//  only there, so the mock users here have none.
// =============================================================================

import { MOCK_LATENCY_MS } from './config';
import {
  MOCK_AUDIT,
  MOCK_DIAGNOSES,
  MOCK_DRUGS,
  MOCK_HOSPITALS,
  MOCK_INVESTIGATIONS,
  MOCK_PATIENTS,
  MOCK_QUICK_PACKS,
  MOCK_SIGNED_RX,
  MOCK_USERS,
  appendAudit,
  appendSignedRx,
  getHospital,
  listAuditForHospital,
  listDoctorsForHospital,
  listHospitals,
  listPatientsForHospital,
  listSignedRxForHospital,
  updateHospitalFeatures,
  updateHospitalRxDesign,
} from './mockDb';
import {
  DEFAULT_HOSPITAL_FEATURES,
  DEFAULT_RX_DESIGN,
  type AuditEvent,
  type Diagnosis,
  type Drug,
  type Hospital,
  type HospitalFeatures,
  type Investigation,
  type Patient,
  type QuickPack,
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

/** Everything the Rx pad searches and checks against. */
export interface Catalog {
  drugs: Drug[];
  diagnoses: Diagnosis[];
  investigations: Investigation[];
  quickPacks: QuickPack[];
}

/** The patient fields a client sends; the server assigns the id and creation time. */
export type NewPatient = Pick<
  Patient,
  'hospitalSlug' | 'name' | 'age' | 'sex' | 'weightKg' | 'contact' | 'allergies' | 'activeProblems'
>;

/** The fields an admin sends to provision a hospital; the rest start at their defaults. */
export type NewHospital = Pick<
  Hospital,
  'slug' | 'name' | 'city' | 'country' | 'plan' | 'contactEmail' | 'monthlyRxCap'
>;

/** A prescription as the Rx pad sends it; the server assigns the id and time. */
export type PrescriptionDraft = Omit<SignedRx, 'id' | 'signedAt'>;

/** A failed request. `status` is the HTTP status the real API would send. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const api = {
  hospitals: {
    /** GET /hospitals */
    list: (): Promise<Hospital[]> => reply(listHospitals()),

    /** GET /hospitals/:slug — null for an unknown slug. */
    get: (slug: string): Promise<Hospital | null> => reply(getHospital(slug)),

    /** POST /hospitals */
    create: async (input: NewHospital, by: Actor): Promise<Hospital> => {
      if (MOCK_HOSPITALS.some((h) => h.slug === input.slug)) {
        throw new ApiError(409, 'A hospital with a similar slug already exists.');
      }
      const hospital: Hospital = {
        ...structuredClone(input),
        status: 'trial',
        createdAt: now(),
        monthlyRxUsed: 0,
        features: { ...DEFAULT_HOSPITAL_FEATURES },
        rxDesign: { ...DEFAULT_RX_DESIGN, headerTitle: input.name },
      };
      MOCK_HOSPITALS.push(hospital);
      audit({
        kind: 'create_hospital',
        userId: by.id,
        userEmail: by.email,
        at: hospital.createdAt,
        hospitalSlug: hospital.slug,
        hospitalName: hospital.name,
      });
      return reply(hospital);
    },

    /** PATCH /hospitals/:slug — feature flags, limits and the printed Rx design. */
    updateSettings: async (
      slug: string,
      settings: { features: HospitalFeatures; rxDesign: RxDesign },
    ): Promise<Hospital> => {
      const found =
        updateHospitalFeatures(slug, structuredClone(settings.features)) &&
        updateHospitalRxDesign(slug, structuredClone(settings.rxDesign));
      const hospital = found ? getHospital(slug) : null;
      if (!hospital) throw new ApiError(404, `No hospital "${slug}".`);
      return reply(hospital);
    },
  },

  users: {
    /** GET /users — every account, for the platform admin. */
    list: (): Promise<User[]> => reply(MOCK_USERS),

    /** GET /hospitals/:slug/doctors */
    listDoctors: (slug: string): Promise<User[]> => reply(listDoctorsForHospital(slug)),
  },

  patients: {
    /** GET /hospitals/:slug/patients */
    list: (slug: string): Promise<Patient[]> => reply(listPatientsForHospital(slug)),

    /** POST /hospitals/:slug/patients */
    create: async (input: NewPatient, by: Actor): Promise<Patient> => {
      if (!input.name.trim() || !(input.age >= 0) || !(input.weightKg > 0)) {
        throw new ApiError(400, 'Name, age and weight are required.');
      }
      const patient: Patient = {
        ...structuredClone(input),
        id: newId('p'),
        activeMedications: [],
        recentVitals: [
          { label: 'BP', value: '—' },
          { label: 'Pulse', value: '—' },
          { label: 'SpO2', value: '—' },
        ],
        createdAt: now(),
      };
      MOCK_PATIENTS.push(patient);
      audit({
        kind: 'create_patient',
        userId: by.id,
        userEmail: by.email,
        at: patient.createdAt,
        hospitalSlug: patient.hospitalSlug,
        patientId: patient.id,
        patientName: patient.name,
      });
      return reply(patient);
    },
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
    /** GET /audit-events, or GET /audit-events?hospital=:slug */
    list: (slug?: string): Promise<AuditEvent[]> =>
      reply(slug ? listAuditForHospital(slug) : MOCK_AUDIT),
  },

  catalog: {
    /** GET /catalog — the drugs, diagnoses, investigations and quick packs. */
    get: (): Promise<Catalog> =>
      reply({
        drugs: MOCK_DRUGS,
        diagnoses: MOCK_DIAGNOSES,
        investigations: MOCK_INVESTIGATIONS,
        quickPacks: MOCK_QUICK_PACKS,
      }),
  },
};

export type DataClient = typeof api;

// --- internals ---------------------------------------------------------------

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

const audit = (e: AuditEvent) => appendAudit(structuredClone(e));
