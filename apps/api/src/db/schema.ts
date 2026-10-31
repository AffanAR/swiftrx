// =============================================================================
//  SwiftRx API — Database schema
// =============================================================================
//  The Postgres tables, as Drizzle definitions. `npm run db:generate` turns a
//  change here into a new SQL migration in apps/api/drizzle/; review the SQL
//  before committing it.
//
//  Ground rules:
//   - Every tenant table carries `hospital_id`. Child rows reference their
//     parent by (id, hospital_id), so a prescription can only point at a
//     patient of the same hospital, and an item only at a prescription of the
//     same hospital. The database refuses a cross-tenant link even if the API
//     ever got one wrong.
//   - The drug, diagnosis, investigation and quick-pack catalogs are shared by
//     every hospital, so they have no `hospital_id`. Neither do `users`: a user
//     belongs to hospitals through `memberships`.
//   - Ids that the apps already use (`p_001`, `rx_…`, `d_001`, drug ids,
//     ICD-10 codes) stay text. A hospital is addressed by its slug, which can
//     change, so it gets a uuid that nothing outside the database sees.
//   - Enumerations are text plus a CHECK, not Postgres enums: adding or
//     retiring a value is then an ordinary migration.
//   - A prescription is a legal record, so it keeps a frozen copy of what was
//     signed: the patient, the diagnosis, the doctor's name and license, and
//     the hospital's Rx design.
//   - `audit_events` is append-only. A trigger (migration 0001) rejects
//     UPDATE, DELETE and TRUNCATE.
// =============================================================================

import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import type {
  Diagnosis,
  HospitalFeatures,
  Patient,
  QuickPackMed,
  RxDesign,
  SafetyAlert,
} from '@swiftrx/shared/types';

// --- Allowed values ---------------------------------------------------------------
// Mirrors of the unions in types.ts; the zod schemas in @swiftrx/shared/schemas
// check the same lists at the API boundary.

export const HOSPITAL_STATUSES = ['active', 'suspended', 'trial'] as const;
export const HOSPITAL_PLANS = ['starter', 'clinic', 'enterprise'] as const;
export const USER_STATUSES = ['active', 'invited', 'disabled'] as const;
/** A role at one hospital. Platform admins are a flag on `users` instead. */
export const MEMBERSHIP_ROLES = ['hospital_admin', 'doctor'] as const;
export const SEXES = ['M', 'F'] as const;
/**
 * Whether a patient's allergies were asked about. "No allergies" and "never
 * asked" must not look the same on a prescription (PLAN.md §2.2).
 */
export const ALLERGY_STATUSES = ['not_recorded', 'none_known', 'recorded'] as const;
export const DOSE_UNITS = ['mg', 'ml', 'g', 'mcg', 'tablets'] as const;
export const FREQUENCIES = ['QD', 'BID', 'TID', 'QID', 'PRN', 'QHS'] as const;
export const INVESTIGATION_TYPES = ['lab', 'imaging', 'other'] as const;
export const AUDIT_KINDS = [
  'login',
  'sign_rx',
  'create_patient',
  'create_hospital',
  'invite_user',
] as const;

/** `column IN ('a', 'b', …)`, for a CHECK constraint. */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`;
}

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// --- Hospitals ----------------------------------------------------------------------

export const hospitals = pgTable(
  'hospitals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    country: text('country').notNull(),
    status: text('status', { enum: HOSPITAL_STATUSES }).notNull().default('trial'),
    plan: text('plan', { enum: HOSPITAL_PLANS }).notNull(),
    contactEmail: text('contact_email').notNull(),
    monthlyRxCap: integer('monthly_rx_cap').notNull(),
    primaryColor: text('primary_color'),
    createdAt: createdAt(),
  },
  (t) => [
    check('hospitals_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('hospitals_country_format', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('hospitals_status_valid', oneOf(t.status, HOSPITAL_STATUSES)),
    check('hospitals_plan_valid', oneOf(t.plan, HOSPITAL_PLANS)),
    check('hospitals_monthly_rx_cap_nonnegative', sql`${t.monthlyRxCap} >= 0`),
    check('hospitals_primary_color_format', sql`${t.primaryColor} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

/**
 * Feature flags, limits and the printed Rx design, one row per hospital.
 * Both are read and written whole and validated by the shared zod schemas, so
 * they are jsonb: a new flag needs no migration.
 */
