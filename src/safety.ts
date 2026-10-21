import type { Drug, Patient, RxMedication, SafetyAlert } from './types';

// Normalize for comparison
const norm = (s: string) => s.trim().toLowerCase();

// Token-based allergy match — patient says "Penicillin", drug has "penicillin" in contraindication list.
function allergyMatches(allergy: string, contraindications: string[]): boolean {
  const a = norm(allergy);
  return contraindications.some((c) => a.includes(c) || c.includes(a));
}

// Match by drug.id, genericName, or brandName
function drugKeyMatches(needle: string, drug: Drug): boolean {
  const n = norm(needle);
  if (norm(drug.id) === n) return true;
  if (norm(drug.genericName) === n) return true;
  return drug.brandNames.some((b) => norm(b) === n);
}

// Find a drug in the catalog by any known identifier (id/generic/brand)
function findDrug(needle: string, catalog: Drug[]): Drug | undefined {
  const n = norm(needle);
  return catalog.find(
    (d) =>
      norm(d.id) === n ||
      norm(d.genericName) === n ||
      d.brandNames.some((b) => norm(b) === n),
  );
}

export function checkAllergy(drug: Drug, patient: Patient): SafetyAlert | null {
  for (const allergy of patient.allergies) {
    if (allergyMatches(allergy, drug.contraindications)) {
      return {
        severity: 'critical',
        type: 'allergy',
        message: `Patient allergic to ${allergy}. ${drug.genericName} is contraindicated.`,
        drugId: drug.id,
      };
    }
  }
  return null;
}

export function checkInteraction(
  drug: Drug,
  patient: Patient,
  catalog: Drug[],
): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const activeGenericNames = patient.activeMedications.map((m) => norm(m.name));

  for (const interactToken of drug.interactsWith) {
    // Direct token match against active generic names
    const direct = activeGenericNames.find((n) => norm(interactToken) === n);
    if (direct) {
      alerts.push({
        severity: 'moderate',
        type: 'drug_interaction',
        message: `Potential interaction between ${drug.genericName} and existing ${interactToken}.`,
        drugId: drug.id,
      });
      continue;
    }
    // Or look up the token as a drug in catalog
    const other = findDrug(interactToken, catalog);
    if (other) {
      const activeHasOther = activeGenericNames.some((n) => norm(other.genericName) === n);
      if (activeHasOther) {
        alerts.push({
          severity: 'moderate',
          type: 'drug_interaction',
          message: `Potential interaction between ${drug.genericName} and ${other.genericName}.`,
          drugId: drug.id,
        });
      }
    }
  }
  return alerts;
}

export function checkDuplicateTherapy(
  drug: Drug,
  patient: Patient,
): SafetyAlert | null {
  const cls = norm(drug.therapeuticClass.split(' ')[0]); // e.g. "Antibiotic", "NSAID", "Statin"
  const dup = patient.activeMedications.find((m) => norm(m.name).includes(cls) || cls.includes(norm(m.name)));
  if (dup) {
    return {
      severity: 'low',
      type: 'duplicate_therapy',
      message: `Patient already on ${dup.name} (${dup.dose}). Same therapeutic class as ${drug.genericName}.`,
      drugId: drug.id,
    };
  }
  return null;
}

// Evaluate a medication row against the patient + catalog.
export function evaluateMedication(
  med: RxMedication,
  patient: Patient,
  catalog: Drug[],
): SafetyAlert[] {
  const drug = findDrug(med.drugId, catalog);
  if (!drug) return [];
  const alerts: SafetyAlert[] = [];
  const a = checkAllergy(drug, patient);
  if (a) alerts.push(a);
  alerts.push(...checkInteraction(drug, patient, catalog));
  const dup = checkDuplicateTherapy(drug, patient);
  if (dup) alerts.push(dup);
  return alerts;
}

export function evaluateAllMedications(
  meds: RxMedication[],
  patient: Patient,
  catalog: Drug[],
): Map<string, SafetyAlert[]> {
  const map = new Map<string, SafetyAlert[]>();
  for (const med of meds) {
    map.set(med.rowId, evaluateMedication(med, patient, catalog));
  }
  return map;
}

// Severity rank for sorting
export const severityRank = (s: SafetyAlert['severity']): number =>
  s === 'critical' ? 3 : s === 'moderate' ? 2 : 1;

// Re-export helper for components
export { findDrug, drugKeyMatches };