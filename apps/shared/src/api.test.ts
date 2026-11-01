import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type Actor, type NewPatient, type PrescriptionDraft } from './api';
import { onSessionEnded } from './http';
import {
  MOCK_AUDIT,
  MOCK_DIAGNOSES,
  MOCK_HOSPITALS,
  MOCK_PATIENTS,
  MOCK_SIGNED_RX,
} from './mockDb';

const AYESHA: Actor = { id: 'd_001', email: 'ayesha@city-hospital.com' };

// Signing changes the mock db's module state; put it back after each test.
// Signed Rx and audit events are prepended.
let before = { rx: 0, audit: 0, usage: [] as number[] };
beforeEach(() => {
  before = {
    rx: MOCK_SIGNED_RX.length,
    audit: MOCK_AUDIT.length,
    usage: MOCK_HOSPITALS.map((h) => h.monthlyRxUsed),
  };
});
afterEach(() => {
  MOCK_SIGNED_RX.splice(0, MOCK_SIGNED_RX.length - before.rx);
  MOCK_AUDIT.splice(0, MOCK_AUDIT.length - before.audit);
  MOCK_HOSPITALS.forEach((h, i) => (h.monthlyRxUsed = before.usage[i]));
  vi.unstubAllGlobals();
});

const draft = (): PrescriptionDraft => ({
  hospitalSlug: 'city-hospital',
  patient: MOCK_PATIENTS.find((p) => p.hospitalSlug === 'city-hospital')!,
  diagnosis: MOCK_DIAGNOSES[0],
  medications: [],
  investigations: [],
  doctorId: 'd_001',
  doctorName: 'Dr. Ayesha Khan',
  doctorLicense: 'PMDC-44121',
});

/** Make every fetch answer `body` with `status`, and return the stub to inspect. */
function serverAnswers(body: unknown, status = 200) {
  const stub = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', stub);
  return stub;
}

describe('mock reads', () => {
  it('answer with copies, so changing a result changes nothing stored', async () => {
    const [first] = await api.prescriptions.list('city-hospital');
    first.patient.name = 'Changed';

    const [again] = await api.prescriptions.list('city-hospital');
    expect(again.patient.name).not.toBe('Changed');
  });

  it('never return a password hash', async () => {
    const users = await api.users.list();
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(u).not.toHaveProperty('passwordHash');
  });

  it("keep each hospital's prescriptions to that hospital", async () => {
    const city = 'city-hospital';
    expect((await api.prescriptions.list(city)).every((r) => r.hospitalSlug === city)).toBe(true);
  });
});

describe('prescriptions.sign', () => {
  it('assigns each Rx its own id and time, stores it, counts it and audits it', async () => {
    const city = MOCK_HOSPITALS.find((h) => h.slug === 'city-hospital')!;
    const usedBefore = city.monthlyRxUsed;

    // Two signs in the same millisecond must not share an id.
    const [a, b] = await Promise.all([
      api.prescriptions.sign(draft(), AYESHA),
      api.prescriptions.sign(draft(), AYESHA),
    ]);

    expect(a.id).not.toBe(b.id);
    expect(Number.isNaN(Date.parse(a.signedAt))).toBe(false);
    const ids = (await api.prescriptions.list('city-hospital')).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(MOCK_AUDIT.slice(0, 2).map((e) => e.kind)).toEqual(['sign_rx', 'sign_rx']);
    expect(city.monthlyRxUsed).toBe(usedBefore + 2);
  });
});

describe('hospitals and patients, from the server', () => {
  it('read from their endpoints', async () => {
    const stub = serverAnswers([]);
    await api.hospitals.list();
    await api.hospitals.get('city-hospital');
    await api.hospitals.profile('city-hospital');
    await api.patients.list('city-hospital');
    expect(stub.mock.calls.map((c) => c[0])).toEqual([
      '/api/hospitals',
      '/api/hospitals/city-hospital',
      '/api/hospitals/city-hospital/profile',
      '/api/hospitals/city-hospital/patients',
    ]);
  });

  it('answer null for an unknown hospital', async () => {
    serverAnswers({ error: 'No such hospital.' }, 404);
    expect(await api.hospitals.get('no-such-hospital')).toBeNull();
    expect(await api.hospitals.profile('no-such-hospital')).toBeNull();
  });

  it("add a patient at the patient's hospital, sending the rest as the body", async () => {
    const stub = serverAnswers({ id: 'p_new' }, 201);
    const patient: NewPatient = {
      hospitalSlug: 'city-hospital',
      name: 'Rahima Begum',
      age: 0, // infants are valid patients
      sex: 'F',
      weightKg: 3.4,
      contact: '—',
      allergyStatus: 'none_known',
      allergies: [],
      activeProblems: [],
    };
    expect(await api.patients.create(patient)).toEqual({ id: 'p_new' });

    const [url, init] = stub.mock.calls[0];
    expect(url).toBe('/api/hospitals/city-hospital/patients');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ ...patient, hospitalSlug: undefined });
  });

  it("save a hospital's settings with PATCH", async () => {
    const stub = serverAnswers({ slug: 'city-hospital' });
    const city = MOCK_HOSPITALS.find((h) => h.slug === 'city-hospital')!;
    await api.hospitals.updateSettings('city-hospital', {
      features: city.features,
      rxDesign: city.rxDesign,
    });
    expect(stub.mock.calls[0][0]).toBe('/api/hospitals/city-hospital');
    expect(stub.mock.calls[0][1]?.method).toBe('PATCH');
  });

  it('pass on what the server refuses', async () => {
    serverAnswers({ error: 'name: Too small' }, 400);
    await expect(api.hospitals.list()).rejects.toMatchObject({
      status: 400,
      message: 'name: Too small',
    });
  });
});

describe('other reads from the server', () => {
  it("ask the API for a hospital's doctors", async () => {
    const stub = serverAnswers([{ id: 'd_001' }]);
    expect(await api.users.listDoctors('city-hospital')).toEqual([{ id: 'd_001' }]);
    expect(stub.mock.calls[0][0]).toBe('/api/hospitals/city-hospital/doctors');
  });

  it("merge the server's audit log with what this tab wrote, newest first", async () => {
    const rx = await api.prescriptions.sign(draft(), AYESHA);
    const fromServer = {
      kind: 'login',
      userId: 'd_001',
      userEmail: AYESHA.email,
      at: '2000-01-01T00:00:00.000Z',
      hospitalSlug: 'city-hospital',
    };
    const stub = serverAnswers([fromServer]);
    const events = await api.audit.list('city-hospital');
    expect(stub.mock.calls[0][0]).toBe('/api/hospitals/city-hospital/audit-events');
    expect(events[0]).toMatchObject({ kind: 'sign_rx', rxId: rx.id });
    expect(events.at(-1)).toEqual(fromServer);
    // Another hospital's log leaves this tab's City Hospital write out.
    serverAnswers([]);
    expect(await api.audit.list('northstar-medical')).toEqual([]);
  });

  it('throw ApiError with the status, and announce a 401', async () => {
    serverAnswers({ error: 'Sign in first.' }, 401);
    const ended = vi.fn();
    const stop = onSessionEnded(ended);
    await expect(api.audit.list()).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledOnce();
    stop();
  });
});
