import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_DIAGNOSES,
  MOCK_HOSPITALS,
  MOCK_PATIENTS,
  MOCK_SIGNED_RX,
  api,
  type Diagnosis,
  type NewPatient,
  type Patient,
  type SignedRx,
} from '@swiftrx/shared';
import { demoCatalog } from '@swiftrx/shared/seedData';
import {
  actions,
  getState,
  loadWorkspace,
  previousRxForPatient,
  resetWorkspace,
  store,
  type DoctorIdentity,
  type WorkspaceData,
} from './store';

// Generic ids from the Bangladesh list (scripts/bd-medicines/reviewed.json).
const AMLODIPINE = 'g62';
const AMOXICILLIN = 'g69';
const LISINOPRIL = 'g691';

// Seed doctors and patients from apps/shared/src/seed/. City Hospital's
// p_001 (Bilal) is allergic to penicillin; p_002 (Fatima) has no allergies.
const AYESHA: DoctorIdentity = {
  id: 'd_001',
  email: 'ayesha@city-hospital.com',
  name: 'Dr. Ayesha Khan',
  licenseNo: 'BMDC A-44121',
  hospitalSlug: 'city-hospital',
};
const SANA: DoctorIdentity = {
  id: 'd_003',
  email: 'sana@northstar-medical.com',
  name: 'Dr. Sana Iqbal',
  licenseNo: 'BMDC A-37890',
  hospitalSlug: 'northstar-medical',
};

/**
 * What RxPad fetches for a hospital. It all comes from the server, so here
 * from the seed the server loads.
 */
async function workspaceFor(slug: string): Promise<WorkspaceData> {
  const hospital = MOCK_HOSPITALS.find((h) => h.slug === slug);
  return {
    patients: structuredClone(MOCK_PATIENTS.filter((p) => p.hospitalSlug === slug)),
    signed: structuredClone(MOCK_SIGNED_RX.filter((r) => r.hospitalSlug === slug)),
    catalog: demoCatalog(),
    rxDesign: hospital?.rxDesign ?? null,
  };
}

/**
 * Stands in for POST /hospitals/:slug/prescriptions, which the API's own
 * tests cover: it answers with the draft signed, as the server would.
 */
function serverSigns() {
  return vi.spyOn(api.prescriptions, 'sign').mockImplementation(async (slug, draft) => ({
    id: 'rx_test',
    signedAt: '2026-11-03T08:00:00.000Z',
    hospitalSlug: slug,
    patient: MOCK_PATIENTS.find((p) => p.id === draft.patientId)!,
    diagnosis: MOCK_DIAGNOSES.find((d) => d.code === draft.diagnosisCode)!,
    medications: draft.medications,
    investigations: draft.investigations,
    doctorId: AYESHA.id,
    doctorName: AYESHA.name,
    doctorLicense: AYESHA.licenseNo,
    ...(draft.overrideReason
      ? {
          safetyOverride: {
            reason: draft.overrideReason,
            alerts: [
              { severity: 'critical' as const, type: 'allergy' as const, message: '', drugId: '' },
            ],
          },
        }
      : {}),
    recordHash: 'a'.repeat(64),
  }));
}

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

beforeEach(async () => {
  resetWorkspace();
  loadWorkspace(AYESHA, await workspaceFor('city-hospital'));
});

afterEach(() => {
  MOCK_PATIENTS.length = patientsBefore;
  vi.restoreAllMocks();
});

