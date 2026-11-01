// =============================================================================
//  SwiftRx Shared — Runtime schemas
// =============================================================================
//  zod schemas for the shapes in types.ts, so the API and the apps validate the
//  same thing: the API checks what a client sends (and the seed data it loads),
//  and the data client can check what the API answers.
//
//  types.ts stays the contract. Each schema here must parse to exactly its
//  hand-written type; the `SchemasMatchTypes` check at the bottom fails the
//  type check when the two drift apart.
//
//  Server-only code imports this file directly (`@swiftrx/shared/schemas`)
//  rather than through the index, which also pulls in React.
// =============================================================================

import { z } from 'zod';

import type {
  AuditEvent,
  Brand,
  Diagnosis,
  Drug,
  Hospital,
  HospitalFeatures,
  Investigation,
  Patient,
  QuickPack,
  QuickPackMed,
  RxDesign,
  RxMedication,
  SafetyAlert,
  SignedRx,
  User,
} from './types';

/** An ISO 8601 UTC timestamp, as `Date.prototype.toISOString()` writes it. */
const timestamp = z.iso.datetime();

/** Lowercase words joined by single hyphens: the hospital's subdomain. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG_PATTERN, 'Use lowercase letters, digits and single hyphens.');

/** A six-digit hex color; the print template refuses anything else. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #10b981.');

const text = z.string().trim().min(1);

// --- Enums ---------------------------------------------------------------------

export const hospitalStatusSchema = z.enum(['active', 'suspended', 'trial']);
export const hospitalPlanSchema = z.enum(['starter', 'clinic', 'enterprise']);
export const userRoleSchema = z.enum(['platform_admin', 'hospital_admin', 'doctor']);
export const userStatusSchema = z.enum(['active', 'invited', 'disabled']);
export const sexSchema = z.enum(['M', 'F']);
export const doseUnitSchema = z.enum(['mg', 'ml', 'g', 'mcg', 'tablets']);
export const frequencySchema = z.enum(['QD', 'BID', 'TID', 'QID', 'PRN', 'QHS']);
export const severitySchema = z.enum(['low', 'moderate', 'critical']);
export const investigationTypeSchema = z.enum(['lab', 'imaging', 'other']);
export const languageSchema = z.enum(['en', 'bn']);

// --- Hospital ------------------------------------------------------------------

export const hospitalFeaturesSchema = z.object({
  enableBrandSearch: z.boolean(),
  enableQuickPacks: z.boolean(),
  enableSafetyAlerts: z.boolean(),
  enableInvestigations: z.boolean(),
  allowPdfExport: z.boolean(),
  showLetterheadFooter: z.boolean(),
  maxMedicationsPerRx: z.int().min(1),
  maxPatients: z.int().min(0),
  usageWarnAtPercent: z.int().min(0).max(100),
  defaultLanguage: languageSchema,
});

export const rxDesignSchema = z.object({
  headerTitle: z.string(),
  headerSubtitle: z.string(),
  headerRight: z.string(),
  accentColor: hexColor,
  showRxBadge: z.boolean(),
  showAccentBand: z.boolean(),
  footerText: z.string(),
  watermark: z.enum(['none', 'hospital', 'doctor', 'confidential']),
  pageSize: z.enum(['A4', 'A5', 'Letter']),
  landscape: z.boolean(),
  showSignatureLine: z.boolean(),
  showValidUntil: z.boolean(),
  showAllergyBanner: z.boolean(),
  showRefillLine: z.boolean(),
  defaultRefills: z.int().min(0),
});

export const hospitalSchema = z.object({
  slug,
  name: text,
  city: text,
  country: z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code.'),
  status: hospitalStatusSchema,
  plan: hospitalPlanSchema,
  createdAt: timestamp,
  contactEmail: z.email(),
  monthlyRxCap: z.int().min(0),
  monthlyRxUsed: z.int().min(0),
  primaryColor: hexColor.optional(),
  features: hospitalFeaturesSchema,
  rxDesign: rxDesignSchema,
});

/** Subdomains that open the admin panel or the API, so no hospital can have them. */
export const RESERVED_SLUGS: readonly string[] = ['admin', 'www', 'api'];

