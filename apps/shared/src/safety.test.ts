import { describe, expect, it } from 'vitest';
import { MOCK_DRUGS } from './mockDb';
import type { Drug, Patient, RxMedication } from './types';
import {
  baseName,
  checkAllergy,
  checkDuplicateTherapy,
  amountPerDose,
  checkDose,
  checkInteraction,
  checkKidney,
  checkPregnancy,
  evaluateAllMedications,
  evaluateMedication,
  findDrug,
  severityRank,
} from './safety';

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
  dateOfBirth: '1986-01-01',
  pregnancy: 'not_pregnant',
  kidney: 'normal',
  sex: 'F',
  weightKg: 60,
  contact: '—',
  allergyStatus: 'not_recorded',
  allergies: [],
  activeProblems: [],
  activeMedications: [],
  recentVitals: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A pad row for a catalog drug, at its reviewed default dose unless given one. */
const row = (drugId: string, patch: Partial<RxMedication> = {}): RxMedication => {
  const d = drug(drugId);
  return {
    rowId: `r_${drugId}`,
    drugId,
    genericName: d.genericName,
    dosage: d.defaultDosage ?? { value: 1, unit: 'tablets' },
    frequency: d.defaultFrequency ?? 'QD',
    durationDays: 5,
    instructions: '',
    ...patch,
  };
};

const byName = (name: string): Drug => {
  const d = MOCK_DRUGS.find((x) => x.genericName === name);
  if (!d) throw new Error(`No generic ${name}`);
  return d;
};
const TODAY = new Date('2026-11-03T10:00:00Z');

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

  // Was a known gap (PLAN.md §2.2): interactions are checked between drugs on
  // the same pad too, not only against the patient's own medicines.
  it('flags two interacting drugs on the same prescription', () => {
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

describe('allergy groups from the rule set', () => {
  it('catches every penicillin, and warns about cephalosporins', () => {
    const allergic = patient({ allergyStatus: 'recorded', allergies: ['Penicillin'] });
    expect(checkAllergy(byName('Cloxacillin Sodium'), allergic)).toMatchObject({
      severity: 'critical',
      message: expect.stringContaining('penicillins'),
    });
    expect(checkAllergy(byName('Cefuroxime Axetil'), allergic)).toMatchObject({
      severity: 'moderate',
      message: expect.stringContaining('cephalosporins'),
    });
  });

  it('catches sulfa drugs and NSAIDs by ingredient, whatever their class', () => {
    const sulfa = patient({ allergyStatus: 'recorded', allergies: ['Sulfa drugs'] });
    expect(checkAllergy(byName('Sulfasalazine'), sulfa)?.severity).toBe('critical');
    // Diclofenac is filed under "Drugs for Osteoarthritis".
    const aspirin = patient({ allergyStatus: 'recorded', allergies: ['Aspirin'] });
    expect(checkAllergy(byName('Diclofenac Sodium'), aspirin)?.severity).toBe('critical');
  });
});

describe('interactions from the rule set', () => {
  it("uses the pair's severity: warfarin with ibuprofen is critical", () => {
    const onWarfarin = patient({ activeMedications: [{ name: 'Warfarin', dose: '5mg QD' }] });
    expect(checkInteraction(drug(IBUPROFEN), onWarfarin, MOCK_DRUGS)).toEqual([
      expect.objectContaining({
        severity: 'critical',
        message: expect.stringContaining('Bleeding'),
      }),
    ]);
  });

  it('flags both rows of an interacting pair on one prescription', () => {
    const azithromycin = byName('Azithromycin Dihydrate');
    const ondansetron = byName('Ondansetron');
    const alerts = evaluateAllMedications(
      [row(azithromycin.id), row(ondansetron.id)],
      patient(),
      MOCK_DRUGS,
      { today: TODAY },
    );
    for (const id of [azithromycin.id, ondansetron.id]) {
      expect(alerts.get(`r_${id}`)?.some((a) => a.type === 'drug_interaction')).toBe(true);
    }
  });

  it('flags the same drug twice on one prescription', () => {
    const alerts = evaluateAllMedications(
      [row(PARACETAMOL), { ...row(PARACETAMOL), rowId: 'r_again' }],
      patient(),
      MOCK_DRUGS,
      { today: TODAY },
    );
    expect(alerts.get('r_again')?.map((a) => a.type)).toContain('duplicate_therapy');
  });
});

describe('dose', () => {
  const adult = patient();
  const child = patient({ dateOfBirth: '2020-05-09', weightKg: 20 }); // 6 years

  it("converts tablets and syrups to the rule's unit, using the strength", () => {
    expect(amountPerDose(row(PARACETAMOL, { dosage: { value: 1, unit: 'g' } }), 'mg')).toBe(1000);
    expect(
      amountPerDose(
        row(PARACETAMOL, { dosage: { value: 2, unit: 'tablets' }, strength: '500 mg' }),
        'mg',
      ),
    ).toBe(1000);
    expect(
      amountPerDose(
        row(PARACETAMOL, { dosage: { value: 5, unit: 'ml' }, strength: '120 mg/5 ml' }),
        'mg',
      ),
    ).toBe(120);
    expect(amountPerDose(row(PARACETAMOL, { dosage: { value: 5, unit: 'ml' } }), 'mg')).toBe(
      undefined,
    );
  });

  it('is quiet at a normal adult dose', () => {
    expect(checkDose(drug(PARACETAMOL), row(PARACETAMOL), adult, { today: TODAY })).toEqual([]);
  });

  it('flags a daily overdose as critical, and a big single dose as moderate', () => {
    const big = row(PARACETAMOL, { dosage: { value: 1500, unit: 'mg' }, frequency: 'QID' });
    const alerts = checkDose(drug(PARACETAMOL), big, adult, { today: TODAY });
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'moderate']);
    expect(alerts[0].message).toContain('6000 mg');
  });

  it("checks a child's dose per kilogram", () => {
    const tooMuch = row(PARACETAMOL, { dosage: { value: 500, unit: 'mg' }, frequency: 'QID' });
    expect(checkDose(drug(PARACETAMOL), tooMuch, child, { today: TODAY })[0]).toMatchObject({
      severity: 'critical',
      message: expect.stringContaining('100 mg/kg/day'),
    });
    const syrup: Partial<RxMedication> = {
      dosage: { value: 10, unit: 'ml' },
      strength: '120 mg/5 ml',
      frequency: 'QID',
    };
    expect(checkDose(drug(PARACETAMOL), row(PARACETAMOL, syrup), child, { today: TODAY })).toEqual(
      [],
    );
    const tooLittle = { ...syrup, dosage: { value: 5, unit: 'ml' as const } };
    expect(
      checkDose(drug(PARACETAMOL), row(PARACETAMOL, tooLittle), child, { today: TODAY })[0]
        ?.severity,
    ).toBe('low');
  });

  it("says so when there's no guidance for the age, or the dose can't be read", () => {
    const toddler = patient({ dateOfBirth: '2024-01-01', weightKg: 12 });
    expect(
      checkDose(drug(AMLODIPINE), row(AMLODIPINE), toddler, { today: TODAY })[0]?.severity,
    ).toBe('moderate');
    const unreadable = row(PARACETAMOL, { dosage: { value: 5, unit: 'ml' } });
    expect(checkDose(drug(PARACETAMOL), unreadable, adult, { today: TODAY })[0]?.severity).toBe(
      'low',
    );
  });

  it('only checks the single dose of an as-needed medicine', () => {
    const prn = row(PARACETAMOL, { dosage: { value: 1000, unit: 'mg' }, frequency: 'PRN' });
    expect(checkDose(drug(PARACETAMOL), prn, adult, { today: TODAY })).toEqual([]);
  });
});

