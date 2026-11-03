import { describe, expect, it } from 'vitest';

import { MOCK_DRUGS } from './mockDb';
import { RULE_SET, hasIngredient, ruleSetSchema } from './rules';

const drugById = new Map(MOCK_DRUGS.map((d) => [d.id, d]));
const matches = (ingredient: string) =>
  MOCK_DRUGS.filter((d) => hasIngredient(d.genericName, ingredient));

describe('hasIngredient', () => {
  it('matches the start of any word of a generic, ignoring case', () => {
    expect(hasIngredient('Amoxicillin Trihydrate', 'amoxicillin')).toBe(true);
    expect(hasIngredient('Amoxicillin + Clavulanic Acid', 'clavulanic')).toBe(true);
    expect(hasIngredient('Cefuroxime Axetil', 'cef')).toBe(true);
    // Not the middle of a word: "penicillin" isn't in "Phenoxymethylpenicillin" this way.
    expect(hasIngredient('Phenoxymethylpenicillin', 'penicillin')).toBe(false);
    expect(hasIngredient('Paracetamol', 'aspirin')).toBe(false);
  });
});

describe('the rule set', () => {
  it('is a draft until a clinician signs it off', () => {
    expect(RULE_SET.version).toMatch(/^\d+\.\d+\.\d+-draft$/);
    expect(RULE_SET.status).toBe('draft');
    expect(RULE_SET.reviewedBy).toBeNull();
  });

  it('only names generics that are in the catalog', () => {
    const named = [
      ...Object.keys(RULE_SET.doses),
      ...Object.keys(RULE_SET.pregnancy),
      ...Object.keys(RULE_SET.breastfeeding),
      ...Object.keys(RULE_SET.kidney),
    ];
    for (const id of named) expect(drugById.has(id), id).toBe(true);
  });

  it('has dose limits for every generic with reviewed safety data', () => {
    const reviewed = MOCK_DRUGS.filter((d) => d.safetyReviewed).map((d) => d.id);
    expect(reviewed.length).toBeGreaterThan(0);
    for (const id of reviewed) expect(RULE_SET.doses[id], id).toBeDefined();
  });

  it("doesn't let a generic's dose bands overlap in age", () => {
    for (const [id, { bands }] of Object.entries(RULE_SET.doses)) {
      const ranges = bands
        .map((b) => [b.minAgeMonths ?? 0, b.maxAgeMonths ?? Infinity] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i][0] > ranges[i - 1][1], `${id}: bands overlap`).toBe(true);
      }
    }
  });

  it('has allergy groups and interactions that match real generics', () => {
    for (const group of RULE_SET.allergyGroups) {
      const members = MOCK_DRUGS.filter(
        (d) =>
          group.ingredients.some((i) => hasIngredient(d.genericName, i)) ||
          group.classes.some((c) => d.therapeuticClass.toLowerCase().includes(c)),
      );
      expect(members.length, group.id).toBeGreaterThan(0);
    }
    for (const { between } of RULE_SET.interactions) {
      for (const ingredient of between) {
        expect(matches(ingredient).length, ingredient).toBeGreaterThan(0);
      }
    }
  });

  it('refuses a band with no limit, or a range upside down', () => {
    const bad = structuredClone(RULE_SET);
    bad.doses.g860.bands[0] = { minAgeMonths: 144 };
    expect(ruleSetSchema.safeParse(bad).success).toBe(false);
    const flipped = structuredClone(RULE_SET);
    flipped.doses.g860.bands[1].perKgDay = { min: 75, max: 40 };
    expect(ruleSetSchema.safeParse(flipped).success).toBe(false);
  });
});
