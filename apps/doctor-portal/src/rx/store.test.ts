import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MOCK_AUDIT,
  MOCK_DIAGNOSES,
  MOCK_PATIENTS,
  type Diagnosis,
  type Patient,
  type SignedRx,
} from '@swiftrx/shared';
import {
  actions,
  getState,
  loadWorkspace,
  previousRxForPatient,
  resetWorkspace,
  store,
  type DoctorIdentity,
} from './store';

// Seed doctors and patients from apps/shared/src/mockDb.ts. City Hospital's
// p_001 (Bilal) is allergic to penicillin; p_002 (Fatima) has no allergies.
const AYESHA: DoctorIdentity = {
  id: 'd_001',
  email: 'ayesha@city-hospital.com',
  name: 'Dr. Ayesha Khan',
  licenseNo: 'PMDC-44121',
  hospitalSlug: 'city-hospital',
};
const SANA: DoctorIdentity = {
  id: 'd_003',
  email: 'sana@northstar-medical.com',
  name: 'Dr. Sana Iqbal',
  licenseNo: 'PMDC-37890',
  hospitalSlug: 'northstar-medical',
};

const dx = (code: string): Diagnosis => {
  const d = MOCK_DIAGNOSES.find((x) => x.code === code);
  if (!d) throw new Error(`No diagnosis ${code}`);
  return d;
};

/** Select a patient, set a diagnosis and add catalog drugs with their default doses. */
function fillPad(patientId: string, code: string, drugIds: string[]) {
  actions.setPatient(patientId);
  actions.setDiagnosis(dx(code));
  for (const id of drugIds) actions.addMedication(id);
}

// The mock db is shared module state; remove anything a test adds to it.
const patientsBefore = MOCK_PATIENTS.length;

beforeEach(() => {
  resetWorkspace();
  loadWorkspace(AYESHA);
});

afterEach(() => {
  MOCK_PATIENTS.length = patientsBefore;
});

describe('loadWorkspace', () => {
  it("loads only the doctor's hospital and selects its first patient", () => {
    const s = getState();
    expect(s.doctor).toEqual(AYESHA);
    expect(s.patients.length).toBeGreaterThan(0);
    expect(s.patients.every((p) => p.hospitalSlug === 'city-hospital')).toBe(true);
    expect(s.signed.every((r) => r.hospitalSlug === 'city-hospital')).toBe(true);
    expect(s.patientId).toBe(s.patients[0].id);
  });

  it('keeps the pad for the same doctor but re-reads the roster', () => {
    fillPad('p_002', 'I10', ['amlo']);
    const added: Patient = { ...getState().patients[0], id: 'p_added', name: 'Added Elsewhere' };
    MOCK_PATIENTS.push(added);

    loadWorkspace({ ...AYESHA });

    const s = getState();
    expect(s.patientId).toBe('p_002');
    expect(s.medications.map((m) => m.drugId)).toEqual(['amlo']);
    expect(s.patients.some((p) => p.id === 'p_added')).toBe(true);
  });

  it('starts from a clean pad for a different doctor', () => {
    fillPad('p_002', 'I10', ['amlo']);
    loadWorkspace(SANA);

    const s = getState();
    expect(s.medications).toEqual([]);
    expect(s.diagnosis).toBeNull();
    expect(s.patients.every((p) => p.hospitalSlug === 'northstar-medical')).toBe(true);
  });
});

describe('sign', () => {
  it('refuses an incomplete pad', () => {
    expect(actions.sign()).toBeNull();
    expect(getState().banner).toMatchObject({ kind: 'warn' });
  });

  it('signs a complete pad as the signed-in doctor, records it and clears the pad', () => {
    fillPad('p_002', 'I10', ['amlo']);
    const rx = actions.sign();

    expect(rx).toMatchObject({
      hospitalSlug: 'city-hospital',
      doctorId: 'd_001',
      doctorName: 'Dr. Ayesha Khan',
      doctorLicense: 'PMDC-44121',
      patient: { id: 'p_002' },
    });
    expect(rx?.safetyOverride).toBeUndefined();
    expect(getState().signed[0]).toBe(rx);
    expect(getState().medications).toEqual([]);
    expect(getState().diagnosis).toBeNull();
    expect(MOCK_AUDIT[0]).toMatchObject({ kind: 'sign_rx', rxId: rx?.id, userId: 'd_001' });
  });

  it('refuses a dose or duration of 0', () => {
    fillPad('p_002', 'I10', ['amlo']);
    const row = getState().medications[0];

    actions.updateMedication(row.rowId, { dosage: { ...row.dosage, value: 0 } });
    expect(actions.sign()).toBeNull();
    expect(getState().banner?.text).toContain('Row 1 (Amlodipine)');

    actions.updateMedication(row.rowId, { dosage: { ...row.dosage, value: 5 }, durationDays: 0 });
    expect(actions.sign()).toBeNull();
  });

  it('needs an override reason before signing past an allergy alert', () => {
    fillPad('p_001', 'J02.9', ['amox']);

    expect(actions.sign()).toBeNull();
    expect(getState().overridePrompt?.map((a) => a.type)).toEqual(['allergy']);
    expect(actions.sign('too short')).toBeNull();

    const reason = 'Mild rash only on record; patient consents';
    const rx = actions.sign(reason);
    expect(rx?.safetyOverride?.reason).toBe(reason);
    expect(rx?.safetyOverride?.alerts).toHaveLength(1);
    expect(getState().overridePrompt).toBeNull();
    expect(MOCK_AUDIT[0]).toMatchObject({ kind: 'sign_rx', overrideReason: reason });
  });

  it('refuses to sign without a doctor, or for a doctor without a license number', () => {
    fillPad('p_002', 'I10', ['amlo']);

    store.set({ doctor: null });
    expect(actions.sign()).toBeNull();
    expect(getState().banner).toMatchObject({ kind: 'danger' });

    store.set({ doctor: { ...AYESHA, licenseNo: '' } });
    expect(actions.sign()).toBeNull();
  });
});

