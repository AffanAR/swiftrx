import React from 'react';
import {
  afterWrite,
  api,
  type AllergyStatus,
  type Brand,
  type Catalog,
  type Diagnosis,
  type Investigation,
  type Patient,
  type PrescriptionDraft,
  type RxDesign,
  type RxMedication,
  type SafetyAlert,
  type SignedRx,
} from '@swiftrx/shared';
import { queryClient } from '../queryClient';
import { medicationFor } from './dosing';
import { evaluateAllMedications, findDrug } from './safety';

/** The signed-in doctor the pad prescribes as, taken from the portal session. */
export interface DoctorIdentity {
  id: string;
  email: string;
  name: string;
  licenseNo: string;
  hospitalSlug: string;
}

export interface NewPatientInput {
  name: string;
  age: number;
  sex: 'M' | 'F';
  weightKg: number;
  contact: string;
  allergyStatus: AllergyStatus;
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
  // Drugs, diagnoses, investigations and quick packs (empty until loadWorkspace)
  catalog: Catalog;
  // The hospital's printed Rx design (null until loadWorkspace)
  rxDesign: RxDesign | null;
  // Doctor (null until loadWorkspace)
  doctor: DoctorIdentity | null;
  // A sign or a new patient is being saved
  signing: boolean;
  savingPatient: boolean;
  // Active focused input (for tab/keyboard management)
  focusZone: 'patient' | 'diagnosis' | 'med-search' | 'med-row' | 'sign' | null;
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
  /** Saves a patient to the doctor's hospital and selects them. Resolves to the id, or '' if it failed. */
  createPatient: (input: NewPatientInput) => Promise<string>;
  setDiagnosisQuery: (q: string) => void;
  setDiagnosis: (d: Diagnosis | null) => void;
  setInvestigations: (list: Investigation[]) => void;
  toggleInvestigation: (inv: Investigation) => void;
  /** Add a generic, or one of its brands, with its starting dose. */
  addMedication: (drugId: string, brand?: Brand) => void;
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
   * Signs the current pad and saves it. Resolves to the signed Rx, or null if
   * it can't be signed yet or saving failed. Critical alerts need
   * `overrideReason` (see MIN_OVERRIDE_REASON); without it this opens the
   * override prompt instead.
   */
  sign: (overrideReason?: string) => Promise<SignedRx | null>;
  cancelOverride: () => void;
  /** Copies a previous Rx for the current patient onto the pad (see the action for merge rules). */
  repeatRx: (rx: SignedRx) => void;
}

export type AppStore = AppState & AppActions;

/** Shortest override reason accepted when signing past a critical alert. */
export const MIN_OVERRIDE_REASON = 10;

