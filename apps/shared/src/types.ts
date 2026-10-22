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
  /** Default language for the prescription copy (placeholder, future i18n). */
  defaultLanguage: 'en' | 'es' | 'fr' | 'de' | 'ar' | 'hi';
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

// --- Users --------------------------------------------------------------------

export type UserRole = 'platform_admin' | 'hospital_admin' | 'doctor';

export interface User {
  id: string;
  email: string;
  // For the mock only — in real life this lives only in the database.
  password: string;
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

export interface Patient {
  id: string;
  hospitalSlug: string; // tenant key
  name: string;
  age: number;
  sex: 'M' | 'F';
  weightKg: number;
  contact: string;
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

export interface Drug {
  id: string;
  genericName: string;
  brandNames: string[];
  therapeuticClass: string;
  defaultDosage: { value: number; unit: DoseUnit };
  defaultFrequency: Frequency;
  defaultDurationDays: number;
  contraindications: string[];
  interactsWith: string[];
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

// --- Rx medication row + signed Rx ------------------------------------------

export interface RxMedication {
  rowId: string;
  drugId: string;
  genericName: string;
  brandName?: string;
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
    };

// --- Sessions ----------------------------------------------------------------

export type SessionPayload =
  | { role: 'platform_admin'; userId: string; issuedAt: number; email: string; name: string }
  | {
      role: 'hospital_admin' | 'doctor';
      userId: string;
      hospitalSlug: string;
      issuedAt: number;
      email: string;
      name: string;
      licenseNo?: string;
    };