describe('loadWorkspace', () => {
  it("loads only the doctor's hospital and selects its first patient", () => {
    const s = getState();
    expect(s.doctor).toEqual(AYESHA);
    expect(s.patients.length).toBeGreaterThan(0);
    expect(s.patients.every((p) => p.hospitalSlug === 'city-hospital')).toBe(true);
    expect(s.signed.every((r) => r.hospitalSlug === 'city-hospital')).toBe(true);
    expect(s.patientId).toBe(s.patients[0].id);
    expect(s.catalog.drugs.length).toBeGreaterThan(0);
    expect(s.rxDesign).not.toBeNull();
  });

  it('keeps the pad for the same doctor but takes the new roster', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);
    const added: Patient = { ...getState().patients[0], id: 'p_added', name: 'Added Elsewhere' };
    MOCK_PATIENTS.push(added);

    loadWorkspace({ ...AYESHA }, await workspaceFor('city-hospital'));

    const s = getState();
    expect(s.patientId).toBe('p_002');
    expect(s.medications.map((m) => m.drugId)).toEqual([AMLODIPINE]);
    expect(s.patients.some((p) => p.id === 'p_added')).toBe(true);
  });

  it('starts from a clean pad for a different doctor', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);
    loadWorkspace(SANA, await workspaceFor('northstar-medical'));

    const s = getState();
    expect(s.medications).toEqual([]);
    expect(s.diagnosis).toBeNull();
    expect(s.patients.every((p) => p.hospitalSlug === 'northstar-medical')).toBe(true);
  });
});

describe('addMedication', () => {
  it('adds a brand with its strength, form and dose', () => {
    const napa = getState().catalog.brands.find(
      (b) => b.name === 'Napa' && b.form === 'Tablet' && b.strength === '500 mg',
    )!;
    actions.addMedication(napa.drugId, napa);
    expect(getState().medications).toEqual([
      expect.objectContaining({
        genericName: 'Paracetamol',
        brandName: 'Napa',
        form: 'Tablet',
        strength: '500 mg',
        dosage: { value: 500, unit: 'mg' },
      }),
    ]);
  });

  it('ignores a drug that is not in the catalog', () => {
    actions.addMedication('not-a-drug');
    expect(getState().medications).toEqual([]);
  });
});

describe('sign', () => {
  it('refuses an incomplete pad', async () => {
    expect(await actions.sign()).toBeNull();
    expect(getState().banner).toMatchObject({ kind: 'warn' });
  });

  it('sends the pad to the server as ids and rows, and clears it once signed', async () => {
    const save = serverSigns();
    fillPad('p_002', 'I10', [AMLODIPINE]);
    const rx = await actions.sign();

    expect(save).toHaveBeenCalledWith('city-hospital', {
      patientId: 'p_002',
      diagnosisCode: 'I10',
      medications: [expect.objectContaining({ drugId: AMLODIPINE })],
      investigations: expect.any(Array),
    });
    expect(rx).toMatchObject({
      hospitalSlug: 'city-hospital',
      doctorId: 'd_001',
      doctorName: 'Dr. Ayesha Khan',
      doctorLicense: 'BMDC A-44121',
      patient: { id: 'p_002' },
    });
    expect(rx?.safetyOverride).toBeUndefined();
    expect(getState().signed[0]).toBe(rx);
    expect(getState().medications).toEqual([]);
    expect(getState().diagnosis).toBeNull();
    expect(getState().signing).toBe(false);
  });

  it('refuses a dose or duration of 0', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);
    const row = getState().medications[0];

    actions.updateMedication(row.rowId, { dosage: { ...row.dosage, value: 0 } });
    expect(await actions.sign()).toBeNull();
    expect(getState().banner?.text).toContain('Row 1 (Amlodipine Besilate)');

    actions.updateMedication(row.rowId, { dosage: { ...row.dosage, value: 5 }, durationDays: 0 });
    expect(await actions.sign()).toBeNull();
  });

  it('needs an override reason before signing past an allergy alert', async () => {
    const save = serverSigns();
    fillPad('p_001', 'J02.9', [AMOXICILLIN]);

    expect(await actions.sign()).toBeNull();
    expect(getState().overridePrompt?.map((a) => a.type)).toEqual(['allergy']);
    expect(await actions.sign('too short')).toBeNull();
    expect(save).not.toHaveBeenCalled();

    const reason = 'Mild rash only on record; patient consents';
    const rx = await actions.sign(reason);
    expect(save).toHaveBeenCalledWith(
      'city-hospital',
      expect.objectContaining({ overrideReason: reason }),
    );
    expect(rx?.safetyOverride?.reason).toBe(reason);
    expect(getState().overridePrompt).toBeNull();
  });

  it('refuses to sign without a doctor, or for a doctor without a license number', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);

    store.set({ doctor: null });
    expect(await actions.sign()).toBeNull();
    expect(getState().banner).toMatchObject({ kind: 'danger' });

    store.set({ doctor: { ...AYESHA, licenseNo: '' } });
    expect(await actions.sign()).toBeNull();
  });

  it('does nothing while a sign is still being saved', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);
    const save = vi.spyOn(api.prescriptions, 'sign');
    store.set({ signing: true });

    expect(await actions.sign()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(getState().medications).toHaveLength(1);
  });

  it('keeps the pad and says why when saving fails', async () => {
    fillPad('p_002', 'I10', [AMLODIPINE]);
    vi.spyOn(api.prescriptions, 'sign').mockRejectedValueOnce(new Error('network down'));

    expect(await actions.sign()).toBeNull();
    const s = getState();
    expect(s.banner).toMatchObject({ kind: 'danger' });
    expect(s.banner?.text).toContain('network down');
    expect(s.medications.map((m) => m.drugId)).toEqual([AMLODIPINE]);
    expect(s.signing).toBe(false);
  });
});

