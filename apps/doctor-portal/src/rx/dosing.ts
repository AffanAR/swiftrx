// What a new pad row starts with, for a generic or one of its brands.
//
// The dose comes from the brand's strength where it reads as one ("500 mg",
// "100 mcg/puff"; "120 mg/5 ml" gives 5 ml), else from the generic's reviewed
// default. Generics nobody has reviewed have no frequency or duration
// defaults, so the row starts at once daily for 5 days and the pad flags it
// for the doctor to check (see Drug.safetyReviewed).

import type { Brand, DoseUnit, Drug, RxMedication } from '@swiftrx/shared';

/** The pad's tooltip for a generic with `safetyReviewed: false`. */
export const NO_SAFETY_DATA =
  "Nobody has entered this generic's doses, interactions or contraindications yet. Only allergies matching its name or class are checked.";

const UNREVIEWED = { frequency: 'QD', durationDays: 5 } as const;

export function medicationFor(drug: Drug, brand?: Brand): Omit<RxMedication, 'rowId'> {
  const dosage = (brand?.strength && doseFromStrength(brand.strength)) ||
    drug.defaultDosage || { value: 1, unit: 'tablets' as const };
  return {
    drugId: drug.id,
    genericName: drug.genericName,
    ...(brand
      ? {
          brandName: brand.name,
          form: brand.form,
          ...(brand.strength ? { strength: brand.strength } : {}),
        }
      : {}),
    dosage: { ...dosage },
    frequency: drug.defaultFrequency ?? UNREVIEWED.frequency,
    durationDays: drug.defaultDurationDays ?? UNREVIEWED.durationDays,
    instructions: 'As directed',
  };
}

const UNITS: Record<string, DoseUnit> = { mg: 'mg', mcg: 'mcg', g: 'g', ml: 'ml' };

/** "500 mg" → 500 mg; "100 mcg/puff" → 100 mcg; "120 mg/5 ml" → 5 ml; anything else → undefined. */
export function doseFromStrength(strength: string): RxMedication['dosage'] | undefined {
  const s = strength.trim().toLowerCase();
  const perVolume = /^[\d.]+\s*(?:mg|mcg|g)\s*\/\s*([\d.]+)\s*ml$/.exec(s);
  if (perVolume) return positive(Number(perVolume[1]), 'ml');
  const single =
    /^([\d.]+)\s*(mg|mcg|g|ml)(?:\s*\/\s*(?:puff|actuation|dose|sachet|tablet|capsule))?$/.exec(s);
  if (single) return positive(Number(single[1]), UNITS[single[2]]);
  return undefined;
}

function positive(value: number, unit: DoseUnit) {
  return Number.isFinite(value) && value > 0 ? { value, unit } : undefined;
}
