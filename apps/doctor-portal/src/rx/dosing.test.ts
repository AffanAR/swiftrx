import { describe, expect, it } from 'vitest';
import { MOCK_DRUGS, type Brand } from '@swiftrx/shared';
import { doseFromStrength, medicationFor } from './dosing';

const drug = (name: string) => MOCK_DRUGS.find((d) => d.genericName === name)!;
const brand = (patch: Partial<Brand>): Brand => ({
  id: 'b_test',
  name: 'Test',
  drugId: 'g_test',
  form: 'Tablet',
  manufacturer: 'Test Ltd.',
  ...patch,
});

describe('doseFromStrength', () => {
  it('reads a single strength', () => {
    expect(doseFromStrength('500 mg')).toEqual({ value: 500, unit: 'mg' });
    expect(doseFromStrength('100 mcg/puff')).toEqual({ value: 100, unit: 'mcg' });
    expect(doseFromStrength('1 g')).toEqual({ value: 1, unit: 'g' });
  });

  it('takes a syrup by volume', () => {
    expect(doseFromStrength('120 mg/5 ml')).toEqual({ value: 5, unit: 'ml' });
  });

  it("gives up on what it can't read", () => {
    expect(doseFromStrength('(10 mg+30 mg+1.25 mg)/5 ml')).toBeUndefined();
    expect(doseFromStrength('1%')).toBeUndefined();
    expect(doseFromStrength('80 mg/ml')).toBeUndefined();
  });
});

describe('medicationFor', () => {
  it("uses a brand's strength, form and name", () => {
    const paracetamol = drug('Paracetamol');
    const med = medicationFor(paracetamol, brand({ name: 'Napa', strength: '665 mg' }));
    expect(med).toMatchObject({
      drugId: paracetamol.id,
      genericName: 'Paracetamol',
      brandName: 'Napa',
      form: 'Tablet',
      strength: '665 mg',
      dosage: { value: 665, unit: 'mg' },
      frequency: paracetamol.defaultFrequency,
    });
  });

  it("falls back to a reviewed generic's defaults", () => {
    const med = medicationFor(drug('Paracetamol'));
    expect(med.dosage).toEqual({ value: 500, unit: 'mg' });
    expect(med.brandName).toBeUndefined();
  });

  it('starts an unreviewed generic at once daily for 5 days', () => {
    const cloxacillin = drug('Cloxacillin Sodium');
    expect(cloxacillin.safetyReviewed).toBe(false);
    expect(medicationFor(cloxacillin)).toMatchObject({
      dosage: { value: 1, unit: 'tablets' },
      frequency: 'QD',
      durationDays: 5,
    });
  });
});
