// The Prescriptions page's search and filters. The page already has the
// hospital's signed Rx, so filtering happens here; the filters live in the
// URL (?q=&doctor=&dx=&from=&to=), so a filtered list survives a reload and
// can be shared.

import { medicineLabel, type SignedRx } from '@swiftrx/shared';

export interface RxFilters {
  /** Patient name or contact, Rx id, or a medicine's name. */
  q: string;
  /** A doctor's user id; '' for every doctor. */
  doctor: string;
  /** An ICD-10 code; '' for every diagnosis. */
  dx: string;
  /** Signed on or after this day (YYYY-MM-DD, Dhaka time); '' for no limit. */
  from: string;
  /** Signed on or before this day (YYYY-MM-DD, Dhaka time); '' for no limit. */
  to: string;
}

export const NO_FILTERS: RxFilters = { q: '', doctor: '', dx: '', from: '', to: '' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The filters in a URL's query; anything malformed counts as unset. */
export function filtersFrom(params: URLSearchParams): RxFilters {
  const day = (k: string) => {
    const v = params.get(k) ?? '';
    return DAY.test(v) ? v : '';
  };
  return {
    q: params.get('q') ?? '',
    doctor: params.get('doctor') ?? '',
    dx: params.get('dx') ?? '',
    from: day('from'),
    to: day('to'),
  };
}

/** `params` with the filters written in, set ones only; other keys (?hospital=) stay. */
export function withFilters(params: URLSearchParams, filters: RxFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(NO_FILTERS) as (keyof RxFilters)[]) {
    const v = filters[key].trim();
    if (v) next.set(key, filters[key]);
    else next.delete(key);
  }
  return next;
}

export const hasFilters = (f: RxFilters) =>
  Object.values(f).some((v) => (v as string).trim() !== '');

/** The day an Rx was signed in Bangladesh (UTC+6), as YYYY-MM-DD. */
export function dhakaDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
}

/** The prescriptions that match every set filter, in the order given. */
export function filterPrescriptions(list: SignedRx[], f: RxFilters): SignedRx[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((rx) => {
    if (f.doctor && rx.doctorId !== f.doctor) return false;
    if (f.dx && rx.diagnosis.code !== f.dx) return false;
    const day = dhakaDay(rx.signedAt);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (words.length === 0) return true;
    const haystack = [
      rx.patient.name,
      rx.patient.contact,
      rx.id,
      ...rx.medications.flatMap((m) => [m.genericName, medicineLabel(m)]),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Each doctor and diagnosis that appears in the list, for the filter menus. */
export function filterChoices(list: SignedRx[]) {
  const doctors = new Map<string, string>();
  const diagnoses = new Map<string, string>();
  for (const rx of list) {
    doctors.set(rx.doctorId, rx.doctorName);
    diagnoses.set(rx.diagnosis.code, rx.diagnosis.name);
  }
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  return {
    doctors: [...doctors].map(([value, label]) => ({ value, label })).sort(byLabel),
    diagnoses: [...diagnoses]
      .map(([value, name]) => ({ value, label: `${value} · ${name}` }))
      .sort(byLabel),
  };
}
