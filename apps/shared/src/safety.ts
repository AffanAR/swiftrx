// The prescription safety checks. Pure functions of the pad's rows, the
// patient, the catalog and the clinical rule set (rules.ts), so the Rx pad
// runs them as the doctor types and the server runs them again when it signs
// (apps/api/src/prescriptions.ts), and the two can't disagree.
//
//   - allergy: the rule set's allergy groups and cross-reactions, then the
//     drug's own contraindications and its name and class;
//   - interactions: the rule set's pairs and the drugs' own lists, against
//     the patient's current medicines and the other rows on the same Rx;
//   - duplicates: the same generic, or the same class, already taken or
//     already on the pad;
//   - dose: the row's amount, in the rule's unit, against the band for the
//     patient's age (daily and single maximum, and per kg per day);
//   - pregnancy, breastfeeding and kidney function.
//
// A critical alert can only be signed through with a reason (the pad asks,
// the server refuses without one); moderate and low ones are shown.

import { ageInMonthsOn } from './patient';
import { RULE_SET, hasIngredient, type DoseBand, type RuleLevel, type RuleSet } from './rules';
import type { Drug, Patient, RxMedication, SafetyAlert, Severity } from './types';

/**
 * How long, in characters, a doctor's reason must be to sign through a
 * critical alert. The pad asks for it; the server refuses less.
 */
export const MIN_OVERRIDE_REASON = 10;

/** What a check may need besides the row, the patient and the catalog. */
export interface CheckContext {
  /** The other rows on the same prescription. */
  others?: RxMedication[];
  rules?: RuleSet;
  /** "Today", for the patient's age. */
  today?: Date;
}

// Normalize for comparison
const norm = (s: string) => s.trim().toLowerCase();

