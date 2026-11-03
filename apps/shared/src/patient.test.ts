import { describe, expect, it } from 'vitest';
import {
  ageInMonthsOn,
  ageLabel,
  ageOn,
  ageSexLabel,
  dateOfBirthForAge,
  kidneyBand,
  pregnancyFor,
} from './patient';

describe('ageOn', () => {
  it('counts a year only once the birthday has come', () => {
    expect(ageOn('1984-03-14', '2026-03-13')).toBe(41);
    expect(ageOn('1984-03-14', '2026-03-14')).toBe(42);
    expect(ageOn('1984-03-14', '2026-12-31')).toBe(42);
  });

  it('handles a 29 February birthday and a birth today', () => {
    expect(ageOn('2000-02-29', '2025-02-28')).toBe(24);
    expect(ageOn('2000-02-29', '2025-03-01')).toBe(25);
    expect(ageOn('2026-11-03', '2026-11-03')).toBe(0);
  });
});

describe('ageInMonthsOn and the labels', () => {
  it('counts months for babies', () => {
    expect(ageInMonthsOn('2026-03-15', '2026-11-14')).toBe(7);
    expect(ageInMonthsOn('2026-03-15', '2026-11-15')).toBe(8);
  });

  it('writes months under two years, and years after', () => {
    expect(ageLabel({ dateOfBirth: '2026-03-15' }, '2026-11-15')).toBe('8 mo');
    expect(ageLabel({ dateOfBirth: '2024-11-16' }, '2026-11-15')).toBe('23 mo');
    expect(ageLabel({ dateOfBirth: '2024-11-15' }, '2026-11-15')).toBe('2');
    expect(ageSexLabel({ dateOfBirth: '1984-03-14', sex: 'M' }, '2026-11-15')).toBe('42M');
    expect(ageSexLabel({ dateOfBirth: '2026-03-15', sex: 'F' }, '2026-11-15')).toBe('8 mo, F');
  });
});

describe('dateOfBirthForAge', () => {
  it("gives today's date that many years ago, which ageOn reads back", () => {
    const today = new Date('2026-11-03T10:00:00Z');
    expect(dateOfBirthForAge(42, today)).toBe('1984-11-03');
    expect(ageOn(dateOfBirthForAge(42, today), today)).toBe(42);
    expect(dateOfBirthForAge(0, today)).toBe('2026-11-03');
  });
});

describe('kidneyBand', () => {
  it('puts eGFR results in the dosing bands, edges included', () => {
    expect(kidneyBand(95)).toBe('normal');
    expect(kidneyBand(60)).toBe('normal');
    expect(kidneyBand(59.9)).toBe('moderate');
    expect(kidneyBand(30)).toBe('moderate');
    expect(kidneyBand(29)).toBe('severe');
    expect(kidneyBand(15)).toBe('severe');
    expect(kidneyBand(14)).toBe('failure');
  });
});

describe('pregnancyFor', () => {
  const today = new Date('2026-11-03T10:00:00Z');
  it('is not applicable for a man or a young child, whatever was chosen', () => {
    expect(pregnancyFor({ sex: 'M', dateOfBirth: '1990-01-01' }, 'pregnant', today)).toBe(
      'not_applicable',
    );
    expect(pregnancyFor({ sex: 'F', dateOfBirth: '2026-03-15' }, 'unknown', today)).toBe(
      'not_applicable',
    );
    expect(pregnancyFor({ sex: 'F', dateOfBirth: '2017-01-01' }, 'unknown', today)).toBe(
      'not_applicable',
    );
  });

  it('keeps the choice for a girl of ten or a woman', () => {
    expect(pregnancyFor({ sex: 'F', dateOfBirth: '2016-11-03' }, 'unknown', today)).toBe('unknown');
    expect(pregnancyFor({ sex: 'F', dateOfBirth: '1992-09-18' }, 'pregnant', today)).toBe(
      'pregnant',
    );
  });
});