describe('pregnancy, breastfeeding and kidneys', () => {
  it('rates pregnancy flags by their level', () => {
    const pregnant = patient({ pregnancy: 'pregnant' });
    expect(checkPregnancy(drug(LISINOPRIL), pregnant)?.severity).toBe('critical');
    expect(checkPregnancy(drug(IBUPROFEN), pregnant)?.severity).toBe('moderate');
    expect(checkPregnancy(drug(PARACETAMOL), pregnant)).toBeNull();
    expect(checkPregnancy(drug(LISINOPRIL), patient())).toBeNull();
    expect(
      checkPregnancy(drug(ATORVASTATIN), patient({ pregnancy: 'breastfeeding' }))?.severity,
    ).toBe('moderate');
  });

  it('rates kidney flags by band, and asks when function is unknown', () => {
    const metformin = byName('Metformin Hydrochloride');
    expect(checkKidney(metformin, patient({ kidney: 'severe', egfr: 22 }))).toMatchObject({
      severity: 'critical',
      message: expect.stringContaining('eGFR 22'),
    });
    expect(checkKidney(metformin, patient({ kidney: 'moderate' }))?.severity).toBe('moderate');
    expect(checkKidney(metformin, patient({ kidney: 'unknown' }))?.severity).toBe('low');
    expect(checkKidney(metformin, patient())).toBeNull();
    expect(checkKidney(drug(AMLODIPINE), patient({ kidney: 'failure' }))).toBeNull();
  });
});
