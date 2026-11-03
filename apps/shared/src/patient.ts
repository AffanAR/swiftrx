// Patient facts the apps and the safety checks work out from what's stored:
// age from the date of birth (an age written down goes stale), and the kidney
// band from an eGFR result.

import type { KidneyFunction, Patient, PregnancyStatus } from './types';

/** Whole years old on `on` (a date or YYYY-MM-DD; default today). */
export function ageOn(dateOfBirth: string, on: Date | string = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const at = typeof on === 'string' ? new Date(on) : on;
  let age = at.getUTCFullYear() - y;
  const beforeBirthday =
    at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** Whole months old on `on`, for babies and dosing by age band. */
export function ageInMonthsOn(dateOfBirth: string, on: Date | string = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const at = typeof on === 'string' ? new Date(on) : on;
  let months = (at.getUTCFullYear() - y) * 12 + (at.getUTCMonth() + 1 - m);
  if (at.getUTCDate() < d) months -= 1;
  return Math.max(0, months);
}

/** "42", or "8 mo" under two years: how the apps print an age. */
export function ageLabel(p: Pick<Patient, 'dateOfBirth'>, on: Date | string = new Date()): string {
  const months = ageInMonthsOn(p.dateOfBirth, on);
  return months < 24 ? `${months} mo` : String(ageOn(p.dateOfBirth, on));
}

/** "42M", or "8 mo, M" for a baby: the apps' short age-and-sex label. */
export function ageSexLabel(
  p: Pick<Patient, 'dateOfBirth' | 'sex'>,
  on: Date | string = new Date(),
): string {
  const age = ageLabel(p, on);
  return age.endsWith('mo') ? `${age}, ${p.sex}` : `${age}${p.sex}`;
}

/**
 * The date of birth for an age the patient gives, as YYYY-MM-DD: today's
 * date that many years ago. Store it with `dateOfBirthEstimated: true`.
 */
export function dateOfBirthForAge(years: number, today: Date = new Date()): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate()),
  );
  return d.toISOString().slice(0, 10);
}

/** Below this age, pregnancy doesn't apply. */
export const PREGNANCY_MIN_AGE = 10;

/**
 * The pregnancy status to store for what a form asked: "not_applicable" for
 * a man or a child under PREGNANCY_MIN_AGE, whatever was chosen; otherwise
 * the choice.
 */
export function pregnancyFor(
  p: Pick<Patient, 'sex' | 'dateOfBirth'>,
  chosen: PregnancyStatus,
  today: Date = new Date(),
): PregnancyStatus {
  if (p.sex === 'M' || ageOn(p.dateOfBirth, today) < PREGNANCY_MIN_AGE) return 'not_applicable';
  return chosen;
}

/** The band an eGFR result falls in. */
export function kidneyBand(egfr: number): Exclude<KidneyFunction, 'unknown' | 'dialysis'> {
  if (egfr >= 60) return 'normal';
  if (egfr >= 30) return 'moderate';
  if (egfr >= 15) return 'severe';
  return 'failure';
}

export const PREGNANCY_LABELS: Record<PregnancyStatus, string> = {
  not_applicable: 'Not applicable',
  unknown: 'Not asked',
  not_pregnant: 'Not pregnant',
  pregnant: 'Pregnant',
  breastfeeding: 'Breastfeeding',
};

export const KIDNEY_LABELS: Record<KidneyFunction, string> = {
  unknown: 'Not known',
  normal: 'Normal (eGFR ≥ 60)',
  moderate: 'Moderately reduced (eGFR 30–59)',
  severe: 'Severely reduced (eGFR 15–29)',
  failure: 'Kidney failure (eGFR < 15)',
  dialysis: 'On dialysis',
};