// The name a generic goes by without its salt or form: "Metformin
// Hydrochloride" → "metformin", "Salbutamol (Inhaler)" → "salbutamol". A
// patient's medication list says "Metformin"; the catalog says the full name.
export const baseName = (s: string) => norm(s).split(/[\s(+,/]/)[0];

const LEVEL_SEVERITY: Record<RuleLevel, Severity> = {
  contraindicated: 'critical',
  avoid: 'moderate',
  reduce: 'moderate',
  caution: 'low',
};

const severityOrder = (a: SafetyAlert, b: SafetyAlert) =>
  severityRank(b.severity) - severityRank(a.severity);

// Match by drug.id or generic name
function drugKeyMatches(needle: string, drug: Drug): boolean {
  const n = norm(needle);
  return norm(drug.id) === n || norm(drug.genericName) === n;
}

// Find a drug in the catalog by id or generic name
function findDrug(needle: string, catalog: Drug[]): Drug | undefined {
  return catalog.find((d) => drugKeyMatches(needle, d));
}

// The catalog generic a patient's medication most likely is: the same full
// name, else the plain generic of the same base name ("Aspirin", not
// "Aspirin + Dipyridamole").
function findByBaseName(name: string, catalog: Drug[]): Drug | undefined {
  const exact = findDrug(name, catalog);
  if (exact) return exact;
  const base = baseName(name);
  const same = catalog.filter((d) => baseName(d.genericName) === base);
  return same.find((d) => !/[+(]/.test(d.genericName)) ?? same[0];
}

// --- allergy -------------------------------------------------------------------

type AllergyGroup = RuleSet['allergyGroups'][number];

function inGroup(drug: Drug, group: AllergyGroup): boolean {
  const cls = norm(drug.therapeuticClass);
  return (
    group.ingredients.some((i) => hasIngredient(drug.genericName, i)) ||
    group.classes.some((c) => cls.includes(c))
  );
}

// The fallback when no group matches: the drug's own contraindication list,
// or the allergy's first word in its generic name or class ("Latex" matches
// nothing). Imported generics have no contraindication list.
function allergyWordMatches(allergy: string, drug: Drug): boolean {
  const a = norm(allergy);
  if (!a) return false;
  if (drug.contraindications.some((c) => a.includes(c) || c.includes(a))) return true;
  const word = a.split(/\s+/)[0].replace(/s$/, '');
  if (word.length < 4) return false;
  return norm(drug.genericName).includes(word) || norm(drug.therapeuticClass).includes(word);
}

export function checkAllergy(
  drug: Drug,
  patient: Patient,
  rules: RuleSet = RULE_SET,
): SafetyAlert | null {
  const found: SafetyAlert[] = [];
  for (const allergy of patient.allergies) {
    const a = norm(allergy);
    const groups = rules.allergyGroups.filter((g) => g.allergyTerms.some((t) => a.includes(t)));
    const direct = groups.find((g) => inGroup(drug, g));
    if (direct) {
      found.push({
        severity: 'critical',
        type: 'allergy',
        message: `Patient allergic to ${allergy}. ${drug.genericName} is one of the ${direct.label.toLowerCase()}.`,
        drugId: drug.id,
      });
      continue;
    }
    if (allergyWordMatches(allergy, drug)) {
      found.push({
        severity: 'critical',
        type: 'allergy',
        message: `Patient allergic to ${allergy}. ${drug.genericName} is contraindicated.`,
        drugId: drug.id,
      });
      continue;
    }
    for (const g of groups) {
      for (const x of rules.crossReactions.filter((r) => r.allergyGroup === g.id)) {
        const drugGroup = rules.allergyGroups.find((d) => d.id === x.drugGroup);
        if (drugGroup && inGroup(drug, drugGroup)) {
          found.push({
            severity: x.severity,
            type: 'allergy',
            message: `Patient allergic to ${allergy}; ${drug.genericName} is one of the ${drugGroup.label.toLowerCase()}. ${x.note}`,
            drugId: drug.id,
          });
        }
      }
    }
  }
  return found.sort(severityOrder)[0] ?? null;
}

// --- interactions ----------------------------------------------------------------

/** Something the drug might interact with: one of the patient's medicines, or another row. */
interface Partner {
  name: string;
  /** "existing" for the patient's own medicines, "on this prescription" for rows. */
  where: string;
  drug?: Drug;
}

export function checkInteraction(
  drug: Drug,
  patient: Patient,
  catalog: Drug[],
  ctx: CheckContext = {},
): SafetyAlert[] {
  const rules = ctx.rules ?? RULE_SET;
  const own = baseName(drug.genericName);
  const partners: Partner[] = [
    ...patient.activeMedications.map((m) => ({
      name: m.name,
      where: 'existing',
      drug: findByBaseName(m.name, catalog),
    })),
    ...(ctx.others ?? []).map((m) => ({
      name: m.genericName,
      where: 'on this prescription',
      drug: findDrug(m.drugId, catalog),
    })),
  ];

  const alerts: SafetyAlert[] = [];
  const seen = new Set<string>();
  for (const p of partners) {
    const base = baseName(p.name);
    if (base === own || seen.has(base)) continue; // the same drug is a duplicate, not an interaction

    const pair = rules.interactions.find(
      ({ between: [x, y] }) =>
        (hasIngredient(drug.genericName, x) && hasIngredient(p.name, y)) ||
        (hasIngredient(drug.genericName, y) && hasIngredient(p.name, x)),
    );
    // Either drug's own list counts: Ibuprofen lists lisinopril, and Lisinopril ibuprofen.
    const listed =
      drug.interactsWith.some((t) => baseName(t) === base) ||
      (p.drug?.interactsWith.some((t) => baseName(t) === own) ?? false);
    if (!pair && !listed) continue;

    seen.add(base);
    alerts.push({
      severity: pair?.severity ?? 'moderate',
      type: 'drug_interaction',
      message: `Interaction between ${drug.genericName} and ${p.where} ${p.name}${pair ? `: ${pair.note}` : '.'}`,
      drugId: drug.id,
    });
  }
  return alerts.sort(severityOrder);
}

// --- duplicates --------------------------------------------------------------------

// The same generic, or another generic of the same class, that the patient
// already takes or that's already on the pad. Needs the catalog to know an
// existing medication's class.
export function checkDuplicateTherapy(
  drug: Drug,
  patient: Patient,
  catalog: Drug[],
  ctx: CheckContext = {},
): SafetyAlert | null {
  const own = baseName(drug.genericName);
  for (const med of patient.activeMedications) {
    if (baseName(med.name) === own) {
      return {
        severity: 'low',
        type: 'duplicate_therapy',
        message: `Patient already on ${med.name} (${med.dose}).`,
        drugId: drug.id,
      };
    }
    const other = findByBaseName(med.name, catalog);
    if (
      other &&
      other.therapeuticClass !== 'Unclassified' &&
      other.therapeuticClass === drug.therapeuticClass
    ) {
      return {
        severity: 'low',
        type: 'duplicate_therapy',
        message: `Patient already on ${med.name} (${med.dose}). Same therapeutic class as ${drug.genericName}: ${drug.therapeuticClass}.`,
        drugId: drug.id,
      };
    }
  }
  if ((ctx.others ?? []).some((m) => baseName(m.genericName) === own)) {
    return {
      severity: 'moderate',
      type: 'duplicate_therapy',
      message: `${drug.genericName} is on this prescription twice.`,
      drugId: drug.id,
    };
  }
  return null;
}

// --- dose ----------------------------------------------------------------------------

const TIMES_A_DAY: Record<RxMedication['frequency'], number | null> = {
  QD: 1,
  BID: 2,
  TID: 3,
  QID: 4,
  QHS: 1,
  PRN: null, // as needed: only the single dose can be checked
};

/** How many of the rule's unit are in one of these. */
const MASS: Record<string, number> = { mcg: 0.001, mg: 1, g: 1000 };

/**
 * One dose of the row in the rule's unit (mg, mcg or g), or undefined when it
 * can't be worked out: a syrup's millilitres need its strength ("120 mg/5
 * ml"), and tablets need theirs ("500 mg").
 */
export function amountPerDose(med: RxMedication, unit: string): number | undefined {
  const { value, unit: given } = med.dosage;
  const to = (amount: number, from: string) =>
    MASS[from] === undefined || MASS[unit] === undefined
      ? undefined
      : (amount * MASS[from]) / MASS[unit];
  if (MASS[given] !== undefined) return to(value, given);

  const s = (med.strength ?? '').trim().toLowerCase();
  if (given === 'ml') {
    const m = /^([\d.]+)\s*(mg|mcg|g)\s*\/\s*([\d.]+)?\s*ml$/.exec(s);
    if (!m) return undefined;
    const perMl = Number(m[1]) / (m[3] ? Number(m[3]) : 1);
    return to(value * perMl, m[2]);
  }
  if (given === 'tablets') {
    const m = /^([\d.]+)\s*(mg|mcg|g)$/.exec(s);
    return m ? to(value * Number(m[1]), m[2]) : undefined;
  }
  return undefined;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function checkDose(
  drug: Drug,
  med: RxMedication,
  patient: Patient,
  ctx: CheckContext = {},
): SafetyAlert[] {
  const rule = (ctx.rules ?? RULE_SET).doses[drug.id];
  if (!rule) return [];
  const months = ageInMonthsOn(patient.dateOfBirth, ctx.today ?? new Date());
  const alert = (severity: Severity, message: string): SafetyAlert => ({
    severity,
    type: 'dose',
    message,
    drugId: drug.id,
  });

  const band: DoseBand | undefined = rule.bands.find(
    (b) => months >= (b.minAgeMonths ?? 0) && months <= (b.maxAgeMonths ?? Infinity),
  );
  if (!band) {
    return [
      alert(
        'moderate',
        `No dose guidance for ${drug.genericName} at this patient's age; check before prescribing.`,
      ),
    ];
  }
  const amount = amountPerDose(med, rule.unit);
  if (amount === undefined) {
    return [
      alert(
        'low',
        `The ${drug.genericName} dose couldn't be checked: give it in ${rule.unit}, or pick a brand with a strength.`,
      ),
    ];
  }

  const { unit } = rule;
  const times = TIMES_A_DAY[med.frequency];
  const daily = times === null ? undefined : amount * times;
  const alerts: SafetyAlert[] = [];
  if (band.maxDaily !== undefined && daily !== undefined && daily > band.maxDaily) {
    alerts.push(
      alert(
        'critical',
        `${round(daily)} ${unit} of ${drug.genericName} a day is above the ${band.maxDaily} ${unit} daily maximum.`,
      ),
    );
  }
  if (band.perKgDay && daily !== undefined && patient.weightKg > 0) {
    const perKg = daily / patient.weightKg;
    if (perKg > band.perKgDay.max) {
      alerts.push(
        alert(
          'critical',
          `${round(perKg)} ${unit}/kg/day of ${drug.genericName} is above the ${band.perKgDay.max} ${unit}/kg/day maximum for a ${patient.weightKg} kg patient.`,
        ),
      );
    } else if (perKg < band.perKgDay.min) {
      alerts.push(
        alert(
          'low',
          `${round(perKg)} ${unit}/kg/day of ${drug.genericName} is below the usual ${band.perKgDay.min}–${band.perKgDay.max} ${unit}/kg/day.`,
        ),
      );
    }
  }
  if (band.maxSingle !== undefined && amount > band.maxSingle) {
    alerts.push(
      alert(
        'moderate',
        `${round(amount)} ${unit} of ${drug.genericName} at once is above the ${band.maxSingle} ${unit} single-dose maximum.`,
      ),
    );
  }
  return alerts.sort(severityOrder);
}

// --- pregnancy, breastfeeding, kidneys ------------------------------------------------------

export function checkPregnancy(
  drug: Drug,
  patient: Patient,
  ctx: CheckContext = {},
): SafetyAlert | null {
  const rules = ctx.rules ?? RULE_SET;
  const which =
    patient.pregnancy === 'pregnant'
      ? { rule: rules.pregnancy[drug.id], when: 'in pregnancy' }
      : patient.pregnancy === 'breastfeeding'
        ? { rule: rules.breastfeeding[drug.id], when: 'while breastfeeding' }
        : undefined;
  if (!which?.rule) return null;
  return {
    severity: LEVEL_SEVERITY[which.rule.level],
    type: 'pregnancy',
    message: `${drug.genericName} ${which.when}: ${which.rule.level}. ${which.rule.note}`,
    drugId: drug.id,
  };
}

export function checkKidney(
  drug: Drug,
  patient: Patient,
  ctx: CheckContext = {},
): SafetyAlert | null {
  const entries = (ctx.rules ?? RULE_SET).kidney[drug.id];
  if (!entries) return null;
  if (patient.kidney === 'unknown') {
    // Only worth asking about when a reduced function would rule it out.
    const serious = entries.find((e) => e.level === 'contraindicated' || e.level === 'avoid');
    return serious
      ? {
          severity: 'low',
          type: 'kidney',
          message: `Kidney function isn't recorded; ${drug.genericName} is ${serious.level === 'avoid' ? 'avoided' : 'contraindicated'} when it's ${serious.bands.join(' or ')}.`,
          drugId: drug.id,
        }
      : null;
  }
  if (patient.kidney === 'normal') return null;
  const entry = entries.find((e) => (e.bands as string[]).includes(patient.kidney));
  if (!entry) return null;
  return {
    severity: LEVEL_SEVERITY[entry.level],
    type: 'kidney',
    message: `${drug.genericName} with ${patient.kidney === 'dialysis' ? 'dialysis' : `${patient.kidney} kidney function`}${patient.egfr !== undefined ? ` (eGFR ${patient.egfr})` : ''}: ${entry.level}. ${entry.note}`,
    drugId: drug.id,
  };
}

// --- all of it -----------------------------------------------------------------------------

// Evaluate a medication row against the patient + catalog (+ the other rows).
export function evaluateMedication(
  med: RxMedication,
  patient: Patient,
  catalog: Drug[],
  ctx: CheckContext = {},
): SafetyAlert[] {
  const drug = findDrug(med.drugId, catalog);
  if (!drug) return [];
  const rules = ctx.rules ?? RULE_SET;
  const alerts: SafetyAlert[] = [];
  const a = checkAllergy(drug, patient, rules);
  if (a) alerts.push(a);
  alerts.push(...checkInteraction(drug, patient, catalog, ctx));
  const dup = checkDuplicateTherapy(drug, patient, catalog, ctx);
  if (dup) alerts.push(dup);
  alerts.push(...checkDose(drug, med, patient, ctx));
  const pregnancy = checkPregnancy(drug, patient, ctx);
  if (pregnancy) alerts.push(pregnancy);
  const kidney = checkKidney(drug, patient, ctx);
  if (kidney) alerts.push(kidney);
  return alerts.sort(severityOrder);
}

/** Every row's alerts, keyed by row id; each row is checked against the others too. */
export function evaluateAllMedications(
  meds: RxMedication[],
  patient: Patient,
  catalog: Drug[],
  ctx: Omit<CheckContext, 'others'> = {},
): Map<string, SafetyAlert[]> {
  const map = new Map<string, SafetyAlert[]>();
  for (const med of meds) {
    const others = meds.filter((m) => m.rowId !== med.rowId);
    map.set(med.rowId, evaluateMedication(med, patient, catalog, { ...ctx, others }));
  }
  return map;
}

// Severity rank for sorting
export const severityRank = (s: SafetyAlert['severity']): number =>
  s === 'critical' ? 3 : s === 'moderate' ? 2 : 1;

// Re-export helper for components
export { findDrug, drugKeyMatches };
