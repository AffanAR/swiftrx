import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type NewPatient } from './api';
import { onSessionEnded } from './http';
import { MOCK_HOSPITALS } from './mockDb';
import type { PrescriptionDraft } from './types';

afterEach(() => vi.unstubAllGlobals());

/** Make every fetch answer `body` with `status`, and return the stub to inspect. */
function serverAnswers(body: unknown, status = 200) {
  const stub = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', stub);
  return stub;
}

describe('users.list (still from the seed)', () => {
  it('answers with copies and no password hash', async () => {
    const [first] = await api.users.list();
    first.name = 'Changed';
    const [again] = await api.users.list();
    expect(again.name).not.toBe('Changed');
    for (const u of await api.users.list()) expect(u).not.toHaveProperty('passwordHash');
  });
});

describe('hospitals and patients', () => {
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

  it("save a hospital's settings and status with PATCH", async () => {
    const stub = serverAnswers({ slug: 'city-hospital' });
    const city = MOCK_HOSPITALS.find((h) => h.slug === 'city-hospital')!;
    await api.hospitals.updateSettings('city-hospital', {
      features: city.features,
      rxDesign: city.rxDesign,
    });
    await api.hospitals.setStatus('city-hospital', 'suspended');
    expect(stub.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ['/api/hospitals/city-hospital', 'PATCH'],
      ['/api/hospitals/city-hospital/status', 'PATCH'],
    ]);
    expect(JSON.parse(String(stub.mock.calls[1][1]?.body))).toEqual({ status: 'suspended' });
  });

  it('pass on what the server refuses', async () => {
    serverAnswers({ error: 'name: Too small' }, 400);
    await expect(api.hospitals.list()).rejects.toMatchObject({
      status: 400,
      message: 'name: Too small',
    });
  });
});

describe('prescriptions', () => {
  it("list one hospital's, or every hospital's", async () => {
    const stub = serverAnswers([]);
    await api.prescriptions.list('city-hospital');
    await api.prescriptions.list();
    expect(stub.mock.calls.map((c) => c[0])).toEqual([
      '/api/hospitals/city-hospital/prescriptions',
      '/api/prescriptions',
    ]);
  });

  it('sign by sending the draft to the hospital, and pass on a refusal', async () => {
    const stub = serverAnswers({ id: 'rx_1' }, 201);
    const draft: PrescriptionDraft = {
      patientId: 'p_002',
      diagnosisCode: 'I10',
      medications: [],
      investigations: [],
    };
    expect(await api.prescriptions.sign('city-hospital', draft)).toEqual({ id: 'rx_1' });
    const [url, init] = stub.mock.calls[0];
    expect(url).toBe('/api/hospitals/city-hospital/prescriptions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(draft);

    serverAnswers({ error: 'This hospital has reached its limit.' }, 409);
    await expect(api.prescriptions.sign('city-hospital', draft)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('other reads from the server', () => {
  it("ask the API for a hospital's doctors and audit log", async () => {
    const stub = serverAnswers([]);
    await api.users.listDoctors('city-hospital');
    await api.audit.list('city-hospital');
    await api.audit.list();
    expect(stub.mock.calls.map((c) => c[0])).toEqual([
      '/api/hospitals/city-hospital/doctors',
      '/api/hospitals/city-hospital/audit-events',
      '/api/audit-events',
    ]);
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