export const hospitalSettings = pgTable('hospital_settings', {
  hospitalId: uuid('hospital_id')
    .primaryKey()
    .references(() => hospitals.id, { onDelete: 'cascade' }),
  features: jsonb('features').$type<HospitalFeatures>().notNull(),
  rxDesign: jsonb('rx_design').$type<RxDesign>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Users and memberships -----------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    /**
     * Argon2id, in the PHC string format (src/auth/passwords.ts). Null until
     * the user sets a password, as an invited user hasn't yet.
     */
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    specialty: text('specialty'),
    /** The doctor's PMDC license number, printed on every Rx they sign. */
    licenseNo: text('license_no'),
    status: text('status', { enum: USER_STATUSES }).notNull().default('invited'),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    // Emails compare case-insensitively at sign-in, so they must be unique that way.
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    check('users_status_valid', oneOf(t.status, USER_STATUSES)),
  ],
);

/**
 * A user's role at one hospital. A user can hold several rows, at different
 * hospitals or (say, an admin who also prescribes) at the same one.
 */
export const memberships = pgTable(
  'memberships',
  {
    hospitalId: uuid('hospital_id')
      .notNull()
      .references(() => hospitals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.hospitalId, t.userId, t.role] }),
    index('memberships_user_idx').on(t.userId),
    check('memberships_role_valid', oneOf(t.role, MEMBERSHIP_ROLES)),
  ],
);

/**
 * Signed-in browsers. The cookie carries a random token; only its SHA-256 is
 * stored, so someone who reads this table can't sign in with it. A session
 * belongs to one place: the hospital it was made at, or the admin panel
 * (`hospital_id` null, platform admins only), and counts nowhere else.
 */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hospitalId: uuid('hospital_id').references(() => hospitals.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    /** Fixed at sign-in; the server refuses the session from then on. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    check('sessions_expire_after_creation', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

// --- Patients ----------------------------------------------------------------------------

export const patients = pgTable(
  'patients',
  {
    id: text('id').primaryKey(),
    hospitalId: uuid('hospital_id')
      .notNull()
      .references(() => hospitals.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    // The contract (types.ts) has an age, not a date of birth, so an age is
    // what gets stored. It goes stale; move to date_of_birth before real use.
    age: integer('age').notNull(),
    sex: text('sex', { enum: SEXES }).notNull(),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    contact: text('contact').notNull().default(''),
    allergyStatus: text('allergy_status', { enum: ALLERGY_STATUSES })
      .notNull()
      .default('not_recorded'),
    activeProblems: text('active_problems')
      .array()
      .notNull()
      .default(sql`'{}'`),
    activeMedications: jsonb('active_medications')
      .$type<Patient['activeMedications']>()
      .notNull()
      .default([]),
    recentVitals: jsonb('recent_vitals').$type<Patient['recentVitals']>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    // The target of the (patient_id, hospital_id) references below.
    unique('patients_id_hospital_unique').on(t.id, t.hospitalId),
    index('patients_hospital_name_idx').on(t.hospitalId, t.name),
    check('patients_age_range', sql`${t.age} between 0 and 150`),
    check('patients_sex_valid', oneOf(t.sex, SEXES)),
    check('patients_weight_positive', sql`${t.weightKg} > 0`),
    check('patients_allergy_status_valid', oneOf(t.allergyStatus, ALLERGY_STATUSES)),
  ],
);

/**
 * One row per recorded allergy. The three-way status lives on
 * `patients.allergy_status`, because "none known" and "not recorded" have no
 * allergy rows to hang it on. Only `recorded` patients have rows here.
 */
export const patientAllergies = pgTable(
  'patient_allergies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hospitalId: uuid('hospital_id').notNull(),
    patientId: text('patient_id').notNull(),
    substance: text('substance').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'patient_allergies_patient_fk',
      columns: [t.patientId, t.hospitalId],
      foreignColumns: [patients.id, patients.hospitalId],
    }).onDelete('cascade'),
    uniqueIndex('patient_allergies_substance_unique').on(t.patientId, sql`lower(${t.substance})`),
    check('patient_allergies_substance_present', sql`length(trim(${t.substance})) > 0`),
  ],
);

// --- Catalog (shared by every hospital) ------------------------------------------------------

