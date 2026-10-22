import { describe, expect, it } from 'vitest';
import { renderRxHtml, rxPageSizeMm } from './print';
import { DEFAULT_RX_DESIGN, type RxDesign, type SignedRx } from './types';

const PATIENT: SignedRx['patient'] = {
  id: 'p_test',
  hospitalSlug: 'city-hospital',
  name: 'Bilal Ahmed',
  age: 42,
  sex: 'M',
  weightKg: 78,
  contact: '+92-300-1234567',
  allergies: ['Penicillin'],
  activeProblems: [],
  activeMedications: [],
  recentVitals: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MED: SignedRx['medications'][number] = {
  rowId: 'r1',
  drugId: 'lisinopril',
  genericName: 'Lisinopril',
  brandName: 'Zestril',
  dosage: { value: 10, unit: 'mg' },
  frequency: 'QD',
  durationDays: 90,
  instructions: 'Same time daily',
};

const rx = (overrides: Partial<SignedRx> = {}): SignedRx => ({
  id: 'rx_test1',
  signedAt: '2026-10-22T09:30:00.000Z',
  hospitalSlug: 'city-hospital',
  patient: PATIENT,
  diagnosis: { code: 'I10', name: 'Essential (primary) hypertension', category: 'Cardiovascular' },
  medications: [MED],
  investigations: [{ code: 'BMP', name: 'Basic Metabolic Panel', type: 'lab' }],
  doctorId: 'd_001',
  doctorName: 'Dr. Ayesha Khan',
  doctorLicense: 'PMDC-44121',
  ...overrides,
});

const design = (overrides: Partial<RxDesign> = {}): RxDesign => ({
  ...DEFAULT_RX_DESIGN,
  ...overrides,
});

describe('renderRxHtml', () => {
  it('renders the patient, diagnosis, tests, medicines and signer', () => {
    const html = renderRxHtml(rx(), design());
    for (const text of [
      'Bilal Ahmed',
      'ALLERGIES: Penicillin',
      'I10',
      'Essential (primary) hypertension',
      'Basic Metabolic Panel',
      'Lisinopril',
      '(Zestril)',
      'Same time daily',
      'Dr. Ayesha Khan',
      'PMDC-44121',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('marks a signed prescription as verified, with a valid-until date', () => {
    const html = renderRxHtml(rx(), design());
    expect(html).toContain('Verified digitally');
    expect(html).toContain('Valid until');
    expect(html).not.toContain('DRAFT');
  });

  it('marks a draft as not valid, without the signature hash or valid-until date', () => {
    const html = renderRxHtml(rx(), design(), { draft: true });
    expect(html).toContain('NOT A VALID PRESCRIPTION');
    expect(html).toContain('Unsigned draft');
    expect(html).not.toContain('Verified digitally');
    expect(html).not.toContain('Valid until');
  });

  it('escapes text from the prescription and the design', () => {
    const html = renderRxHtml(
      rx({
        patient: { ...PATIENT, name: '<img src=x onerror=alert(1)>' },
        medications: [{ ...MED, instructions: '"><script>alert(2)</script>' }],
      }),
      design({ headerTitle: '<b>Clinic</b>' }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Clinic</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('falls back to the default accent when the design color is not a hex color', () => {
    const html = renderRxHtml(rx(), design({ accentColor: 'red;" onmouseover="alert(1)' }));
    expect(html).not.toContain('onmouseover');
    expect(html).toContain(DEFAULT_RX_DESIGN.accentColor);
  });

  it('uses a valid accent color', () => {
    expect(renderRxHtml(rx(), design({ accentColor: '#6366f1' }))).toContain('#6366f1');
  });

  it('shows the watermark the design asks for', () => {
    expect(renderRxHtml(rx(), design({ watermark: 'confidential' }))).toContain('CONFIDENTIAL');
    expect(
      renderRxHtml(rx(), design({ watermark: 'hospital', headerTitle: 'City Hospital' })),
    ).toContain('CITY HOSPITAL');
    expect(renderRxHtml(rx(), design({ watermark: 'doctor' }))).toContain('DR. AYESHA KHAN');
    expect(renderRxHtml(rx(), design({ watermark: 'none' }))).not.toContain('rotate(-22deg)');
  });

  it('leaves out the allergy banner when the design turns it off or there are no allergies', () => {
    expect(renderRxHtml(rx(), design({ showAllergyBanner: false }))).not.toContain('ALLERGIES');
    expect(renderRxHtml(rx({ patient: { ...PATIENT, allergies: [] } }), design())).not.toContain(
      'ALLERGIES',
    );
  });

  it('renders older prescriptions that have no investigations list', () => {
    const old = { ...rx(), investigations: undefined } as unknown as SignedRx;
    const html = renderRxHtml(old, design());
    expect(html).not.toContain('Advised Investigations');
    expect(html).toContain('Lisinopril');
  });
});

describe('rxPageSizeMm', () => {
  it('returns paper sizes in millimetres, swapped for landscape', () => {
    expect(rxPageSizeMm({ pageSize: 'A4', landscape: false })).toEqual({
      widthMm: 210,
      heightMm: 297,
    });
    expect(rxPageSizeMm({ pageSize: 'A5', landscape: false })).toEqual({
      widthMm: 148,
      heightMm: 210,
    });
    expect(rxPageSizeMm({ pageSize: 'Letter', landscape: false })).toEqual({
      widthMm: 215.9,
      heightMm: 279.4,
    });
    expect(rxPageSizeMm({ pageSize: 'A4', landscape: true })).toEqual({
      widthMm: 297,
      heightMm: 210,
    });
  });
});
