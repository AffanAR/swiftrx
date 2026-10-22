import { describe, expect, it } from 'vitest';
import { MOCK_DRUGS, type Drug, type Patient, type RxMedication } from '@swiftrx/shared';
import {
  checkAllergy,
  checkDuplicateTherapy,
  checkInteraction,
  evaluateAllMedications,
  evaluateMedication,
  findDrug,
  severityRank,
} from './safety';

const drug = (id: string): Drug => {
  const d = MOCK_DRUGS.find((x) => x.id === id);
  if (!d) throw new Error(`No drug ${id} in the catalog`);
  return d;
};

const patient = (overrides: Partial<Patient> = {}): Patient => ({
  id: 'p_test',
  hospitalSlug: 'city-hospital',
  name: 'Test Patient',
  age: 40,
  sex: 'F',
  weightKg: 60,
  contact: '—',
  allergies: [],
  activeProblems: [],
  activeMedications: [],
  recentVitals: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A pad row for a catalog drug, with its default dose. */
const row = (drugId: string): RxMedication => {
  const d = drug(drugId);
  return {
    rowId: `r_${drugId}`,
    drugId,
    genericName: d.genericName,
    dosage: { ...d.defaultDosage },
    frequency: d.defaultFrequency,
    durationDays: d.defaultDurationDays,
    instructions: '',
  };
};

describe('findDrug', () => {
  it('finds a drug by id, generic name or brand name, ignoring case and spaces', () => {
    expect(findDrug('amox', MOCK_DRUGS)?.id).toBe('amox');
    expect(findDrug('  Amoxicillin ', MOCK_DRUGS)?.id).toBe('amox');
    expect(findDrug('LIPITOR', MOCK_DRUGS)?.id).toBe('atorva');
    expect(findDrug('not-a-drug', MOCK_DRUGS)).toBeUndefined();
  });
});

describe('checkAllergy', () => {
  it('flags a contraindicated drug as critical', () => {
    const alert = checkAllergy(drug('amox'), patient({ allergies: ['Penicillin'] }));
    expect(alert).toMatchObject({ severity: 'critical', type: 'allergy', drugId: 'amox' });
    expect(alert?.message).toContain('Penicillin');
  });

  it('returns null when no allergy matches', () => {
    expect(checkAllergy(drug('amox'), patient({ allergies: ['Latex'] }))).toBeNull();
    expect(checkAllergy(drug('para'), patient({ allergies: ['Penicillin'] }))).toBeNull();
  });
});

describe('checkInteraction', () => {
  it('flags a drug that interacts with one the patient already takes', () => {
    const onAspirin = patient({ activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }] });
    expect(checkInteraction(drug('ibu'), onAspirin, MOCK_DRUGS)).toEqual([
      expect.objectContaining({ severity: 'moderate', type: 'drug_interaction', drugId: 'ibu' }),
    ]);
  });

  it('returns no alerts when nothing interacts', () => {
    const onAspirin = patient({ activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }] });
    expect(checkInteraction(drug('para'), onAspirin, MOCK_DRUGS)).toEqual([]);
  });
});

describe('checkDuplicateTherapy', () => {
  it('flags another drug of a class the patient already takes', () => {
    const onStatin = patient({ activeMedications: [{ name: 'Rosuvastatin', dose: '10mg QHS' }] });
    expect(checkDuplicateTherapy(drug('atorva'), onStatin)).toMatchObject({
      severity: 'low',
      type: 'duplicate_therapy',
    });
  });

  // Known gap (PLAN.md §2.2): the check compares the drug's class word with the
  // patient's medication names, so it misses the very same drug. `it.fails`
  // keeps the gap visible: once the check is fixed this test passes, Vitest
  // reports it, and the marker should be removed.
  it.fails('flags a drug the patient already takes (known gap)', () => {
    const onAmlodipine = patient({ activeMedications: [{ name: 'Amlodipine', dose: '5mg QD' }] });
    expect(checkDuplicateTherapy(drug('amlo'), onAmlodipine)).not.toBeNull();
  });
});

describe('evaluateMedication / evaluateAllMedications', () => {
  it("returns each row's alerts, keyed by row id", () => {
    const p = patient({
      allergies: ['Penicillin'],
      activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }],
    });
    const alerts = evaluateAllMedications([row('amox'), row('ibu'), row('para')], p, MOCK_DRUGS);
    expect(alerts.get('r_amox')?.map((a) => a.type)).toEqual(['allergy']);
    expect(alerts.get('r_ibu')?.map((a) => a.type)).toEqual(['drug_interaction']);
    expect(alerts.get('r_para')).toEqual([]);
  });

  it('ignores rows whose drug is not in the catalog', () => {
    expect(
      evaluateMedication({ ...row('para'), drugId: 'not-a-drug' }, patient(), MOCK_DRUGS),
    ).toEqual([]);
  });

  // Known gap (PLAN.md §2.2): interactions are only checked against the
  // patient's existing medications, not between drugs on the same pad.
  it.fails('flags two interacting drugs on the same prescription (known gap)', () => {
    const alerts = evaluateAllMedications([row('ibu'), row('lisinopril')], patient(), MOCK_DRUGS);
    expect([...alerts.values()].flat().some((a) => a.type === 'drug_interaction')).toBe(true);
  });
});

describe('severityRank', () => {
  it('orders critical above moderate above low', () => {
    expect(severityRank('critical')).toBeGreaterThan(severityRank('moderate'));
    expect(severityRank('moderate')).toBeGreaterThan(severityRank('low'));
  });
});
