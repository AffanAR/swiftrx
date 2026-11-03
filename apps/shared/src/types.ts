// =============================================================================
//  SwiftRx Shared — Core Types
// =============================================================================
//  Every type used across the Admin Panel, Hospital Portal, and Rx Pad is
//  defined here so the three apps can stay in sync without a build step.
// =============================================================================

// --- Tenant / Hospital -------------------------------------------------------

/**
 * Per-hospital feature flags. The platform admin toggles these in the
 * HospitalFeaturesPage. The portal and Rx Pad read them to decide what
 * to expose.
 */
export interface HospitalFeatures {
  /** Allow doctors to use the brand-name search (vs generic only). */
  enableBrandSearch: boolean;
  /** Allow using ML-suggested "quick packs" in the Rx Pad. */
  enableQuickPacks: boolean;
  /** Allow the safety/drug-interaction panel. */
  enableSafetyAlerts: boolean;
  /** Allow doctors to attach investigations to the Rx. */
  enableInvestigations: boolean;
  /** Allow exporting the signed Rx to PDF (print pipeline). */
  allowPdfExport: boolean;
  /** Show the "Print on letterhead" footer copy on the signed Rx. */
  showLetterheadFooter: boolean;
  /** Max number of medications per signed Rx. */
  maxMedicationsPerRx: number;
  /** Max number of patients this hospital can have. */
  maxPatients: number;
  /** Soft warning when this % of monthlyRxCap is used. */
  usageWarnAtPercent: number;
  /**
   * Default language for the prescription copy: English or Bangla, the two
   * SwiftRx supports in Bangladesh (ROADMAP.md D13). Stored only, for now:
   * the print is English until the Bangla patient instructions arrive.
   */
  defaultLanguage: 'en' | 'bn';
}

export type RxPageSize = 'A4' | 'A5' | 'Letter';
export type RxWatermarkMode = 'none' | 'hospital' | 'doctor' | 'confidential';

/**
 * Custom Rx prescription design. The platform admin edits these on the
 * HospitalFeaturesPage and the print pipeline in apps/swiftrx/src/print.ts
 * renders the HTML using these fields. Everything has a safe default.
 */
export interface RxDesign {
  /** Header text shown at the top of the printed Rx. */
  headerTitle: string;
  /** Sub-line under the header. */
  headerSubtitle: string;
  /** Right-aligned hospital info text on the header. */
  headerRight: string;
  /** Accent color override for the printed Rx. Hex, e.g. "#10b981". */
  accentColor: string;
  /** Show the pill "Rx" badge on the left of the header. */
  showRxBadge: boolean;
  /** Show a colored band under the header. */
  showAccentBand: boolean;
  /** Footer copy shown at the bottom. */
  footerText: string;
  /** Show a watermark in the page background. */
  watermark: RxWatermarkMode;
  /** Page size. */
  pageSize: RxPageSize;
  /** Use landscape orientation. */
  landscape: boolean;
  /** Show the doctor signature line at the bottom. */
  showSignatureLine: boolean;
  /** Show the "Valid until" line. */
  showValidUntil: boolean;
  /** Show patient allergies prominently at the top. */
  showAllergyBanner: boolean;
  /** Show the "Refill" line. */
  showRefillLine: boolean;
  /** Default refill count if showRefillLine is true. */
  defaultRefills: number;
}

/** Defaults used by the platform admin when a new hospital is created. */
export const DEFAULT_HOSPITAL_FEATURES: HospitalFeatures = {
  enableBrandSearch: true,
  enableQuickPacks: true,
  enableSafetyAlerts: true,
  enableInvestigations: true,
  allowPdfExport: true,
  showLetterheadFooter: true,
  maxMedicationsPerRx: 8,
  maxPatients: 2000,
  usageWarnAtPercent: 80,
  defaultLanguage: 'en',
};

export const DEFAULT_RX_DESIGN: RxDesign = {
  headerTitle: 'Prescription',
  headerSubtitle: '',
  headerRight: '',
  accentColor: '#10b981',
  showRxBadge: true,
  showAccentBand: true,
  footerText:
    'This prescription is generated electronically and is valid without a physical signature.',
  watermark: 'none',
  pageSize: 'A4',
  landscape: false,
  showSignatureLine: true,
  showValidUntil: true,
  showAllergyBanner: true,
  showRefillLine: false,
  defaultRefills: 0,
};

export interface Hospital {
  slug: string; // e.g. "city-hospital" → sub.swiftrx.com
  name: string;
  city: string;
  country: string;
  status: 'active' | 'suspended' | 'trial';
  plan: 'starter' | 'clinic' | 'enterprise';
  createdAt: string; // ISO
  contactEmail: string;
  monthlyRxCap: number; // usage cap
  monthlyRxUsed: number; // usage this month
  primaryColor?: string; // optional accent override
  features: HospitalFeatures;
  rxDesign: RxDesign;
}

