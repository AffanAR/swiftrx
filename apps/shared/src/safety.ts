// The prescription safety checks: allergies, interactions with the patient's
// own medicines, and duplicate therapy. Pure functions of the pad's rows, the
// patient and the catalog, so the Rx pad runs them as the doctor types and the
// server runs them again when it signs (apps/api/src/prescriptions.ts), and the
// two can't disagree.

import type { Drug, Patient, RxMedication, SafetyAlert } from './types';

/**
 * How long, in characters, a doctor's reason must be to sign through a
 * critical (allergy) alert. The pad asks for it; the server refuses less.
 */
export const MIN_OVERRIDE_REASON = 10;

// Normalize for comparison
const norm = (s: string) => s.trim().toLowerCase();

// The name a generic goes by without its salt or form: "Metformin
// Hydrochloride" → "metformin", "Salbutamol (Inhaler)" → "salbutamol". A
// patient's medication list says "Metformin"; the catalog says the full name.
export const baseName = (s: string) => norm(s).split(/[\s(+,/]/)[0];

// Token-based allergy match: the patient says "Penicillin" and the drug lists
// "penicillin" as a contraindication, or the allergy's word is in the drug's
// generic name or class ("Sulfa drugs" → Sulfamethoxazole; "Penicillin" →
// "Broad spectrum penicillins"). Imported generics have no contraindication
// list, so the name and class are what catch them.
function allergyMatches(allergy: string, drug: Drug): boolean {
  const a = norm(allergy);
  if (!a) return false;
  if (drug.contraindications.some((c) => a.includes(c) || c.includes(a))) return true;
  const word = a.split(/\s+/)[0].replace(/s$/, '');
  if (word.length < 4) return false;
  return norm(drug.genericName).includes(word) || norm(drug.therapeuticClass).includes(word);
}

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

export function checkAllergy(drug: Drug, patient: Patient): SafetyAlert | null {
  for (const allergy of patient.allergies) {
    if (allergyMatches(allergy, drug)) {
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

export function checkInteraction(drug: Drug, patient: Patient, catalog: Drug[]): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const own = baseName(drug.genericName);
  for (const med of patient.activeMedications) {
    const base = baseName(med.name);
    if (base === own) continue; // the same drug is a duplicate, not an interaction
    const other = findByBaseName(med.name, catalog);
    // Either side's list counts: Ibuprofen lists lisinopril, and Lisinopril ibuprofen.
    const listed =
      drug.interactsWith.some((t) => baseName(t) === base) ||
      (other?.interactsWith.some((t) => baseName(t) === own) ?? false);
    if (listed) {
      alerts.push({
        severity: 'moderate',
        type: 'drug_interaction',
        message: `Potential interaction between ${drug.genericName} and existing ${med.name}.`,
        drugId: drug.id,
      });
    }
  }
  return alerts;
}

// The same generic, or another generic of the same class, that the patient
// already takes. Needs the catalog to know an existing medication's class.
export function checkDuplicateTherapy(
  drug: Drug,
  patient: Patient,
  catalog: Drug[],
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
  const dup = checkDuplicateTherapy(drug, patient, catalog);
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
