// =============================================================================
//  SwiftRx Shared — Seed data loader
// =============================================================================
//  Loads the demo data from `seed/*.json` and rehydrates it into the typed
//  entities the apps use. The JSON is the source of truth for *data*; this file
//  owns *shape*.
//
//  Two things are re-derived on load, deliberately:
//   1. Patient `createdAt` is stored as `createdAtDaysAgo` and rebased from
//      `seededAt` in seed/manifest.json, so each patient gets a fixed date
//      (seededAt minus N days). The pre-JSON mockDb counted back from today
//      instead, so its dates moved with the clock.
//   2. Signed Rx store a `patientId` / `diagnosisCode`, and the full objects are
//      resolved here. Storing a reference instead of a copy means a renamed
//      patient can never leave a stale duplicate inside a prescription.
//
//  Edit seed/*.json directly. scripts/gen-seed.mjs was the one-off move of the
//  rows out of mockDb.ts; don't rerun it (see its header).
// =============================================================================

import manifest from './seed/manifest.json';
import hospitalsJson from './seed/hospitals.json';
import usersJson from './seed/users.json';
import patientsJson from './seed/patients.json';
import drugsJson from './seed/drugs.json';
import diagnosesJson from './seed/diagnoses.json';
import investigationsJson from './seed/investigations.json';
import quickPacksJson from './seed/quickPacks.json';
import signedRxJson from './seed/signedRx.json';
import auditJson from './seed/audit.json';

import type {
  AuditEvent,
  Diagnosis,
  Drug,
  Hospital,
  Investigation,
  Patient,
  QuickPack,
  SignedRx,
  User,
} from './types';

/** Patient row in JSON: createdAt is an offset, not a fixed timestamp. */
interface PatientSeed extends Omit<Patient, 'createdAt'> {
  createdAtDaysAgo: number;
}

/** Rx row in JSON: the patient and diagnosis are referenced, not embedded. */
interface SignedRxSeed extends Omit<SignedRx, 'patient' | 'diagnosis'> {
  patientId: string;
  diagnosisCode: string;
}

const SEEDED_AT = new Date(manifest.seededAt).getTime();
const DAY_MS = 86_400_000;

function rebase(daysAgo: number): string {
  return new Date(SEEDED_AT - daysAgo * DAY_MS).toISOString();
}

export const MOCK_HOSPITALS: Hospital[] = hospitalsJson as Hospital[];
export const MOCK_USERS: User[] = usersJson as User[];
export const MOCK_DRUGS: Drug[] = drugsJson as Drug[];
export const MOCK_DIAGNOSES: Diagnosis[] = diagnosesJson as Diagnosis[];
export const MOCK_INVESTIGATIONS: Investigation[] = investigationsJson as Investigation[];
export const MOCK_QUICK_PACKS: QuickPack[] = quickPacksJson as QuickPack[];
export const MOCK_AUDIT: AuditEvent[] = auditJson as AuditEvent[];

export const MOCK_PATIENTS: Patient[] = (patientsJson as PatientSeed[]).map((p) => {
  const { createdAtDaysAgo, ...rest } = p;
  return { ...rest, createdAt: rebase(createdAtDaysAgo) };
});

const patientById = new Map(MOCK_PATIENTS.map((p) => [p.id, p]));
const diagnosisByCode = new Map(MOCK_DIAGNOSES.map((d) => [d.code, d]));

export const MOCK_SIGNED_RX: SignedRx[] = (signedRxJson as SignedRxSeed[]).map((rx) => {
  const { patientId, diagnosisCode, ...rest } = rx;
  const patient = patientById.get(patientId);
  const diagnosis = diagnosisByCode.get(diagnosisCode);
  if (!patient || !diagnosis) {
    // A dangling reference is a seed-data bug, not a runtime condition to
    // handle: fail loudly at import time rather than render a broken Rx.
    throw new Error(
      `seed/signedRx.json: ${rx.id} references ${patientId ? `patient ${patientId}` : `diagnosis ${diagnosisCode}`}, which is not in the seed data`,
    );
  }
  return { ...rest, patient, diagnosis };
});