/**
 * What anyone may know about a hospital, signed in or not: enough for its
 * portal's sign-in page (GET /api/hospitals/:slug/profile).
 */
export type HospitalProfile = Pick<
  Hospital,
  'slug' | 'name' | 'city' | 'country' | 'status' | 'plan' | 'primaryColor'
>;

// --- Users --------------------------------------------------------------------

export type UserRole = 'platform_admin' | 'hospital_admin' | 'doctor';

// A user as the apps see them. Passwords and their hashes stay on the server
// (apps/api), so no browser code can hold one.
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  hospitalSlug: string | null; // null for platform_admin
  specialty?: string; // doctor-only
  licenseNo?: string; // doctor-only
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
  lastLoginAt?: string;
}

// --- Patient (per-hospital) -------------------------------------------------

export type AllergyStatus = 'not_recorded' | 'none_known' | 'recorded';

/**
 * Whether a prescription could reach an unborn or breastfed baby.
 * "not_applicable" for men and young children; "unknown" when nobody asked.
 */
export type PregnancyStatus =
  'not_applicable' | 'unknown' | 'not_pregnant' | 'pregnant' | 'breastfeeding';

/**
 * Kidney function, in the bands doses are adjusted by (eGFR in
 * mL/min/1.73 m²): normal ≥ 60, moderate 30–59, severe 15–29, failure < 15,
 * or on dialysis. "unknown" when there's no result.
 */
export type KidneyFunction = 'unknown' | 'normal' | 'moderate' | 'severe' | 'failure' | 'dialysis';

export interface Patient {
  id: string;
  hospitalSlug: string; // tenant key
  name: string;
  /** YYYY-MM-DD. An age goes stale; the date doesn't (ageOn() in patient.ts). */
  dateOfBirth: string;
  /** Worked out from an age the patient gave, not from a document. */
  dateOfBirthEstimated?: true;
  sex: 'M' | 'F';
  weightKg: number;
  contact: string;
  pregnancy: PregnancyStatus;
  kidney: KidneyFunction;
  /** The latest eGFR result, mL/min/1.73 m², when there is one. */
  egfr?: number;
  /**
   * Whether anyone asked: "none_known" (asked, none) and "not_recorded" (not
   * asked yet) both have no allergies listed, and only the first is safe.
   */
  allergyStatus: AllergyStatus;
  allergies: string[];
  activeProblems: string[];
  activeMedications: { name: string; dose: string }[];
  recentVitals: { label: string; value: string }[];
  createdAt: string;
}

// --- Drugs (catalog) ---------------------------------------------------------

export type DoseUnit = 'mg' | 'ml' | 'g' | 'mcg' | 'tablets';
export type Frequency = 'QD' | 'BID' | 'TID' | 'QID' | 'PRN' | 'QHS';
export type Severity = 'low' | 'moderate' | 'critical';

/**
 * A generic, from the Bangladesh medicine list (scripts/bd-medicines). Only
 * generics a person has reviewed have dose defaults and safety lists; for the
 * rest `safetyReviewed` is false and the lists are empty because nobody has
 * filled them in, not because nothing applies.
 */
export interface Drug {
  id: string;
  genericName: string;
  therapeuticClass: string;
  safetyReviewed: boolean;
  defaultDosage?: { value: number; unit: DoseUnit };
  defaultFrequency?: Frequency;
  defaultDurationDays?: number;
  /** Lowercase words matched against a patient's allergies. */
  contraindications: string[];
  /** Lowercase generic names; the first word is enough ("warfarin"). */
  interactsWith: string[];
}

/** A brand product of a generic, as sold in Bangladesh: "Napa 500 mg Tablet". */
export interface Brand {
  id: string;
  name: string;
  drugId: string;
  form: string;
  manufacturer: string;
  strength?: string;
  /** A display label: "৳1.20 per unit", "৳35.00 per 60 ml bottle". */
  price?: string;
  herbal?: true;
}

// --- Diagnosis / Quick packs -------------------------------------------------

export type InvestigationType = 'lab' | 'imaging' | 'other';
export interface Investigation {
  code: string;
  name: string;
  type: InvestigationType;
}

export interface Diagnosis {
  code: string;
  name: string;
  category: string;
  recommendedInvestigations?: Investigation[];
}

export interface QuickPackMed {
  drugId: string;
  genericName: string;
  dosage: { value: number; unit: DoseUnit };
  frequency: Frequency;
  durationDays: number;
  instructions: string;
}

export interface QuickPack {
  packId: string;
  shortcutKey: '1' | '2' | '3';
  diagnosisCode: string;
  rankScore: number;
  recommendationReason: string;
  medications: QuickPackMed[];
}