describe('createPatient', () => {
  const input = {
    name: 'New Patient',
    age: 30,
    sex: 'F' as const,
    weightKg: 55,
    contact: '—',
    allergies: [],
    activeProblems: [],
  };

  it("adds the patient to the doctor's hospital, selects them and closes the form", () => {
    actions.openNewPatient();
    const id = actions.createPatient(input);

    const s = getState();
    expect(s.patientId).toBe(id);
    expect(s.showNewPatient).toBe(false);
    expect(s.patients.find((p) => p.id === id)?.hospitalSlug).toBe('city-hospital');
    expect(MOCK_AUDIT[0]).toMatchObject({ kind: 'create_patient', patientId: id, userId: 'd_001' });
  });

  it('refuses without a signed-in doctor', () => {
    store.set({ doctor: null });
    expect(actions.createPatient(input)).toBe('');
    expect(MOCK_PATIENTS.length).toBe(patientsBefore);
  });
});

describe('setPatient', () => {
  it('clears the pad and the diagnosis search when switching patients', () => {
    fillPad('p_001', 'I10', ['amlo']);
    actions.setPatient('p_002');

    const s = getState();
    expect(s.diagnosis).toBeNull();
    expect(s.diagnosisQuery).toBe('');
    expect(s.medications).toEqual([]);
    expect(s.investigations).toEqual([]);
  });
});

describe('repeatRx', () => {
  // Seed Rx for Bilal: I10, Lisinopril + Amlodipine, BMP.
  const seed = (): SignedRx => {
    const rx = getState().signed.find((r) => r.id === 'rx_seed_001');
    if (!rx) throw new Error('Seed prescription rx_seed_001 not loaded');
    return rx;
  };

  it('copies the diagnosis, tests and medicines onto an empty pad', () => {
    actions.setPatient('p_001');
    actions.repeatRx(seed());

    const s = getState();
    expect(s.diagnosis?.code).toBe('I10');
    expect(s.investigations.map((i) => i.code)).toEqual(['BMP']);
    expect(s.medications.map((m) => m.drugId)).toEqual(['lisinopril', 'amlo']);
    expect(s.medications.map((m) => m.rowId)).not.toEqual(seed().medications.map((m) => m.rowId));
  });

  it('keeps the current diagnosis and skips medicines already on the pad', () => {
    fillPad('p_001', 'E11.9', ['amlo']);
    actions.repeatRx(seed());

    const s = getState();
    expect(s.diagnosis?.code).toBe('E11.9');
    expect(s.medications.map((m) => m.drugId)).toEqual(['amlo', 'lisinopril']);
    expect(s.banner?.text).toContain('1 med added, 1 already on the pad');
  });

  it("ignores another patient's prescription", () => {
    actions.setPatient('p_002');
    actions.repeatRx(seed());
    expect(getState().medications).toEqual([]);
    expect(getState().diagnosis).toBeNull();
  });
});

describe('previousRxForPatient', () => {
  it("returns only that patient's prescriptions, newest first", () => {
    const at = (id: string, patientId: string, signedAt: string) =>
      ({ id, signedAt, patient: { id: patientId } }) as SignedRx;
    const list = [
      at('old', 'p1', '2026-01-01T00:00:00.000Z'),
      at('other', 'p2', '2026-06-01T00:00:00.000Z'),
      at('new', 'p1', '2026-03-01T00:00:00.000Z'),
    ];
    expect(previousRxForPatient(list, 'p1').map((r) => r.id)).toEqual(['new', 'old']);
  });
});