describe('createPatient', () => {
  const input = {
    name: 'New Patient',
    age: 30,
    sex: 'F' as const,
    weightKg: 55,
    contact: '—',
    allergyStatus: 'not_recorded' as const,
    allergies: [],
    activeProblems: [],
  };

  /** The server's answer to POST /hospitals/:slug/patients. */
  const saved = (patient: NewPatient): Patient => ({
    ...patient,
    id: 'p_new',
    activeMedications: [],
    recentVitals: [],
    createdAt: '2026-11-01T00:00:00.000Z',
  });

  it("adds the patient to the doctor's hospital, selects them and closes the form", async () => {
    const create = vi.spyOn(api.patients, 'create').mockImplementation(async (p) => saved(p));
    actions.openNewPatient();
    const id = await actions.createPatient(input);

    expect(create).toHaveBeenCalledWith({ ...input, hospitalSlug: 'city-hospital' });
    const s = getState();
    expect(id).toBe('p_new');
    expect(s.patientId).toBe(id);
    expect(s.showNewPatient).toBe(false);
    expect(s.savingPatient).toBe(false);
    expect(s.patients.find((p) => p.id === id)?.hospitalSlug).toBe('city-hospital');
  });

  it('refuses without a signed-in doctor', async () => {
    const create = vi.spyOn(api.patients, 'create');
    store.set({ doctor: null });
    expect(await actions.createPatient(input)).toBe('');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps the form open and says why when saving fails', async () => {
    actions.openNewPatient();
    vi.spyOn(api.patients, 'create').mockRejectedValueOnce(new Error('network down'));

    expect(await actions.createPatient(input)).toBe('');
    const s = getState();
    expect(s.showNewPatient).toBe(true);
    expect(s.savingPatient).toBe(false);
    expect(s.banner?.text).toContain('network down');
  });
});

describe('setPatient', () => {
  it('clears the pad and the diagnosis search when switching patients', () => {
    fillPad('p_001', 'I10', [AMLODIPINE]);
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
    expect(s.medications.map((m) => m.drugId)).toEqual([LISINOPRIL, AMLODIPINE]);
    expect(s.medications.map((m) => m.rowId)).not.toEqual(seed().medications.map((m) => m.rowId));
  });

  it('keeps the current diagnosis and skips medicines already on the pad', () => {
    fillPad('p_001', 'E11.9', [AMLODIPINE]);
    actions.repeatRx(seed());

    const s = getState();
    expect(s.diagnosis?.code).toBe('E11.9');
    expect(s.medications.map((m) => m.drugId)).toEqual([AMLODIPINE, LISINOPRIL]);
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
