import { describe, expect, it } from 'vitest';
import { MOCK_DRUGS, type Drug, type Patient, type RxMedication } from '@swiftrx/shared';
import {
  baseName,
  checkAllergy,
  checkDuplicateTherapy,
  checkInteraction,
  evaluateAllMedications,
  evaluateMedication,
  findDrug,
  severityRank,
} from './safety';
import { medicationFor } from './dosing';

// Generic ids from the Bangladesh list; these have reviewed safety data
// (scripts/bd-medicines/reviewed.json).
const PARACETAMOL = 'g860';
const IBUPROFEN = 'g593';
const AMOXICILLIN = 'g69';
const AMLODIPINE = 'g62';
const LISINOPRIL = 'g691';
const ATORVASTATIN = 'g92';

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

/** A pad row for a catalog drug, with its starting dose. */
const row = (drugId: string): RxMedication => ({
  rowId: `r_${drugId}`,
  ...medicationFor(drug(drugId)),
});

describe('findDrug', () => {
  it('finds a drug by id or generic name, ignoring case and spaces', () => {
    expect(findDrug(AMOXICILLIN, MOCK_DRUGS)?.genericName).toBe('Amoxicillin Trihydrate');
    expect(findDrug('  amoxicillin trihydrate ', MOCK_DRUGS)?.id).toBe(AMOXICILLIN);
    expect(findDrug('not-a-drug', MOCK_DRUGS)).toBeUndefined();
  });
});

describe('baseName', () => {
  it('drops the salt, the form and any second ingredient', () => {
    expect(baseName('Metformin Hydrochloride')).toBe('metformin');
    expect(baseName('Salbutamol (Inhaler)')).toBe('salbutamol');
    expect(baseName('Paracetamol + Caffeine')).toBe('paracetamol');
  });
});

describe('checkAllergy', () => {
  it('flags a contraindicated drug as critical', () => {
    const alert = checkAllergy(drug(AMOXICILLIN), patient({ allergies: ['Penicillin'] }));
    expect(alert).toMatchObject({ severity: 'critical', type: 'allergy', drugId: AMOXICILLIN });
    expect(alert?.message).toContain('Penicillin');
  });

  it('catches a generic nobody reviewed by its name or class', () => {
    // Cloxacillin has no contraindication list, but its class names penicillins.
    const cloxacillin = MOCK_DRUGS.find((d) => d.genericName === 'Cloxacillin Sodium')!;
    expect(cloxacillin.safetyReviewed).toBe(false);
    expect(checkAllergy(cloxacillin, patient({ allergies: ['Penicillin'] }))).toMatchObject({
      severity: 'critical',
    });
  });

  it('returns null when no allergy matches', () => {
    expect(checkAllergy(drug(AMOXICILLIN), patient({ allergies: ['Latex'] }))).toBeNull();
    expect(checkAllergy(drug(PARACETAMOL), patient({ allergies: ['Penicillin'] }))).toBeNull();
  });
});

describe('checkInteraction', () => {
  it('flags a drug that interacts with one the patient already takes', () => {
    const onAspirin = patient({ activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }] });
    expect(checkInteraction(drug(IBUPROFEN), onAspirin, MOCK_DRUGS)).toEqual([
      expect.objectContaining({
        severity: 'moderate',
        type: 'drug_interaction',
        drugId: IBUPROFEN,
      }),
    ]);
  });

  it("counts the other drug's list too", () => {
    const onIbuprofen = patient({ activeMedications: [{ name: 'Ibuprofen', dose: '400mg TID' }] });
    expect(checkInteraction(drug(LISINOPRIL), onIbuprofen, MOCK_DRUGS)).toHaveLength(1);
    // Warfarin lists nothing, but Atorvastatin lists warfarin.
    const onAtorvastatin = patient({
      activeMedications: [{ name: 'Atorvastatin', dose: '20mg QHS' }],
    });
    const warfarin = MOCK_DRUGS.find((d) => d.genericName === 'Warfarin Sodium')!;
    expect(checkInteraction(warfarin, onAtorvastatin, MOCK_DRUGS)).toHaveLength(1);
  });

  it('returns no alerts when nothing interacts', () => {
    const onAspirin = patient({ activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }] });
    expect(checkInteraction(drug(PARACETAMOL), onAspirin, MOCK_DRUGS)).toEqual([]);
  });
});

describe('checkDuplicateTherapy', () => {
  it('flags another drug of a class the patient already takes', () => {
    const onStatin = patient({ activeMedications: [{ name: 'Rosuvastatin', dose: '10mg QHS' }] });
    expect(checkDuplicateTherapy(drug(ATORVASTATIN), onStatin, MOCK_DRUGS)).toMatchObject({
      severity: 'low',
      type: 'duplicate_therapy',
    });
  });

  it('flags a drug the patient already takes, under its short name', () => {
    const onAmlodipine = patient({ activeMedications: [{ name: 'Amlodipine', dose: '5mg QD' }] });
    expect(checkDuplicateTherapy(drug(AMLODIPINE), onAmlodipine, MOCK_DRUGS)).not.toBeNull();
  });

  it('leaves a drug of another class alone', () => {
    const onMetformin = patient({ activeMedications: [{ name: 'Metformin', dose: '500mg BID' }] });
    expect(checkDuplicateTherapy(drug(AMLODIPINE), onMetformin, MOCK_DRUGS)).toBeNull();
  });
});

describe('evaluateMedication / evaluateAllMedications', () => {
  it("returns each row's alerts, keyed by row id", () => {
    const p = patient({
      allergies: ['Penicillin'],
      activeMedications: [{ name: 'Aspirin', dose: '75mg QD' }],
    });
    const alerts = evaluateAllMedications(
      [row(AMOXICILLIN), row(IBUPROFEN), row(PARACETAMOL)],
      p,
      MOCK_DRUGS,
    );
    expect(alerts.get(`r_${AMOXICILLIN}`)?.map((a) => a.type)).toEqual(['allergy']);
    expect(alerts.get(`r_${IBUPROFEN}`)?.map((a) => a.type)).toEqual(['drug_interaction']);
    expect(alerts.get(`r_${PARACETAMOL}`)).toEqual([]);
  });

  it('ignores rows whose drug is not in the catalog', () => {
    expect(
      evaluateMedication({ ...row(PARACETAMOL), drugId: 'not-a-drug' }, patient(), MOCK_DRUGS),
    ).toEqual([]);
  });

  // Known gap (PLAN.md §2.2): interactions are only checked against the
  // patient's existing medications, not between drugs on the same pad.
  it.fails('flags two interacting drugs on the same prescription (known gap)', () => {
    const alerts = evaluateAllMedications([row(IBUPROFEN), row(LISINOPRIL)], patient(), MOCK_DRUGS);
    expect([...alerts.values()].flat().some((a) => a.type === 'drug_interaction')).toBe(true);
  });
});

describe('severityRank', () => {
  it('orders critical above moderate above low', () => {
    expect(severityRank('critical')).toBeGreaterThan(severityRank('moderate'));
    expect(severityRank('moderate')).toBeGreaterThan(severityRank('low'));
  });
});
