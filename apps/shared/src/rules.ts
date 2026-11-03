// =============================================================================
//  SwiftRx Shared — Clinical rule set
// =============================================================================
//  The rules the safety checks apply, kept as data (rules/ruleset.json), not
//  code, so a clinician's review is a review of one file and its history:
//
//    - allergyGroups: drugs a patient allergic to the group mustn't get,
//      matched by ingredient (word start) or drug class. The catalog's classes
//      are uneven (diclofenac is under "Drugs for Osteoarthritis"), so
//      ingredients are the main match;
//    - crossReactions: an allergy to one group warns about another, at a
//      lower severity (penicillin allergy → cephalosporins);
//    - doses: per generic, in one unit, by age band: a single-dose and a daily
//      maximum, and a per-kg-per-day range for children;
//    - pregnancy / breastfeeding and kidney: per generic, how much to worry;
//    - interactions: pairs of ingredients.
//
//  The pad and the server load the same file, and every signed prescription
//  records the `version` it was checked against (prescriptions.ts). Bump the
//  version with any change, and don't mark a version "reviewed" without the
//  clinician's dated sign-off (CONTRIBUTING.md, "Clinical safety changes").
// =============================================================================

import { z } from 'zod';

import ruleSetJson from './rules/ruleset.json';

const severity = z.enum(['low', 'moderate', 'critical']);
const level = z.enum(['caution', 'reduce', 'avoid', 'contraindicated']);
const note = z.string().trim().min(1);
const genericId = z.string().regex(/^g\d+$/, 'A generic id from drugs.json, like "g860".');
const lowerTerms = z
  .array(
    z
      .string()
      .trim()
      .min(2)
      .regex(/^[a-z0-9 -]+$/, 'Lowercase words only.'),
  )
  .min(1);

const ageMonths = z.int().min(0).max(1800);

export const doseBandSchema = z
  .object({
    /** Inclusive; open-ended when left out. */
    minAgeMonths: ageMonths.optional(),
    maxAgeMonths: ageMonths.optional(),
    /** Per kg of body weight per day, for children. */
    perKgDay: z.object({ min: z.number().positive(), max: z.number().positive() }).optional(),
    maxSingle: z.number().positive().optional(),
    maxDaily: z.number().positive().optional(),
    note: note.optional(),
  })
  .refine((b) => b.perKgDay || b.maxSingle || b.maxDaily, {
    message: 'A dose band needs a per-kg range, a single maximum or a daily maximum.',
  })
  .refine((b) => !b.perKgDay || b.perKgDay.min <= b.perKgDay.max, {
    message: 'perKgDay.min is above perKgDay.max.',
  })
  .refine(
    (b) =>
      b.minAgeMonths === undefined ||
      b.maxAgeMonths === undefined ||
      b.minAgeMonths <= b.maxAgeMonths,
    { message: 'minAgeMonths is above maxAgeMonths.' },
  );

export const ruleSetSchema = z.object({
  /** Bumped with every change; a signed Rx records it. "-draft" until reviewed. */
  version: z.string().regex(/^\d+\.\d+\.\d+(-draft)?$/),
  status: z.enum(['draft', 'reviewed']),
  /** Who signed off this version, and when (YYYY-MM-DD); null for a draft. */
  reviewedBy: z.string().nullable(),
  reviewedOn: z.iso.date().nullable(),
  note: z.string(),
  allergyGroups: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z-]+$/),
        label: note,
        /** Words a recorded allergy may contain: "penicillin", "sulfa". */
        allergyTerms: lowerTerms,
        /** Ingredients in the group, matched at the start of a word of a generic's name. */
        ingredients: lowerTerms,
        /** Words of drug classes that put a generic in the group. */
        classes: z.array(z.string().trim().min(3)).default([]),
      }),
    )
    .min(1),
  crossReactions: z.array(
    z.object({
      allergyGroup: z.string(),
      drugGroup: z.string(),
      severity,
      note,
    }),
  ),
  doses: z.record(
    genericId,
    z.object({
      /** The unit every limit below is in. */
      unit: z.enum(['mg', 'mcg', 'g']),
      bands: z.array(doseBandSchema).min(1),
    }),
  ),
  pregnancy: z.record(genericId, z.object({ level, note })),
  breastfeeding: z.record(genericId, z.object({ level, note })),
  kidney: z.record(
    genericId,
    z
      .array(
        z.object({
          bands: z.array(z.enum(['moderate', 'severe', 'failure', 'dialysis'])).min(1),
          level,
          note,
        }),
      )
      .min(1),
  ),
  interactions: z.array(
    z.object({
      /** Two ingredients, matched like allergy-group ingredients. */
      between: z.tuple([z.string().regex(/^[a-z-]+$/), z.string().regex(/^[a-z-]+$/)]),
      severity,
      note,
    }),
  ),
});

export type RuleSet = z.infer<typeof ruleSetSchema>;
export type DoseBand = z.infer<typeof doseBandSchema>;
export type RuleLevel = z.infer<typeof level>;

/**
 * The rule set the pad and the server check against. Parsed on load, so a
 * mistake in the file fails at start-up with the path to it, not later
 * inside a check.
 */
export const RULE_SET: RuleSet = ruleSetSchema
  .refine((r) => (r.status === 'reviewed') === !r.version.endsWith('-draft'), {
    message: 'A "-draft" version is status "draft", and a reviewed one isn\'t "-draft".',
  })
  .refine((r) => r.status === 'draft' || (r.reviewedBy !== null && r.reviewedOn !== null), {
    message: 'A reviewed rule set names who reviewed it, and when.',
  })
  .refine(
    (r) => {
      const ids = new Set(r.allergyGroups.map((g) => g.id));
      return r.crossReactions.every((x) => ids.has(x.allergyGroup) && ids.has(x.drugGroup));
    },
    { message: "A cross-reaction names an allergy group that doesn't exist." },
  )
  .parse(ruleSetJson);

/** Whether `ingredient` starts a word of `genericName` ("amox" in "Amoxicillin Trihydrate"). */
export function hasIngredient(genericName: string, ingredient: string): boolean {
  const words = genericName.toLowerCase().split(/[^a-z0-9]+/);
  return words.some((w) => w.startsWith(ingredient));
}