export const drugs = pgTable(
  'drugs',
  {
    id: text('id').primaryKey(),
    genericName: text('generic_name').notNull(),
    brandNames: text('brand_names')
      .array()
      .notNull()
      .default(sql`'{}'`),
    therapeuticClass: text('therapeutic_class').notNull(),
    defaultDoseValue: numeric('default_dose_value', {
      precision: 10,
      scale: 3,
      mode: 'number',
    }).notNull(),
    defaultDoseUnit: text('default_dose_unit', { enum: DOSE_UNITS }).notNull(),
    defaultFrequency: text('default_frequency', { enum: FREQUENCIES }).notNull(),
    defaultDurationDays: integer('default_duration_days').notNull(),
    contraindications: text('contraindications')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Lowercase generic names, matched against the pad and the patient's meds. */
    interactsWith: text('interacts_with')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    check('drugs_default_dose_positive', sql`${t.defaultDoseValue} > 0`),
    check('drugs_default_dose_unit_valid', oneOf(t.defaultDoseUnit, DOSE_UNITS)),
    check('drugs_default_frequency_valid', oneOf(t.defaultFrequency, FREQUENCIES)),
    check('drugs_default_duration_positive', sql`${t.defaultDurationDays} > 0`),
  ],
);

export const investigations = pgTable(
  'investigations',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: INVESTIGATION_TYPES }).notNull(),
  },
  (t) => [check('investigations_type_valid', oneOf(t.type, INVESTIGATION_TYPES))],
);

/** ICD-10 diagnoses. */
export const diagnoses = pgTable('diagnoses', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
});

/** The tests suggested for a diagnosis, in the order the Rx pad lists them. */
export const diagnosisInvestigations = pgTable(
  'diagnosis_investigations',
  {
    diagnosisCode: text('diagnosis_code')
      .notNull()
      .references(() => diagnoses.code, { onDelete: 'cascade' }),
    investigationCode: text('investigation_code')
      .notNull()
      .references(() => investigations.code, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.diagnosisCode, t.investigationCode] }),
    unique('diagnosis_investigations_position_unique').on(t.diagnosisCode, t.position),
  ],
);

/**
 * Up to three ranked medication sets per diagnosis, injected with Alt+1/2/3.
 * The medications are a template the doctor edits on the pad, kept as one
 * jsonb list. Packs are platform-wide for now; per-hospital packs are Phase 3.
 */
export const quickPacks = pgTable(
  'quick_packs',
  {
    id: text('id').primaryKey(),
    diagnosisCode: text('diagnosis_code')
      .notNull()
      .references(() => diagnoses.code, { onDelete: 'cascade' }),
    shortcutKey: text('shortcut_key', { enum: ['1', '2', '3'] }).notNull(),
    rankScore: real('rank_score').notNull(),
    recommendationReason: text('recommendation_reason').notNull().default(''),
    medications: jsonb('medications').$type<QuickPackMed[]>().notNull(),
  },
  (t) => [
    unique('quick_packs_shortcut_unique').on(t.diagnosisCode, t.shortcutKey),
    check('quick_packs_shortcut_valid', sql`${t.shortcutKey} in ('1', '2', '3')`),
    check('quick_packs_rank_range', sql`${t.rankScore} between 0 and 1`),
  ],
);

// --- Prescriptions -------------------------------------------------------------------------------

