import { describe, expect, it } from 'vitest';
import { MOCK_DIAGNOSES, MOCK_DRUGS, type Drug } from '@swiftrx/shared';
import { findBrandMatches, fuzzySearch } from './search';

const drugFields = (d: Drug) => [d.genericName, d.brandNames.join(' '), d.therapeuticClass];
const self = (s: string) => [s];

describe('fuzzySearch', () => {
  it('returns nothing for a blank query', () => {
    expect(fuzzySearch(MOCK_DRUGS, '   ', drugFields)).toEqual([]);
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

  it('matches on any field and drops items that do not match', () => {
    expect(fuzzySearch(MOCK_DRUGS, 'ace inhibitor', drugFields).map((d) => d.id)).toEqual([
      'lisinopril',
    ]);
    expect(fuzzySearch(MOCK_DRUGS, 'zzz', drugFields)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(fuzzySearch(MOCK_DRUGS, 'a', drugFields, 3)).toHaveLength(3);
  });

  it('finds a diagnosis by its ICD-10 code', () => {
    const results = fuzzySearch(MOCK_DIAGNOSES, 'I10', (d) => [`${d.code} ${d.name}`, d.code]);
    expect(results[0]?.code).toBe('I10');
  });
});

describe('findBrandMatches', () => {
  it('maps a brand name to its generic drug', () => {
    expect(findBrandMatches('Panadol', MOCK_DRUGS)).toEqual([
      { drugId: 'para', genericName: 'Paracetamol', brandName: 'Panadol' },
    ]);
  });

  it('puts an exact brand match before partial ones', () => {
    const drugs = [
      { id: 'a', genericName: 'Alpha', brandNames: ['Fooplus'] },
      { id: 'b', genericName: 'Beta', brandNames: ['Foo'] },
    ];
    expect(findBrandMatches('foo', drugs).map((m) => m.brandName)).toEqual(['Foo', 'Fooplus']);
  });

  it('returns nothing for a blank query and respects the limit', () => {
    expect(findBrandMatches('  ', MOCK_DRUGS)).toEqual([]);
    expect(findBrandMatches('o', MOCK_DRUGS, 2)).toHaveLength(2);
  });
});
