import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, api, type Actor, type NewHospital, type NewPatient } from './api';
import { MOCK_AUDIT, MOCK_HOSPITALS, MOCK_PATIENTS, MOCK_SIGNED_RX } from './mockDb';

const AYESHA: Actor = { id: 'd_001', email: 'ayesha@city-hospital.com' };
const ADMIN: Actor = { id: 'u_admin_001', email: 'admin@swiftrx.com' };

// Writes change the mock db's module state; put it back after each test.
// Patients and hospitals are appended; signed Rx and audit events prepended.
let before = { hospitals: 0, patients: 0, rx: 0, audit: 0, usage: [] as number[] };
beforeEach(() => {
  before = {
    hospitals: MOCK_HOSPITALS.length,
    patients: MOCK_PATIENTS.length,
    rx: MOCK_SIGNED_RX.length,
    audit: MOCK_AUDIT.length,
    usage: MOCK_HOSPITALS.map((h) => h.monthlyRxUsed),
  };
});
afterEach(() => {
  MOCK_HOSPITALS.length = before.hospitals;
  MOCK_PATIENTS.length = before.patients;
  MOCK_SIGNED_RX.splice(0, MOCK_SIGNED_RX.length - before.rx);
  MOCK_AUDIT.splice(0, MOCK_AUDIT.length - before.audit);
  MOCK_HOSPITALS.forEach((h, i) => (h.monthlyRxUsed = before.usage[i]));
});

const newPatient = (patch: Partial<NewPatient> = {}): NewPatient => ({
  hospitalSlug: 'city-hospital',
  name: 'Test Patient',
  age: 0,
  sex: 'F',
  weightKg: 3.4,
  contact: '—',
  allergies: [],
  activeProblems: [],
  ...patch,
});

describe('reads', () => {
  it('answer with copies, so changing a result changes nothing stored', async () => {
    const [first] = await api.patients.list('city-hospital');
    first.name = 'Changed';
    first.allergies.push('Changed');

    const [again] = await api.patients.list('city-hospital');
    expect(again.name).not.toBe('Changed');
    expect(again.allergies).not.toContain('Changed');
  });

  it('never return a password hash', async () => {
    const users = [...(await api.users.list()), ...(await api.users.listDoctors('city-hospital'))];
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(u).not.toHaveProperty('passwordHash');
  });

  it("keep each hospital's data to that hospital", async () => {
    const city = 'city-hospital';
    expect((await api.patients.list(city)).every((p) => p.hospitalSlug === city)).toBe(true);
    expect((await api.prescriptions.list(city)).every((r) => r.hospitalSlug === city)).toBe(true);
    expect((await api.audit.list(city)).every((e) => e.hospitalSlug === city)).toBe(true);
    expect(
      (await api.users.listDoctors(city)).every(
        (u) => u.role === 'doctor' && u.hospitalSlug === city,
      ),
    ).toBe(true);
    expect(await api.hospitals.get('no-such-hospital')).toBeNull();
  });
});

describe('patients.create', () => {
  it('assigns the id and time, stores the patient and records who added them', async () => {
    // Age 0: infants are valid patients.
    const p = await api.patients.create(newPatient(), AYESHA);

    expect(p.id).toMatch(/^p_/);
    expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false);
    expect((await api.patients.list('city-hospital')).some((x) => x.id === p.id)).toBe(true);
    expect(MOCK_AUDIT[0]).toMatchObject({
      kind: 'create_patient',
      patientId: p.id,
      userId: 'd_001',
      hospitalSlug: 'city-hospital',
    });
  });

  it('refuses a patient without a name or weight', async () => {
    await expect(api.patients.create(newPatient({ name: '  ' }), AYESHA)).rejects.toMatchObject({
      status: 400,
    });
    await expect(api.patients.create(newPatient({ weightKg: 0 }), AYESHA)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(MOCK_PATIENTS.length).toBe(before.patients);
  });
});

describe('prescriptions.sign', () => {
  it('assigns each Rx its own id and time, stores it, counts it and audits it', async () => {
    const [patient] = await api.patients.list('city-hospital');
    const { diagnoses } = await api.catalog.get();
    const draft = {
      hospitalSlug: 'city-hospital',
      patient,
      diagnosis: diagnoses[0],
      medications: [],
      investigations: [],
      doctorId: 'd_001',
      doctorName: 'Dr. Ayesha Khan',
      doctorLicense: 'PMDC-44121',
    };
    const usedBefore = (await api.hospitals.get('city-hospital'))?.monthlyRxUsed ?? 0;

    // Two signs in the same millisecond must not share an id.
    const [a, b] = await Promise.all([
      api.prescriptions.sign(draft, AYESHA),
      api.prescriptions.sign(draft, AYESHA),
    ]);

    expect(a.id).not.toBe(b.id);
    expect(Number.isNaN(Date.parse(a.signedAt))).toBe(false);
    const ids = (await api.prescriptions.list('city-hospital')).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(MOCK_AUDIT.slice(0, 2).map((e) => e.kind)).toEqual(['sign_rx', 'sign_rx']);
    expect((await api.hospitals.get('city-hospital'))?.monthlyRxUsed).toBe(usedBefore + 2);
  });
});

describe('hospitals', () => {
  const input: NewHospital = {
    slug: 'test-clinic',
    name: 'Test Clinic',
    city: 'Lahore',
    country: 'PK',
    plan: 'starter',
    contactEmail: 'admin@test-clinic.com',
    monthlyRxCap: 200,
  };

  it('create provisions a trial hospital, records who did it, and refuses a taken slug', async () => {
    const h = await api.hospitals.create(input, ADMIN);

    expect(h).toMatchObject({ slug: 'test-clinic', status: 'trial', monthlyRxUsed: 0 });
    expect(h.rxDesign.headerTitle).toBe('Test Clinic');
    expect(MOCK_AUDIT[0]).toMatchObject({
      kind: 'create_hospital',
      hospitalSlug: 'test-clinic',
      userId: 'u_admin_001',
    });
    await expect(api.hospitals.create(input, ADMIN)).rejects.toMatchObject({ status: 409 });
  });

  it('updateSettings saves the features and design, and 404s for an unknown hospital', async () => {
    const original = await api.hospitals.get('city-hospital');
    if (!original) throw new Error('city-hospital is missing from the seed');
    const features = {
      ...original.features,
      enableQuickPacks: !original.features.enableQuickPacks,
    };
    const rxDesign = { ...original.rxDesign, headerTitle: 'Renamed for the test' };

    const saved = await api.hospitals.updateSettings('city-hospital', { features, rxDesign });
    expect(saved.features.enableQuickPacks).toBe(features.enableQuickPacks);
    expect((await api.hospitals.get('city-hospital'))?.rxDesign.headerTitle).toBe(
      'Renamed for the test',
    );

    await api.hospitals.updateSettings('city-hospital', {
      features: original.features,
      rxDesign: original.rxDesign,
    });
    await expect(
      api.hospitals.updateSettings('no-such-hospital', { features, rxDesign }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
