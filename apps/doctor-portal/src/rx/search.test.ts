import { describe, expect, it } from 'vitest';
import { MOCK_DIAGNOSES, type Brand, type Drug } from '@swiftrx/shared';
import { demoCatalog } from '@swiftrx/shared/seedData';
import { buildMedicineIndex, fuzzySearch, searchMedicines, type MedicineHit } from './search';

const self = (s: string) => [s];
const label = (h: MedicineHit) =>
  h.kind === 'brand' ? `${h.brand.name} ${h.brand.strength ?? ''}`.trim() : h.drug.genericName;

describe('fuzzySearch', () => {
  it('returns nothing for a blank query', () => {
    expect(fuzzySearch(['Asthma'], '   ', self)).toEqual([]);
  });

  it('ranks a match at the start above one later in the text', () => {
    expect(fuzzySearch(['Chronic asthma', 'Asthma'], 'asth', self)).toEqual([
      'Asthma',
      'Chronic asthma',
    ]);
  });

  it('ignores case and accents', () => {
    expect(fuzzySearch(['Paracetamol'], 'PARACÉTAMOL', self)).toEqual(['Paracetamol']);
  });

  it('matches on any field, drops items that do not match and respects the limit', () => {
    const items = [
      { a: 'Alpha', b: 'one' },
      { a: 'Beta', b: 'two' },
      { a: 'Gamma', b: 'three' },
    ];
    expect(fuzzySearch(items, 'two', (i) => [i.a, i.b]).map((i) => i.a)).toEqual(['Beta']);
    expect(fuzzySearch(items, 'zzz', (i) => [i.a, i.b])).toEqual([]);
    expect(fuzzySearch(items, 'a', (i) => [i.a], 2)).toHaveLength(2);
  });

  it('finds a diagnosis by its ICD-10 code', () => {
    const results = fuzzySearch(MOCK_DIAGNOSES, 'I10', (d) => [`${d.code} ${d.name}`, d.code]);
    expect(results[0]?.code).toBe('I10');
  });
});

describe('searchMedicines', () => {
  const index = buildMedicineIndex(demoCatalog());

  it('finds a Bangladeshi brand by name, with its strengths and forms', () => {
    const hits = searchMedicines(index, 'napa');
    expect(hits[0]).toMatchObject({ kind: 'brand', brand: { name: 'Napa' } });
    expect(hits[0].drug.genericName).toBe('Paracetamol');
    expect(hits.map(label)).toContain('Napa 500 mg');
  });

  it('finds a generic by name, and some of its brands', () => {
    const hits = searchMedicines(index, 'paracetamol');
    const generic = hits.find((h) => h.kind === 'generic' && h.drug.genericName === 'Paracetamol');
    expect(generic).toBeDefined();
    expect(hits.some((h) => h.kind === 'brand' && h.drug.genericName === 'Paracetamol')).toBe(true);
  });

  it('puts an exact name before a longer one', () => {
    const drug: Drug = {
      id: 'g1',
      genericName: 'Alpha',
      therapeuticClass: 'X',
      safetyReviewed: false,
      contraindications: [],
      interactsWith: [],
    };
    const brand = (id: string, name: string): Brand => ({
      id,
      name,
      drugId: 'g1',
      form: 'Tablet',
      manufacturer: 'M',
    });
    const small = buildMedicineIndex({
      drugs: [drug],
      brands: [brand('b1', 'Fooplus'), brand('b2', 'Foo')],
    });
    expect(searchMedicines(small, 'foo').map(label)).toEqual(['Foo', 'Fooplus']);
  });

  it('returns nothing for a blank query and respects the limit', () => {
    expect(searchMedicines(index, '  ')).toEqual([]);
    expect(searchMedicines(index, 'a', 5)).toHaveLength(5);
  });
});