/** Everything the Rx pad searches and checks against (GET /api/catalog). */
export interface Catalog {
  drugs: Drug[];
  brands: Brand[];
  diagnoses: Diagnosis[];
  investigations: Investigation[];
  quickPacks: QuickPack[];
}

// --- Rx medication row + signed Rx ------------------------------------------

export interface RxMedication {
  rowId: string;
  drugId: string;
  genericName: string;
  brandName?: string;
  /** The brand's dosage form and strength, when one was picked: "Tablet", "500 mg". */
  form?: string;
  strength?: string;
  dosage: { value: number; unit: DoseUnit };
  frequency: Frequency;
  durationDays: number;
  instructions: string;
}

// --- Safety alerts ------------------------------------------------------------

export type SafetyAlertType = 'allergy' | 'drug_interaction' | 'duplicate_therapy';
export interface SafetyAlert {
  severity: Severity;
  type: SafetyAlertType;
  message: string;
  drugId: string;
}

export interface SignedRx {
  id: string;
  signedAt: string;
  hospitalSlug: string;
  patient: Patient;
  diagnosis: Diagnosis;
  medications: RxMedication[];
  investigations: Investigation[];
  doctorId: string;
  doctorName: string;
  doctorLicense: string;
  /** Set when the doctor signed despite critical safety alerts. */
  safetyOverride?: { reason: string; alerts: SafetyAlert[] };
  /**
   * SHA-256 (hex) of everything above, which the server computes when it
   * signs and the print shows. Missing only on prescriptions signed before
   * the server signed them.
   */
  recordHash?: string;
}

/**
 * A prescription as the Rx pad sends it (POST /api/hospitals/:slug/
 * prescriptions). Only ids and the pad's rows: the server looks up the
 * patient, the diagnosis and the doctor itself, re-runs the safety checks,
 * and assigns the id, the time and the hash.
 */
export interface PrescriptionDraft {
  patientId: string;
  diagnosisCode: string;
  medications: RxMedication[];
  investigations: Investigation[];
  /** Why the doctor signs through critical alerts (MIN_OVERRIDE_REASON+). */
  overrideReason?: string;
}

// --- Audit log ---------------------------------------------------------------

export type AuditEvent =
  | {
      kind: 'login';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string | null;
      ip?: string;
    }
  | {
      kind: 'sign_rx';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      rxId: string;
      patientName: string;
      overrideReason?: string;
    }
  | {
      kind: 'create_patient';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      patientId: string;
      patientName: string;
    }
  | {
      kind: 'create_hospital';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      hospitalName: string;
    }
  | {
      kind: 'invite_user';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      invitedEmail: string;
    }
  | {
      /** The SwiftRx team changed a hospital's feature switches or Rx design. */
      kind: 'update_hospital';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      changed: ('features' | 'rxDesign')[];
    }
  | {
      /** The SwiftRx team suspended, reactivated or otherwise moved a hospital. */
      kind: 'change_hospital_status';
      userId: string;
      userEmail: string;
      at: string;
      hospitalSlug: string;
      from: Hospital['status'];
      to: Hospital['status'];
    };

// --- Sessions ----------------------------------------------------------------

/**
 * A signed-in session. The server keeps it and checks it on every request;
 * the browser only holds an httpOnly cookie. `issuedAt` and `expiresAt` are
 * epoch milliseconds.
 */
export type SessionPayload =
  | {
      role: 'platform_admin';
      userId: string;
      issuedAt: number;
      expiresAt: number;
      email: string;
      name: string;
    }
  | {
      /** The user's role at this hospital; `hospital_admin` if they are an admin and a doctor. */
      role: 'hospital_admin' | 'doctor';
      userId: string;
      hospitalSlug: string;
      issuedAt: number;
      expiresAt: number;
      email: string;
      name: string;
      licenseNo?: string;
    };

/** A user's role at one hospital (the API's `memberships` table). */
export interface Membership {
  hospitalSlug: string;
  role: 'hospital_admin' | 'doctor';
}

/**
 * Why the server refused a sign-in. Wrong email and wrong password are one
 * reason, so the answer doesn't tell whether an account exists; the reasons
 * after it are only given once the password was right.
 */
export type SignInRefusal =
  | 'invalid-credentials'
  | 'rate-limited'
  | 'no-hospital'
  | 'disabled'
  | 'invited'
  | 'wrong-role'
  | 'wrong-hospital'
  | 'hospital-suspended';

/** A demo account, for the hint on the demo's sign-in pages (`GET /api/auth/demo-accounts`). */
export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

/** Who is signed in, as `POST /api/auth/login` and `GET /api/auth/me` answer. */
export interface AuthSession {
  session: SessionPayload;
  /** At a hospital, `role` and `hospitalSlug` are the session's. */
  user: User;
  /**
   * The user's roles at the session's hospital: one user can be its admin
   * and one of its doctors. Empty for a platform admin.
   */
  memberships: Membership[];
}
