import React from 'react';
import type {
  Diagnosis,
  Investigation,
  Patient,
  RxMedication,
  SafetyAlert,
  SignedRx,
} from './types';
import { DRUGS } from './data';
import { evaluateAllMedications, findDrug } from './safety';
import {
  loadBridge,
  MOCK_PATIENTS,
  listPatientsForHospital,
  listSignedRxForHospital,
  appendSignedRx,
  appendAudit,
  type BridgeSession,
} from './shared-bridge';

export interface NewPatientInput {
  name: string;
  age: number;
  sex: 'M' | 'F';
  weightKg: number;
  contact: string;
  allergies: string[];
  activeProblems: string[];
}

export interface AppState {
  // Patient
  patients: Patient[];
  patientId: string;
  // Diagnosis
  diagnosis: Diagnosis | null;
  diagnosisQuery: string;
  investigations: Investigation[];
  // Rx rows
  medications: RxMedication[];
  // Signed history
  signed: SignedRx[];
  // Doctor
  doctorName: string;
  doctorLicense: string;
  // Active focused input (for tab/keyboard management)
  focusZone:
    | 'patient'
    | 'diagnosis'
    | 'med-search'
    | 'med-row'
    | 'sign'
    | null;
  activeRowId: string | null;
  // New-patient modal visibility
  showNewPatient: boolean;
  // Critical alerts waiting for an override reason before signing (opens the modal)
  overridePrompt: SafetyAlert[] | null;
  // Toast / banner
  banner: { kind: 'info' | 'success' | 'warn' | 'danger'; text: string } | null;
}

export interface AppActions {
  setPatient: (id: string) => void;
  createPatient: (input: NewPatientInput) => string;
  setDiagnosisQuery: (q: string) => void;
  setDiagnosis: (d: Diagnosis | null) => void;
  setInvestigations: (list: Investigation[]) => void;
  toggleInvestigation: (inv: Investigation) => void;
  addMedication: (drugId: string, brandName?: string) => void;
  addMedications: (rows: Omit<RxMedication, 'rowId'>[]) => void;
  updateMedication: (rowId: string, patch: Partial<RxMedication>) => void;
  removeMedication: (rowId: string) => void;
  clearAll: () => void;
  setActiveRow: (id: string | null) => void;
  setFocusZone: (z: AppState['focusZone']) => void;
  setBanner: (banner: AppState['banner']) => void;
  openNewPatient: () => void;
  closeNewPatient: () => void;
  /**
   * Signs the current pad. Returns the signed Rx, or null if it can't be signed
   * yet. Critical alerts need `overrideReason` (see MIN_OVERRIDE_REASON);
   * without it this opens the override prompt instead.
   */
  sign: (overrideReason?: string) => SignedRx | null;
  cancelOverride: () => void;
  /** Copies a previous Rx for the current patient onto the pad (see the action for merge rules). */
  repeatRx: (rx: SignedRx) => void;
  setDoctorIdentity: (id: { doctorName: string; doctorLicense: string }) => void;
}

export type AppStore = AppState & AppActions;

/** Shortest override reason accepted when signing past a critical alert. */
export const MIN_OVERRIDE_REASON = 10;

const newRowId = () => 'r_' + Math.random().toString(36).slice(2, 9);
const newPatientId = () => 'p_' + Math.random().toString(36).slice(2, 9);

// Empty until bootstrapFromBridge() loads the signed-in doctor's hospital:
// no default patients and no default doctor identity.
const initialState: AppState = {
  patients: [],
  patientId: '',
  diagnosis: null,
  diagnosisQuery: '',
  investigations: [],
  medications: [],
  signed: [],
  doctorName: '',
  doctorLicense: '',
  focusZone: null,
  activeRowId: null,
  showNewPatient: false,
  overridePrompt: null,
  banner: null,
};