export const prescriptions = pgTable(
  'prescriptions',
  {
    id: text('id').primaryKey(),
    hospitalId: uuid('hospital_id')
      .notNull()
      .references(() => hospitals.id, { onDelete: 'restrict' }),
    patientId: text('patient_id').notNull(),
    doctorId: text('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    diagnosisCode: text('diagnosis_code')
      .notNull()
      .references(() => diagnoses.code, { onDelete: 'restrict' }),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    // Frozen at signing: what the printed Rx showed, even if the patient,
    // the catalog, the doctor or the hospital's design change later.
    patientSnapshot: jsonb('patient_snapshot').$type<Patient>().notNull(),
    diagnosisSnapshot: jsonb('diagnosis_snapshot').$type<Diagnosis>().notNull(),
    rxDesignSnapshot: jsonb('rx_design_snapshot').$type<RxDesign>().notNull(),
    doctorName: text('doctor_name').notNull(),
    doctorLicense: text('doctor_license').notNull(),
    /** Set when the doctor signed through a critical safety alert. */
    safetyOverride: jsonb('safety_override').$type<{ reason: string; alerts: SafetyAlert[] }>(),
  },
  (t) => [
    unique('prescriptions_id_hospital_unique').on(t.id, t.hospitalId),
    foreignKey({
      name: 'prescriptions_patient_fk',
      columns: [t.patientId, t.hospitalId],
      foreignColumns: [patients.id, patients.hospitalId],
    }).onDelete('restrict'),
    index('prescriptions_hospital_signed_idx').on(t.hospitalId, t.signedAt.desc()),
    index('prescriptions_patient_idx').on(t.hospitalId, t.patientId),
    index('prescriptions_doctor_idx').on(t.doctorId),
    check('prescriptions_doctor_license_present', sql`length(trim(${t.doctorLicense})) > 0`),
    check(
      'prescriptions_override_has_reason',
      sql`${t.safetyOverride} is null or length(trim(${t.safetyOverride}->>'reason')) > 0`,
    ),
  ],
);

/** The medications on a signed Rx, in pad order. Names are frozen copies. */
export const prescriptionItems = pgTable(
  'prescription_items',
  {
    hospitalId: uuid('hospital_id').notNull(),
    prescriptionId: text('prescription_id').notNull(),
    position: integer('position').notNull(),
    /** The pad's row key, kept so a signed Rx reads back exactly as sent. */
    rowId: text('row_id').notNull(),
    drugId: text('drug_id')
      .notNull()
      .references(() => drugs.id, { onDelete: 'restrict' }),
    genericName: text('generic_name').notNull(),
    brandName: text('brand_name'),
    doseValue: numeric('dose_value', { precision: 10, scale: 3, mode: 'number' }).notNull(),
    doseUnit: text('dose_unit', { enum: DOSE_UNITS }).notNull(),
    frequency: text('frequency', { enum: FREQUENCIES }).notNull(),
    durationDays: integer('duration_days').notNull(),
    instructions: text('instructions').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.prescriptionId, t.position] }),
    foreignKey({
      name: 'prescription_items_prescription_fk',
      columns: [t.prescriptionId, t.hospitalId],
      foreignColumns: [prescriptions.id, prescriptions.hospitalId],
    }).onDelete('cascade'),
    check('prescription_items_dose_positive', sql`${t.doseValue} > 0`),
    check('prescription_items_dose_unit_valid', oneOf(t.doseUnit, DOSE_UNITS)),
    check('prescription_items_frequency_valid', oneOf(t.frequency, FREQUENCIES)),
    check('prescription_items_duration_positive', sql`${t.durationDays} > 0`),
  ],
);

/**
 * The tests ordered on a signed Rx, in pad order. (`investigations` is the
 * catalog they are picked from, as `drugs` is for `prescription_items`.)
 */
export const prescriptionInvestigations = pgTable(
  'prescription_investigations',
  {
    hospitalId: uuid('hospital_id').notNull(),
    prescriptionId: text('prescription_id').notNull(),
    position: integer('position').notNull(),
    code: text('code')
      .notNull()
      .references(() => investigations.code, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    type: text('type', { enum: INVESTIGATION_TYPES }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.prescriptionId, t.position] }),
    foreignKey({
      name: 'prescription_investigations_prescription_fk',
      columns: [t.prescriptionId, t.hospitalId],
      foreignColumns: [prescriptions.id, prescriptions.hospitalId],
    }).onDelete('cascade'),
    check('prescription_investigations_type_valid', oneOf(t.type, INVESTIGATION_TYPES)),
  ],
);

// --- Audit log ------------------------------------------------------------------------------------

/**
 * Who did what, when. Append-only: migration 0001 adds a trigger that rejects
 * UPDATE, DELETE and TRUNCATE. The common fields are columns; what is specific
 * to the kind (the Rx id, the patient's name, …) is in `details`.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Null for platform-level events, such as a platform admin signing in. */
    hospitalId: uuid('hospital_id').references(() => hospitals.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: AUDIT_KINDS }).notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The actor's email when it happened, kept even if the account changes. */
    actorEmail: text('actor_email').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    ip: inet('ip'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('audit_events_hospital_at_idx').on(t.hospitalId, t.at.desc()),
    check('audit_events_kind_valid', oneOf(t.kind, AUDIT_KINDS)),
  ],
);
