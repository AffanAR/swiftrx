import { describe, expect, it } from 'vitest';
import { medicineLabel, shortForm } from './medicine';

describe('shortForm', () => {
  it('shortens the usual dosage forms', () => {
    expect(shortForm('Tablet')).toBe('Tab.');
    expect(shortForm('Tablet (Extended Release)')).toBe('Tab.');
    expect(shortForm('Chewable Tablet')).toBe('Chew. Tab.');
    expect(shortForm('Capsule (Delayed Release)')).toBe('Cap.');
    expect(shortForm('Syrup')).toBe('Syr.');
    expect(shortForm('Powder for Suspension')).toBe('Susp.');
    expect(shortForm('IM/IV Injection')).toBe('Inj.');
    expect(shortForm('Pediatric Drops')).toBe('Drops');
  });

  it('writes other forms out', () => {
    expect(shortForm('Cream')).toBe('Cream');
  });
});

describe('medicineLabel', () => {
  it('writes a brand as on a Bangladeshi prescription', () => {
    expect(
      medicineLabel({
        genericName: 'Paracetamol',
        brandName: 'Napa',
        form: 'Tablet',
        strength: '500 mg',
      }),
    ).toBe('Tab. Napa 500 mg');
  });

  it('writes a row without a brand as its generic', () => {
    expect(medicineLabel({ genericName: 'Paracetamol' })).toBe('Paracetamol');
  });
});
