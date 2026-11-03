import { describe, expect, it } from 'vitest';

import {
  auditEventSchema,
  hospitalSchema,
  patientSchema,
  signedRxSchema,
  userSchema,
} from './schemas';
import { MOCK_AUDIT, MOCK_HOSPITALS, MOCK_PATIENTS, MOCK_SIGNED_RX, MOCK_USERS } from './seedData';

describe('schemas', () => {
  it('accept the seed data unchanged', () => {
    for (const h of MOCK_HOSPITALS) expect(hospitalSchema.parse(h)).toEqual(h);
    for (const u of MOCK_USERS) expect(userSchema.parse(u)).toEqual(u);
    for (const p of MOCK_PATIENTS) expect(patientSchema.parse(p)).toEqual(p);
    for (const rx of MOCK_SIGNED_RX) expect(signedRxSchema.parse(rx)).toEqual(rx);
    for (const e of MOCK_AUDIT) expect(auditEventSchema.parse(e)).toEqual(e);
  });

  it('reject a slug that would not work as a subdomain', () => {
    for (const slug of ['City Hospital', 'city--hospital', '-city', 'CITY']) {
      expect(hospitalSchema.safeParse({ ...MOCK_HOSPITALS[0], slug }).success).toBe(false);
    }
  });

  it('reject an accent color the print template would refuse', () => {
    const hospital = MOCK_HOSPITALS[0];
    const rxDesign = { ...hospital.rxDesign, accentColor: 'red;background:url(x)' };
    expect(hospitalSchema.safeParse({ ...hospital, rxDesign }).success).toBe(false);
  });

  it('tie platform admins, and only them, to no hospital', () => {
    const admin = MOCK_USERS.find((u) => u.role === 'platform_admin')!;
    const doctor = MOCK_USERS.find((u) => u.role === 'doctor')!;
    expect(userSchema.safeParse({ ...admin, hospitalSlug: 'city-hospital' }).success).toBe(false);
    expect(userSchema.safeParse({ ...doctor, hospitalSlug: null }).success).toBe(false);
  });

  it('allow a newborn, but not a birth date in the future or a weightless patient', () => {
    const p = MOCK_PATIENTS[0];
    const today = new Date().toISOString().slice(0, 10);
    expect(patientSchema.safeParse({ ...p, dateOfBirth: today }).success).toBe(true);
    expect(patientSchema.safeParse({ ...p, dateOfBirth: '3000-01-01' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...p, dateOfBirth: '01/02/1990' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...p, weightKg: 0 }).success).toBe(false);
  });

  it('keep pregnancy and kidney facts consistent', () => {
    const man = MOCK_PATIENTS.find((x) => x.sex === 'M')!;
    const woman = MOCK_PATIENTS.find((x) => x.sex === 'F')!;
    expect(patientSchema.safeParse({ ...man, pregnancy: 'pregnant' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...woman, pregnancy: 'pregnant' }).success).toBe(true);
    // An eGFR of 45 is "moderate", whatever the band says, unless on dialysis.
    expect(patientSchema.safeParse({ ...woman, egfr: 45, kidney: 'normal' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...woman, egfr: 45, kidney: 'moderate' }).success).toBe(true);
    expect(patientSchema.safeParse({ ...woman, egfr: 8, kidney: 'dialysis' }).success).toBe(true);
  });

  it('reject a prescription with a zero dose, no medications or an empty override reason', () => {
    const rx = MOCK_SIGNED_RX[0];
    const zeroDose = rx.medications.map((m) => ({ ...m, dosage: { ...m.dosage, value: 0 } }));
    expect(signedRxSchema.safeParse({ ...rx, medications: zeroDose }).success).toBe(false);
    expect(signedRxSchema.safeParse({ ...rx, medications: [] }).success).toBe(false);
    expect(
      signedRxSchema.safeParse({
        ...rx,
        safetyOverride: {
          reason: '   ',
          alerts: [{ severity: 'critical', type: 'allergy', message: 'x', drugId: 'amox' }],
        },
      }).success,
    ).toBe(false);
  });

  it('check each audit kind for its own fields', () => {
    const signRx = MOCK_AUDIT.find((e) => e.kind === 'sign_rx')!;
    expect(auditEventSchema.safeParse({ ...signRx, rxId: undefined }).success).toBe(false);
    expect(auditEventSchema.safeParse({ ...signRx, kind: 'delete_everything' }).success).toBe(
      false,
    );
  });
});