/** What the admin panel sends to create a hospital (POST /api/hospitals). */
export const newHospitalSchema = hospitalSchema
  .pick({
    slug: true,
    name: true,
    city: true,
    country: true,
    plan: true,
    contactEmail: true,
    monthlyRxCap: true,
  })
  .refine((h) => !RESERVED_SLUGS.includes(h.slug), {
    message: 'That subdomain is reserved.',
    path: ['slug'],
  });

/** A hospital's settings, which only the SwiftRx team changes (PATCH /api/hospitals/:slug). */
export const hospitalSettingsSchema = z.object({
  features: hospitalFeaturesSchema,
  rxDesign: rxDesignSchema,
});

// --- Users ---------------------------------------------------------------------

export const userSchema = z
  .object({
    id: text,
    email: z.email(),
    name: text,
    role: userRoleSchema,
    hospitalSlug: slug.nullable(),
    specialty: z.string().optional(),
    licenseNo: z.string().optional(),
    status: userStatusSchema,
    createdAt: timestamp,
    lastLoginAt: timestamp.optional(),
  })
  .refine((u) => (u.role === 'platform_admin') === (u.hospitalSlug === null), {
    message: 'A platform admin has no hospital; every other user has one.',
    path: ['hospitalSlug'],
  });

// --- Patients ------------------------------------------------------------------

export const allergyStatusSchema = z.enum(['not_recorded', 'none_known', 'recorded']);

/** Allergies are listed exactly when the status says they were recorded. */
const allergiesMatchStatus = {
  check: (p: { allergyStatus: string; allergies: string[] }) =>
    (p.allergyStatus === 'recorded') === p.allergies.length > 0,
  message: 'List allergies with "recorded", and none with "none_known" or "not_recorded".',
  path: ['allergyStatus'],
};

const patientFields = z.object({
  id: text,
  hospitalSlug: slug,
  name: text,
  // Age 0 is an infant, so it is allowed; weight has to be a real reading.
  age: z.int().min(0).max(150),
  sex: sexSchema,
  weightKg: z.number().positive().max(500),
  contact: z.string(),
  allergyStatus: allergyStatusSchema,
  allergies: z.array(text),
  activeProblems: z.array(text),
  activeMedications: z.array(z.object({ name: text, dose: z.string() })),
  recentVitals: z.array(z.object({ label: text, value: z.string() })),
  createdAt: timestamp,
});

export const patientSchema = patientFields.refine(allergiesMatchStatus.check, {
  message: allergiesMatchStatus.message,
  path: allergiesMatchStatus.path,
});

/** What a client sends to add a patient (POST /api/hospitals/:slug/patients). */
export const newPatientSchema = patientFields
  .pick({
    name: true,
    age: true,
    sex: true,
    weightKg: true,
    contact: true,
    allergyStatus: true,
    allergies: true,
    activeProblems: true,
  })
  .refine(allergiesMatchStatus.check, {
    message: allergiesMatchStatus.message,
    path: allergiesMatchStatus.path,
  });

// --- Catalog -------------------------------------------------------------------

const dosage = z.object({ value: z.number().positive(), unit: doseUnitSchema });

export const drugSchema = z
  .object({
    id: text,
    genericName: text,
    therapeuticClass: text,
    safetyReviewed: z.boolean(),
    defaultDosage: dosage.optional(),
    defaultFrequency: frequencySchema.optional(),
    defaultDurationDays: z.int().positive().optional(),
    contraindications: z.array(text),
    interactsWith: z.array(text),
  })
  .refine(
    (d) =>
      !d.safetyReviewed ||
      (d.defaultDosage && d.defaultFrequency && d.defaultDurationDays !== undefined),
    { message: 'A reviewed generic needs its dose defaults.', path: ['defaultDosage'] },
  );

export const brandSchema = z.object({
  id: text,
  name: text,
  drugId: text,
  form: text,
  manufacturer: text,
  strength: text.optional(),
  price: text.optional(),
  herbal: z.literal(true).optional(),
});

export const investigationSchema = z.object({
  code: text,
  name: text,
  type: investigationTypeSchema,
});

