import React from 'react';
import type {
  Diagnosis,
  Investigation,
  Patient,
  RxMedication,
  SignedRx,
} from './types';
import { PATIENTS, DRUGS } from './data';
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
  /** Signs the current pad. Returns the signed Rx, or null if the pad is incomplete. */
  sign: () => SignedRx | null;
  setDoctorIdentity: (id: { doctorName: string; doctorLicense: string }) => void;
}

export type AppStore = AppState & AppActions;

const newRowId = () => 'r_' + Math.random().toString(36).slice(2, 9);
const newPatientId = () => 'p_' + Math.random().toString(36).slice(2, 9);

const initialState: AppState = {
  patients: PATIENTS,
  patientId: PATIENTS[0]?.id ?? '',
  diagnosis: null,
  diagnosisQuery: '',
  investigations: [],
  medications: [],
  signed: [],
  doctorName: 'Dr. Affan Ahmed',
  doctorLicense: 'PMDC-78421',
  focusZone: null,
  activeRowId: null,
  showNewPatient: false,
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
          investigations: [],
          medications: [],
          activeRowId: null,
        }),
      createPatient: (input: NewPatientInput) => {
        const id = newPatientId();
        const p: Patient = {
          id,
          hospitalSlug: currentHospitalSlug() ?? 'unknown',
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
          userId: currentBridge()?.doctorId ?? 'unknown',
          userEmail: currentBridge()?.email ?? 'unknown',
          at: new Date().toISOString(),
          hospitalSlug: p.hospitalSlug,
          patientId: p.id,
          patientName: p.name,
        });
        this.set({
          patients: [...this.state.patients, p],
          patientId: p.id,
          diagnosis: null,
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
      sign: () => {
        const patient = this.state.patients.find((p) => p.id === this.state.patientId);
        if (!patient || !this.state.diagnosis || !this.state.medications.length) {
          this.set({ banner: { kind: 'warn', text: 'Need patient, diagnosis, and at least one medication to sign.' } });
          return null;
        }
        const bridge = currentBridge();
        const signed: SignedRx = {
          id: 'rx_' + Date.now().toString(36),
          signedAt: new Date().toISOString(),
          hospitalSlug: patient.hospitalSlug,
          patient,
          diagnosis: this.state.diagnosis,
          medications: this.state.medications,
          investigations: this.state.investigations,
          doctorId: bridge?.doctorId ?? 'unknown',
          doctorName: this.state.doctorName,
          doctorLicense: this.state.doctorLicense,
        };
        appendSignedRx(signed);
        appendAudit({
          kind: 'sign_rx',
          userId: bridge?.doctorId ?? 'unknown',
          userEmail: bridge?.email ?? 'unknown',
          at: signed.signedAt,
          hospitalSlug: patient.hospitalSlug,
          rxId: signed.id,
          patientName: patient.name,
        });
        this.set({
          signed: [signed, ...this.state.signed],
          banner: { kind: 'success', text: `Signed ${signed.id} for ${patient.name}.` },
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
        });
        return signed;
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
//  loaded. If no bridge is present we fall back to the first hospital's
//  patients so the pad still works for local tinkering.
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
  const patients = slug ? listPatientsForHospital(slug) : PATIENTS;
  const signed = slug ? listSignedRxForHospital(slug) : [];
  const bridge = currentBridge();
  store.set({
    patients: patients.length ? patients : PATIENTS,
    patientId: patients[0]?.id ?? PATIENTS[0]?.id ?? '',
    signed,
    doctorName: bridge?.doctorName ?? initialState.doctorName,
    doctorLicense: bridge?.licenseNo || initialState.doctorLicense,
  });
}