const newRowId = () => 'r_' + Math.random().toString(36).slice(2, 9);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Empty until loadWorkspace() loads the signed-in doctor's hospital:
// no default patients and no default doctor identity.
const initialState: AppState = {
  patients: [],
  patientId: '',
  diagnosis: null,
  diagnosisQuery: '',
  investigations: [],
  medications: [],
  signed: [],
  catalog: { drugs: [], brands: [], diagnoses: [], investigations: [], quickPacks: [] },
  rxDesign: null,
  doctor: null,
  signing: false,
  savingPatient: false,
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
      createPatient: async (input: NewPatientInput) => {
        // Patients always belong to the signed-in doctor's hospital — no fallback.
        const doctor = this.state.doctor;
        if (!doctor) {
          this.set({ banner: { kind: 'danger', text: 'Sign in as a doctor to add patients.' } });
          return '';
        }
        if (this.state.savingPatient) return '';
        this.set({ savingPatient: true });
        let p: Patient;
        try {
          p = await api.patients.create({ ...input, hospitalSlug: doctor.hospitalSlug });
        } catch (err) {
          this.set({
            savingPatient: false,
            banner: { kind: 'danger', text: `Couldn't add the patient: ${messageOf(err)}` },
          });
          return '';
        }
        this.set({
          patients: [...this.state.patients, p],
          patientId: p.id,
          diagnosis: null,
          diagnosisQuery: '',
          investigations: [],
          medications: [],
          activeRowId: null,
          showNewPatient: false,
          savingPatient: false,
        });
        void afterWrite.patientCreated(queryClient);
        return p.id;
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
      addMedication: (drugId: string, brand?: Brand) => {
        const drug = findDrug(drugId, this.state.catalog.drugs);
        if (!drug) return;
        const med: RxMedication = { rowId: newRowId(), ...medicationFor(drug, brand) };
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
      sign: async (overrideReason?: string) => {
        const s = this.state;
        // One save at a time: a second Sign & Print while the first is in flight does nothing.
        if (s.signing) return null;
        const patient = s.patients.find((p) => p.id === s.patientId);
        if (!patient || !s.diagnosis || !s.medications.length) {
          this.set({
            banner: {
              kind: 'warn',
              text: 'Need patient, diagnosis, and at least one medication to sign.',
            },
          });
          return null;
        }
        // Only the signed-in doctor can sign — there is no fallback identity.
        const doctor = s.doctor;
        if (!doctor || !doctor.licenseNo) {
          this.set({
            banner: {
              kind: 'danger',
              text: 'Only a signed-in doctor with a license number can sign.',
            },
          });
          return null;
        }
        const badRow = s.medications.findIndex(
          (m) => !(m.dosage.value > 0) || !(m.durationDays > 0),
        );
        if (badRow >= 0) {
          const m = s.medications[badRow];
          this.set({
            banner: {
              kind: 'danger',
              text: `Row ${badRow + 1} (${m.genericName}): dose and duration must be greater than 0.`,
            },
          });
          return null;
        }
        // Critical alerts (allergies) block signing until the doctor records
        // why they are overriding them.
        const critical = [
          ...evaluateAllMedications(s.medications, patient, s.catalog.drugs).values(),
        ]
          .flat()
          .filter((a) => a.severity === 'critical');
        const reason = overrideReason?.trim() ?? '';
        if (critical.length && reason.length < MIN_OVERRIDE_REASON) {
          this.set({ overridePrompt: critical });
          return null;
        }
        // The server assigns the id and time, stores a frozen copy of the
        // patient, and records the audit event.
        const draft: PrescriptionDraft = {
          hospitalSlug: patient.hospitalSlug,
          patient,
          diagnosis: s.diagnosis,
          medications: s.medications,
          investigations: s.investigations,
          doctorId: doctor.id,
          doctorName: doctor.name,
          doctorLicense: doctor.licenseNo,
          safetyOverride: critical.length ? { reason, alerts: critical } : undefined,
        };
        this.set({ signing: true });
        let signed: SignedRx;
        try {
          signed = await api.prescriptions.sign(draft, { id: doctor.id, email: doctor.email });
        } catch (err) {
          this.set({
            signing: false,
            banner: {
              kind: 'danger',
              text: `Couldn't save the prescription, so nothing was printed: ${messageOf(err)}`,
            },
          });
          return null;
        }
        void afterWrite.rxSigned(queryClient);
        this.set({
          signing: false,
          signed: [signed, ...this.state.signed],
          banner: critical.length
            ? {
                kind: 'warn',
                text: `Signed ${signed.id} for ${patient.name} with an allergy override.`,
              }
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
          diagnosisQuery: takeDiagnosis
            ? `${rx.diagnosis.code} ${rx.diagnosis.name}`
            : s.diagnosisQuery,
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
//  Workspace loading. The Rx pad is a portal route, so the doctor and hospital
//  come from the portal session (see RxPad.tsx). RxPad fetches the roster,
//  signed history and catalog through the data client and hands them in here.
// -----------------------------------------------------------------------------

/** What the pad needs for one hospital. */
export interface WorkspaceData {
  patients: Patient[];
  signed: SignedRx[];
  catalog: Catalog;
  rxDesign: RxDesign | null;
}

/**
 * Load the doctor's hospital into the store. RxPad calls this when its data
 * arrives and again whenever that data is refetched. The same doctor keeps
 * their in-progress pad, with the roster and history replaced so patients or
 * prescriptions added elsewhere in the portal show up. A different doctor or
 * hospital starts from a clean store.
 */
export function loadWorkspace(doctor: DoctorIdentity, data: WorkspaceData): void {
  const prev = store.state$;
  const { patients } = data;
  const sameDoctor =
    prev.doctor?.id === doctor.id && prev.doctor.hospitalSlug === doctor.hospitalSlug;
  if (sameDoctor) {
    const keepPatient = patients.some((p) => p.id === prev.patientId);
    store.set({
      doctor,
      ...data,
      patientId: keepPatient ? prev.patientId : (patients[0]?.id ?? ''),
    });
  } else {
    store.set({ ...initialState, doctor, ...data, patientId: patients[0]?.id ?? '' });
  }
}

/** Forget the doctor and their pad (on sign-out). */
export function resetWorkspace(): void {
  store.set({ ...initialState });
}
