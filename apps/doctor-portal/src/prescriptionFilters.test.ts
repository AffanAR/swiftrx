import { describe, expect, it } from 'vitest';
import { MOCK_SIGNED_RX, type SignedRx } from '@swiftrx/shared';
import {
  NO_FILTERS,
  dhakaDay,
  filterChoices,
  filterPrescriptions,
  filtersFrom,
  hasFilters,
  withFilters,
} from './prescriptionFilters';

const base = MOCK_SIGNED_RX[0];
/** A small list: three Rx on three days, two doctors, two diagnoses. */
const list: SignedRx[] = [
  {
    ...base,
    id: 'rx_a',
    signedAt: '2026-10-01T03:00:00.000Z',
    doctorId: 'd_1',
    doctorName: 'Dr. One',
    patient: { ...base.patient, name: 'Rahima Begum', contact: '+880-1711-000001' },
    diagnosis: { ...base.diagnosis, code: 'I10', name: 'Hypertension' },
    medications: [{ ...base.medications[0], genericName: 'Amlodipine', brandName: 'Camlodin' }],
  },
  {
    ...base,
    id: 'rx_b',
    // 20:00 UTC on the 14th is already the 15th in Dhaka.
    signedAt: '2026-10-14T20:00:00.000Z',
    doctorId: 'd_2',
    doctorName: 'Dr. Two',
    patient: { ...base.patient, name: 'Karim Uddin', contact: '+880-1811-000002' },
    diagnosis: { ...base.diagnosis, code: 'J02.9', name: 'Pharyngitis' },
    medications: [{ ...base.medications[0], genericName: 'Amoxicillin', brandName: undefined }],
  },
  {
    ...base,
    id: 'rx_c',
    signedAt: '2026-10-30T05:00:00.000Z',
    doctorId: 'd_1',
    doctorName: 'Dr. One',
    patient: { ...base.patient, name: 'Rahima Akter', contact: '—' },
    diagnosis: { ...base.diagnosis, code: 'I10', name: 'Hypertension' },
    medications: [{ ...base.medications[0], genericName: 'Lisinopril', brandName: undefined }],
  },
];
const ids = (l: SignedRx[]) => l.map((r) => r.id);
const only = (f: Partial<typeof NO_FILTERS>) =>
  ids(filterPrescriptions(list, { ...NO_FILTERS, ...f }));

describe('filterPrescriptions', () => {
  it('keeps everything with no filters', () => {
    expect(only({})).toEqual(['rx_a', 'rx_b', 'rx_c']);
  });

  it('searches patient names, contacts, Rx ids and medicines, every word', () => {
    expect(only({ q: 'rahima' })).toEqual(['rx_a', 'rx_c']);
    expect(only({ q: 'Rahima begum' })).toEqual(['rx_a']);
    expect(only({ q: '1811' })).toEqual(['rx_b']);
    expect(only({ q: 'rx_c' })).toEqual(['rx_c']);
    expect(only({ q: 'camlodin' })).toEqual(['rx_a']);
    expect(only({ q: 'amoxicillin' })).toEqual(['rx_b']);
    expect(only({ q: 'nobody' })).toEqual([]);
  });

  it('filters by doctor and diagnosis', () => {
    expect(only({ doctor: 'd_1' })).toEqual(['rx_a', 'rx_c']);
    expect(only({ dx: 'J02.9' })).toEqual(['rx_b']);
    expect(only({ doctor: 'd_2', dx: 'I10' })).toEqual([]);
  });

  it('filters by the day signed in Dhaka, both ends included', () => {
    expect(dhakaDay('2026-10-14T20:00:00.000Z')).toBe('2026-10-15');
    expect(only({ from: '2026-10-15' })).toEqual(['rx_b', 'rx_c']);
    expect(only({ to: '2026-10-14' })).toEqual(['rx_a']);
    expect(only({ from: '2026-10-15', to: '2026-10-15' })).toEqual(['rx_b']);
  });
});

describe('filters in the URL', () => {
  it('read back what was written, and keep other parameters', () => {
    const f = { ...NO_FILTERS, q: 'rahima', doctor: 'd_1', from: '2026-10-01' };
    const params = withFilters(new URLSearchParams('hospital=city-hospital&dx=I10'), f);
    expect(params.get('hospital')).toBe('city-hospital');
    expect(params.has('dx')).toBe(false);
    expect(filtersFrom(params)).toEqual(f);
    expect(hasFilters(f)).toBe(true);
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });

  it('ignore a malformed date', () => {
    expect(filtersFrom(new URLSearchParams('from=yesterday&to=2026-13'))).toEqual(NO_FILTERS);
  });
});

describe('filterChoices', () => {
  it('lists each doctor and diagnosis once, by name', () => {
    expect(filterChoices(list)).toEqual({
      doctors: [
        { value: 'd_1', label: 'Dr. One' },
        { value: 'd_2', label: 'Dr. Two' },
      ],
      diagnoses: [
        { value: 'I10', label: 'I10 · Hypertension' },
        { value: 'J02.9', label: 'J02.9 · Pharyngitis' },
      ],
    });
  });
});