class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  public actions: AppActions;

  constructor(initial: AppState) {
    this.state = initial;
    this.actions = {
      setPatient: (id: string) =>
        this.set({
          patientId: id,
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
        }),
      createPatient: (input: NewPatientInput) => {
        // Patients always belong to the signed-in doctor's hospital — no fallback.
        const bridge = currentBridge();
        if (!bridge) {
          this.set({ banner: { kind: 'danger', text: 'Sign in as a doctor to add patients.' } });
          return '';
        }
        const id = newPatientId();
        const p: Patient = {
          id,
          hospitalSlug: bridge.hospitalSlug,
          name: input.name,
          age: input.age,
          sex: input.sex,
          weightKg: input.weightKg,
          contact: input.contact,
          allergies: input.allergies,
          activeProblems: input.activeProblems,
          activeMedications: [],
          recentVitals: [
            { label: 'BP', value: '—' },
            { label: 'Pulse', value: '—' },
            { label: 'SpO2', value: '—' },
          ],
          createdAt: new Date().toISOString(),
        };
        MOCK_PATIENTS.push(p);
        appendAudit({
          kind: 'create_patient',
          userId: bridge.doctorId,
          userEmail: bridge.email,
          at: new Date().toISOString(),
          hospitalSlug: p.hospitalSlug,
          patientId: p.id,
          patientName: p.name,
        });
        this.set({
          patients: [...this.state.patients, p],
          patientId: p.id,
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
          showNewPatient: false,
        });
        return id;
      },
      setDiagnosisQuery: (q: string) => this.set({ diagnosisQuery: q }),
      setDiagnosis: (d: Diagnosis | null) =>
        this.set({
          diagnosis: d,
          diagnosisQuery: d ? `${d.code} ${d.name}` : '',
          // Suggest recommended investigations for the chosen diagnosis
          investigations: d?.recommendedInvestigations
            ? d.recommendedInvestigations
            : this.state.investigations,
        }),
      setInvestigations: (list: Investigation[]) => this.set({ investigations: list }),
      toggleInvestigation: (inv: Investigation) => {
        const has = this.state.investigations.some((i) => i.code === inv.code);
        this.set({
          investigations: has
            ? this.state.investigations.filter((i) => i.code !== inv.code)
            : [...this.state.investigations, inv],
        });
      },
      addMedication: (drugId: string, brandName?: string) => {
        const drug = findDrug(drugId, DRUGS);
        if (!drug) return;
        const med: RxMedication = {
          rowId: newRowId(),
          drugId: drug.id,
          genericName: drug.genericName,
          brandName,
          dosage: { ...drug.defaultDosage },
          frequency: drug.defaultFrequency,
          durationDays: drug.defaultDurationDays,
          instructions: 'As directed',
        };
        this.set({
          medications: [...this.state.medications, med],
          activeRowId: med.rowId,
        });
      },
      addMedications: (rows: Omit<RxMedication, 'rowId'>[]) => {
        const meds = rows.map((r) => ({ ...r, rowId: newRowId() }));
        this.set({
          medications: [...this.state.medications, ...meds],
          activeRowId: meds[meds.length - 1]?.rowId ?? null,
        });
      },
      updateMedication: (rowId: string, patch: Partial<RxMedication>) => {
        this.set({
          medications: this.state.medications.map((m) =>
            m.rowId === rowId ? { ...m, ...patch } : m,
          ),
        });
      },
      removeMedication: (rowId: string) => {
        this.set({
          medications: this.state.medications.filter((m) => m.rowId !== rowId),
          activeRowId: null,
        });
      },
      clearAll: () =>
        this.set({
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
        }),
      setActiveRow: (id: string | null) => this.set({ activeRowId: id }),
      setFocusZone: (z: AppState['focusZone']) => this.set({ focusZone: z }),
      setBanner: (banner: AppState['banner']) => this.set({ banner }),
      openNewPatient: () => this.set({ showNewPatient: true }),
      closeNewPatient: () => this.set({ showNewPatient: false }),
      sign: (overrideReason?: string) => {
        const s = this.state;
        const patient = s.patients.find((p) => p.id === s.patientId);
        if (!patient || !s.diagnosis || !s.medications.length) {
          this.set({ banner: { kind: 'warn', text: 'Need patient, diagnosis, and at least one medication to sign.' } });
          return null;
        }
        // Only the signed-in doctor can sign — there is no fallback identity.
        const bridge = currentBridge();
        if (!bridge || !s.doctorName || !s.doctorLicense) {
          this.set({ banner: { kind: 'danger', text: 'Only a signed-in doctor with a license number can sign.' } });
          return null;
        }
        const badRow = s.medications.findIndex((m) => !(m.dosage.value > 0) || !(m.durationDays > 0));
        if (badRow >= 0) {
          const m = s.medications[badRow];
          this.set({
            banner: { kind: 'danger', text: `Row ${badRow + 1} (${m.genericName}): dose and duration must be greater than 0.` },
          });
          return null;
        }
        // Critical alerts (allergies) block signing until the doctor records
        // why they are overriding them.
        const critical = [...evaluateAllMedications(s.medications, patient, DRUGS).values()]
          .flat()
          .filter((a) => a.severity === 'critical');
        const reason = overrideReason?.trim() ?? '';
        if (critical.length && reason.length < MIN_OVERRIDE_REASON) {
          this.set({ overridePrompt: critical });
          return null;
        }
        const signed: SignedRx = {
          id: 'rx_' + Date.now().toString(36),
          signedAt: new Date().toISOString(),
          hospitalSlug: patient.hospitalSlug,
          patient,
          diagnosis: s.diagnosis,
          medications: s.medications,
          investigations: s.investigations,
          doctorId: bridge.doctorId,
          doctorName: s.doctorName,
          doctorLicense: s.doctorLicense,
          safetyOverride: critical.length ? { reason, alerts: critical } : undefined,
        };
        appendSignedRx(signed);
        appendAudit({
          kind: 'sign_rx',
          userId: bridge.doctorId,
          userEmail: bridge.email,
          at: signed.signedAt,
          hospitalSlug: patient.hospitalSlug,
          rxId: signed.id,
          patientName: patient.name,
          overrideReason: critical.length ? reason : undefined,
        });
        this.set({
          signed: [signed, ...s.signed],
          banner: critical.length
            ? { kind: 'warn', text: `Signed ${signed.id} for ${patient.name} with an allergy override.` }
            : { kind: 'success', text: `Signed ${signed.id} for ${patient.name}.` },
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
          overridePrompt: null,
        });
        return signed;
      },
      cancelOverride: () => this.set({ overridePrompt: null }),
      repeatRx: (rx: SignedRx) => {
        const s = this.state;
        if (rx.patient.id !== s.patientId) return;
        // On an empty pad this is a full repeat. If the doctor already started,
        // keep their diagnosis and only add meds that aren't on the pad yet.
        const takeDiagnosis = !s.diagnosis;
        const onPad = new Set(s.medications.map((m) => m.drugId));
        const added: RxMedication[] = rx.medications
          .filter((m) => !onPad.has(m.drugId))
          .map((m) => ({ ...m, dosage: { ...m.dosage }, rowId: newRowId() }));
        const skipped = rx.medications.length - added.length;
        const date = new Date(rx.signedAt).toLocaleDateString();
        this.set({
          diagnosis: takeDiagnosis ? rx.diagnosis : s.diagnosis,
          diagnosisQuery: takeDiagnosis ? `${rx.diagnosis.code} ${rx.diagnosis.name}` : s.diagnosisQuery,
          investigations: takeDiagnosis ? [...(rx.investigations ?? [])] : s.investigations,
          medications: [...s.medications, ...added],
          activeRowId: added[added.length - 1]?.rowId ?? s.activeRowId,
          banner: {
            kind: 'success',
            text:
              `Repeated Rx from ${date}: ${added.length} med${added.length === 1 ? '' : 's'} added` +
              (skipped ? `, ${skipped} already on the pad.` : '.'),
          },
        });
      },
      setDoctorIdentity: (id) => this.set({ doctorName: id.doctorName, doctorLicense: id.doctorLicense }),
    };
  }

  get state$(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const store = new Store(initialState);

export const actions = store.actions;

export function getState(): AppState {
  return store.state$;
}

/** A patient's signed prescriptions from the loaded history, newest first. */
export function previousRxForPatient(signed: SignedRx[], patientId: string): SignedRx[] {
  return signed
    .filter((rx) => rx.patient.id === patientId)
    .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return React.useSyncExternalStore(
    store.subscribe.bind(store),
    () => selector(store.state$),
    () => selector(initialState),
  );
}

// -----------------------------------------------------------------------------
//  Bootstrap: seed the store with the hospital-scoped patient roster + signed
//  Rx history. Called once from App.tsx on mount, after the bridge session is
//  loaded. Without a bridge the roster stays empty — never another hospital's.
// -----------------------------------------------------------------------------

function currentBridge(): BridgeSession | null {
  return loadBridge();
}

function currentHospitalSlug(): string | null {
  const b = currentBridge();
  return b?.hospitalSlug ?? null;
}

export function bootstrapFromBridge(): void {
  const slug = currentHospitalSlug();
  const patients = slug ? listPatientsForHospital(slug) : [];
  const signed = slug ? listSignedRxForHospital(slug) : [];
  const bridge = currentBridge();
  store.set({
    patients,
    patientId: patients[0]?.id ?? '',
    signed,
    doctorName: bridge?.doctorName ?? '',
    doctorLicense: bridge?.licenseNo ?? '',
  });
}