export const diagnosisSchema = z.object({
  code: text,
  name: text,
  category: text,
  recommendedInvestigations: z.array(investigationSchema).optional(),
});

export const quickPackMedSchema = z.object({
  drugId: text,
  genericName: text,
  dosage,
  frequency: frequencySchema,
  durationDays: z.int().positive(),
  instructions: z.string(),
});

export const quickPackSchema = z.object({
  packId: text,
  shortcutKey: z.enum(['1', '2', '3']),
  diagnosisCode: text,
  rankScore: z.number().min(0).max(1),
  recommendationReason: z.string(),
  medications: z.array(quickPackMedSchema).min(1),
});

// --- Prescriptions -------------------------------------------------------------

export const rxMedicationSchema = z.object({
  rowId: text,
  drugId: text,
  genericName: text,
  brandName: z.string().optional(),
  form: z.string().optional(),
  strength: z.string().optional(),
  dosage,
  frequency: frequencySchema,
  durationDays: z.int().positive(),
  instructions: z.string(),
});

export const safetyAlertSchema = z.object({
  severity: severitySchema,
  type: z.enum(['allergy', 'drug_interaction', 'duplicate_therapy']),
  message: z.string(),
  drugId: z.string(),
});

export const signedRxSchema = z.object({
  id: text,
  signedAt: timestamp,
  hospitalSlug: slug,
  patient: patientSchema,
  diagnosis: diagnosisSchema,
  medications: z.array(rxMedicationSchema).min(1),
  investigations: z.array(investigationSchema),
  doctorId: text,
  doctorName: text,
  doctorLicense: text,
  safetyOverride: z.object({ reason: text, alerts: z.array(safetyAlertSchema).min(1) }).optional(),
});

// --- Audit log -----------------------------------------------------------------

const auditBase = {
  userId: text,
  userEmail: z.email(),
  at: timestamp,
};

export const auditEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('login'),
    ...auditBase,
    hospitalSlug: slug.nullable(),
    ip: z.string().optional(),
  }),
  z.object({
    kind: z.literal('sign_rx'),
    ...auditBase,
    hospitalSlug: slug,
    rxId: text,
    patientName: text,
    overrideReason: z.string().optional(),
  }),
  z.object({
    kind: z.literal('create_patient'),
    ...auditBase,
    hospitalSlug: slug,
    patientId: text,
    patientName: text,
  }),
  z.object({
    kind: z.literal('create_hospital'),
    ...auditBase,
    hospitalSlug: slug,
    hospitalName: text,
  }),
  z.object({
    kind: z.literal('invite_user'),
    ...auditBase,
    hospitalSlug: slug,
    invitedEmail: z.email(),
  }),
]);

// --- Schemas ⇄ types ----------------------------------------------------------

/** `true` when A and B are assignable both ways, so neither has a field the other lacks. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;

/** Never used at runtime: a schema that drifts from types.ts fails `tsc` here. */
export type SchemasMatchTypes = [
  Check<Same<z.infer<typeof hospitalFeaturesSchema>, HospitalFeatures>>,
  Check<Same<z.infer<typeof rxDesignSchema>, RxDesign>>,
  Check<Same<z.infer<typeof hospitalSchema>, Hospital>>,
  Check<Same<z.infer<typeof userSchema>, User>>,
  Check<Same<z.infer<typeof patientSchema>, Patient>>,
  Check<Same<z.infer<typeof drugSchema>, Drug>>,
  Check<Same<z.infer<typeof brandSchema>, Brand>>,
  Check<Same<z.infer<typeof investigationSchema>, Investigation>>,
  Check<Same<z.infer<typeof diagnosisSchema>, Diagnosis>>,
  Check<Same<z.infer<typeof quickPackMedSchema>, QuickPackMed>>,
  Check<Same<z.infer<typeof quickPackSchema>, QuickPack>>,
  Check<Same<z.infer<typeof rxMedicationSchema>, RxMedication>>,
  Check<Same<z.infer<typeof safetyAlertSchema>, SafetyAlert>>,
  Check<Same<z.infer<typeof signedRxSchema>, SignedRx>>,
  Check<Same<z.infer<typeof auditEventSchema>, AuditEvent>>,
];
