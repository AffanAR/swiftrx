// =============================================================================
//  SwiftRx Shared — Mock In-Memory Database
// =============================================================================
//  Provides a single source of truth for the three apps' seed data. In dev
//  this is just a TS module that all apps import. In production each app
//  fetches from the same backend API instead.
//
//  Every entity is keyed by hospitalSlug where applicable so the admin
//  panel can show a global view and the hospital portal / rx pad can
//  filter to its own tenant.
// =============================================================================

import {
  DEFAULT_HOSPITAL_FEATURES,
  DEFAULT_RX_DESIGN,
  type Drug, type Diagnosis, type Hospital, type HospitalFeatures, type Investigation, type Patient, type QuickPack, type RxDesign, type User, type SignedRx, type AuditEvent,
} from './types';

// --- Hospitals (tenants) -----------------------------------------------------

// --- Hospital features / Rx design presets ---------------------------------
// Each hospital gets a slightly different design so the admin's editor and
// the print pipeline can be verified at a glance.

const CITY_HOSPITAL_FEATURES: HospitalFeatures = {
  ...DEFAULT_HOSPITAL_FEATURES,
  maxMedicationsPerRx: 10,
  maxPatients: 8000,
  usageWarnAtPercent: 85,
};

const CITY_HOSPITAL_DESIGN: RxDesign = {
  ...DEFAULT_RX_DESIGN,
  headerTitle: 'City Hospital',
  headerSubtitle: 'Multispecialty Tertiary Care · DHA Karachi',
  headerRight: 'Plot 42, Block 4, Karachi\n+92-21-9920-1100 · rx@city-hospital.com',
  accentColor: '#10b981',
  showAccentBand: true,
  showRxBadge: true,
  footerText: 'City Hospital · Prescriptions are electronically signed. Verify at verify.city-hospital.com',
  watermark: 'hospital',
  pageSize: 'A4',
  showAllergyBanner: true,
  showRefillLine: true,
  defaultRefills: 1,
};

const NORTHSTAR_FEATURES: HospitalFeatures = {
  ...DEFAULT_HOSPITAL_FEATURES,
  enableQuickPacks: true,
  enableBrandSearch: false,
  maxMedicationsPerRx: 6,
  maxPatients: 1200,
  usageWarnAtPercent: 75,
};

const NORTHSTAR_DESIGN: RxDesign = {
  ...DEFAULT_RX_DESIGN,
  headerTitle: 'Northstar Medical Center',
  headerSubtitle: 'Internal Medicine · Lahore',
  headerRight: '14-A Gulberg III, Lahore\n+92-42-3577-2200',
  accentColor: '#6366f1',
  showAccentBand: true,
  showRxBadge: true,
  footerText: 'Northstar Medical Center · Talk to your doctor before stopping any medication.',
  watermark: 'none',
  pageSize: 'A5',
  landscape: false,
  showAllergyBanner: true,
  showRefillLine: false,
};

const RIVERSIDE_FEATURES: HospitalFeatures = {
  ...DEFAULT_HOSPITAL_FEATURES,
  enableQuickPacks: false,
  enableInvestigations: false,
  allowPdfExport: false,
  maxMedicationsPerRx: 4,
  maxPatients: 250,
  usageWarnAtPercent: 90,
};

const RIVERSIDE_DESIGN: RxDesign = {
  ...DEFAULT_RX_DESIGN,
  headerTitle: 'Riverside Clinic',
  headerSubtitle: 'Family Practice',
  headerRight: '12 Margalla Road, Islamabad',
  accentColor: '#f59e0b',
  showAccentBand: false,
  showRxBadge: true,
  footerText: 'Riverside Clinic — trial period, electronic prescription only.',
  watermark: 'confidential',
  pageSize: 'A5',
  showAllergyBanner: true,
  showSignatureLine: true,
};

export const MOCK_HOSPITALS: Hospital[] = [
  {
    slug: 'city-hospital',
    name: 'City Hospital',
    city: 'Karachi',
    country: 'PK',
    status: 'active',
    plan: 'enterprise',
    createdAt: '2024-08-12T10:00:00.000Z',
    contactEmail: 'admin@city-hospital.com',
    monthlyRxCap: 5000,
    monthlyRxUsed: 1247,
    primaryColor: '#10b981',
    features: CITY_HOSPITAL_FEATURES,
    rxDesign: CITY_HOSPITAL_DESIGN,
  },
  {
    slug: 'northstar-medical',
    name: 'Northstar Medical Center',
    city: 'Lahore',
    country: 'PK',
    status: 'active',
    plan: 'clinic',
    createdAt: '2025-01-03T08:00:00.000Z',
    contactEmail: 'admin@northstar-medical.com',
    monthlyRxCap: 1500,
    monthlyRxUsed: 412,
    primaryColor: '#6366f1',
    features: NORTHSTAR_FEATURES,
    rxDesign: NORTHSTAR_DESIGN,
  },
  {
    slug: 'riverside-clinic',
    name: 'Riverside Clinic',
    city: 'Islamabad',
    country: 'PK',
    status: 'trial',
    plan: 'starter',
    createdAt: '2025-09-20T14:30:00.000Z',
    contactEmail: 'admin@riverside-clinic.com',
    monthlyRxCap: 200,
    monthlyRxUsed: 31,
    primaryColor: '#f59e0b',
    features: RIVERSIDE_FEATURES,
    rxDesign: RIVERSIDE_DESIGN,
  },
];

// --- Users (one platform admin + per-hospital admin + doctors) --------------

export const MOCK_USERS: User[] = [
  {
    id: 'u_admin_001',
    email: 'admin@swiftrx.com',
    password: 'admin1234',
    name: 'Sarah Mitchell',
    role: 'platform_admin',
    hospitalSlug: null,
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastLoginAt: '2025-09-26T07:30:00.000Z',
  },
  // City Hospital
  {
    id: 'u_hadmin_city',
    email: 'admin@city-hospital.com',
    password: 'demo1234',
    name: 'Faisal Rehman',
    role: 'hospital_admin',
    hospitalSlug: 'city-hospital',
    status: 'active',
    createdAt: '2024-08-12T10:05:00.000Z',
  },
  {
    id: 'd_001',
    email: 'ayesha@city-hospital.com',
    password: 'demo1234',
    name: 'Dr. Ayesha Khan',
    role: 'doctor',
    hospitalSlug: 'city-hospital',
    specialty: 'Internal Medicine',
    licenseNo: 'PMDC-44121',
    status: 'active',
    createdAt: '2024-08-15T10:00:00.000Z',
    lastLoginAt: '2025-09-25T11:20:00.000Z',
  },
  {
    id: 'd_002',
    email: 'bilal@city-hospital.com',
    password: 'demo1234',
    name: 'Dr. Bilal Ahmed',
    role: 'doctor',
    hospitalSlug: 'city-hospital',
    specialty: 'Cardiology',
    licenseNo: 'PMDC-50211',
    status: 'active',
    createdAt: '2024-09-01T10:00:00.000Z',
  },
  // Northstar
  {
    id: 'u_hadmin_ns',
    email: 'admin@northstar-medical.com',
    password: 'demo1234',
    name: 'Mehwish Tariq',
    role: 'hospital_admin',
    hospitalSlug: 'northstar-medical',
    status: 'active',
    createdAt: '2025-01-03T08:05:00.000Z',
  },
  {
    id: 'd_003',
    email: 'sana@northstar-medical.com',
    password: 'demo1234',
    name: 'Dr. Sana Iqbal',
    role: 'doctor',
    hospitalSlug: 'northstar-medical',
    specialty: 'Pediatrics',
    licenseNo: 'PMDC-37890',
    status: 'active',
    createdAt: '2025-01-04T09:00:00.000Z',
  },
];

// --- Patients (per hospital) -------------------------------------------------

const today = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString();

export const MOCK_PATIENTS: Patient[] = [
  {
    id: 'p_001',
    hospitalSlug: 'city-hospital',
    name: 'Bilal Ahmed',
    age: 42,
    sex: 'M',
    weightKg: 78,
    contact: '+92-300-1234567',
    allergies: ['Penicillin'],
    activeProblems: ['Hypertension', 'Type 2 Diabetes'],
    activeMedications: [
      { name: 'Metformin', dose: '500mg BID' },
      { name: 'Amlodipine', dose: '5mg QD' },
    ],
    recentVitals: [
      { label: 'BP', value: '138/86' },
      { label: 'Pulse', value: '82 bpm' },
      { label: 'SpO2', value: '98%' },
      { label: 'HbA1c', value: '7.4%' },
    ],
    createdAt: today(120),
  },
  {
    id: 'p_002',
    hospitalSlug: 'city-hospital',
    name: 'Fatima Noor',
    age: 28,
    sex: 'F',
    weightKg: 62,
    contact: '+92-301-9876543',
    allergies: [],
    activeProblems: ['Asthma'],
    activeMedications: [{ name: 'Salbutamol', dose: '100mcg PRN' }],
    recentVitals: [
      { label: 'BP', value: '118/74' },
      { label: 'Pulse', value: '76 bpm' },
      { label: 'SpO2', value: '99%' },
    ],
    createdAt: today(45),
  },
  {
    id: 'p_003',
    hospitalSlug: 'city-hospital',
    name: 'Hassan Raza',
    age: 65,
    sex: 'M',
    weightKg: 82,
    contact: '+92-333-2221100',
    allergies: ['Sulfa drugs'],
    activeProblems: ['COPD', 'Coronary Artery Disease'],
    activeMedications: [
      { name: 'Atorvastatin', dose: '20mg QHS' },
      { name: 'Aspirin', dose: '75mg QD' },
    ],
    recentVitals: [
      { label: 'BP', value: '146/92' },
      { label: 'Pulse', value: '88 bpm' },
      { label: 'SpO2', value: '94%' },
    ],
    createdAt: today(200),
  },
  {
    id: 'p_004',
    hospitalSlug: 'northstar-medical',
    name: 'Ayan Khan',
    age: 6,
    sex: 'M',
    weightKg: 21,
    contact: '+92-345-1112233',
    allergies: [],
    activeProblems: ['Acute pharyngitis'],
    activeMedications: [],
    recentVitals: [
      { label: 'Temp', value: '38.6°C' },
      { label: 'Pulse', value: '104 bpm' },
    ],
    createdAt: today(3),
  },
  {
    id: 'p_005',
    hospitalSlug: 'northstar-medical',
    name: 'Mariam Aslam',
    age: 34,
    sex: 'F',
    weightKg: 60,
    contact: '+92-321-4445566',
    allergies: ['Latex'],
    activeProblems: ['Migraine'],
    activeMedications: [],
    recentVitals: [
      { label: 'BP', value: '122/78' },
      { label: 'Pulse', value: '72 bpm' },
    ],
    createdAt: today(15),
  },
  {
    id: 'p_006',
    hospitalSlug: 'riverside-clinic',
    name: 'Omar Faruq',
    age: 51,
    sex: 'M',
    weightKg: 70,
    contact: '+92-311-7778899',
    allergies: [],
    activeProblems: ['Type 2 Diabetes', 'Dyslipidemia'],
    activeMedications: [
      { name: 'Metformin', dose: '1g BID' },
      { name: 'Atorvastatin', dose: '10mg QHS' },
    ],
    recentVitals: [
      { label: 'BP', value: '130/80' },
      { label: 'HbA1c', value: '8.1%' },
    ],
    createdAt: today(60),
  },
];

// --- Drug catalog (shared across all hospitals) ------------------------------

export const MOCK_DRUGS: Drug[] = [
  { id: 'para',  genericName: 'Paracetamol', brandNames: ['Panadol', 'Tylenol'], therapeuticClass: 'Analgesic', defaultDosage: { value: 500, unit: 'mg' }, defaultFrequency: 'QID', defaultDurationDays: 5, contraindications: [], interactsWith: [] },
  { id: 'ibu',   genericName: 'Ibuprofen',    brandNames: ['Brufen', 'Advil'],   therapeuticClass: 'NSAID',    defaultDosage: { value: 400, unit: 'mg' }, defaultFrequency: 'TID', defaultDurationDays: 5, contraindications: ['aspirin', 'nsaid hypersensitivity'], interactsWith: ['aspirin', 'warfarin', 'lisinopril'] },
  { id: 'amox',  genericName: 'Amoxicillin',  brandNames: ['Amoxil', 'Mox'],     therapeuticClass: 'Antibiotic — Penicillin', defaultDosage: { value: 500, unit: 'mg' }, defaultFrequency: 'TID', defaultDurationDays: 7, contraindications: ['penicillin'], interactsWith: ['methotrexate'] },
  { id: 'azith', genericName: 'Azithromycin', brandNames: ['Zithromax'],          therapeuticClass: 'Antibiotic — Macrolide', defaultDosage: { value: 500, unit: 'mg' }, defaultFrequency: 'QD', defaultDurationDays: 3, contraindications: [], interactsWith: [] },
  { id: 'cetiri',genericName: 'Cetirizine',   brandNames: ['Zyrtec'],             therapeuticClass: 'Antihistamine', defaultDosage: { value: 10, unit: 'mg' }, defaultFrequency: 'QD', defaultDurationDays: 7, contraindications: [], interactsWith: [] },
  { id: 'salin', genericName: 'Salbutamol',   brandNames: ['Ventolin'],           therapeuticClass: 'Bronchodilator', defaultDosage: { value: 100, unit: 'mcg' }, defaultFrequency: 'PRN', defaultDurationDays: 30, contraindications: [], interactsWith: [] },
  { id: 'pred',  genericName: 'Prednisone',   brandNames: ['Deltasone'],          therapeuticClass: 'Corticosteroid', defaultDosage: { value: 10, unit: 'mg' }, defaultFrequency: 'BID', defaultDurationDays: 5, contraindications: [], interactsWith: ['aspirin', 'warfarin'] },
  { id: 'metformin', genericName: 'Metformin',brandNames: ['Glucophage'],         therapeuticClass: 'Biguanide (Antidiabetic)', defaultDosage: { value: 500, unit: 'mg' }, defaultFrequency: 'BID', defaultDurationDays: 90, contraindications: ['renal impairment'], interactsWith: [] },
  { id: 'amlo',  genericName: 'Amlodipine',   brandNames: ['Norvasc'],            therapeuticClass: 'Calcium Channel Blocker (Antihypertensive)', defaultDosage: { value: 5, unit: 'mg' }, defaultFrequency: 'QD', defaultDurationDays: 90, contraindications: [], interactsWith: [] },
  { id: 'lisinopril', genericName: 'Lisinopril', brandNames: ['Zestril', 'Prinivil'], therapeuticClass: 'ACE Inhibitor (Antihypertensive)', defaultDosage: { value: 10, unit: 'mg' }, defaultFrequency: 'QD', defaultDurationDays: 90, contraindications: ['pregnancy'], interactsWith: ['ibuprofen'] },
  { id: 'atorva',genericName: 'Atorvastatin', brandNames: ['Lipitor'],            therapeuticClass: 'Statin (Antilipemic)', defaultDosage: { value: 20, unit: 'mg' }, defaultFrequency: 'QHS', defaultDurationDays: 90, contraindications: [], interactsWith: ['warfarin'] },
  { id: 'ondan', genericName: 'Ondansetron',  brandNames: ['Zofran'],             therapeuticClass: 'Antiemetic', defaultDosage: { value: 4, unit: 'mg' }, defaultFrequency: 'PRN', defaultDurationDays: 5, contraindications: [], interactsWith: [] },
];

// --- ICD-10 diagnoses --------------------------------------------------------

export const MOCK_DIAGNOSES: Diagnosis[] = [
  { code: 'J45.909', name: 'Asthma, unspecified, uncomplicated', category: 'Respiratory',
    recommendedInvestigations: [
      { code: 'Spiro', name: 'Spirometry', type: 'imaging' },
      { code: 'PEF', name: 'Peak Expiratory Flow', type: 'imaging' },
      { code: 'CXR', name: 'Chest X-Ray PA View', type: 'imaging' },
    ]},
  { code: 'J02.9',   name: 'Acute pharyngitis, unspecified', category: 'Respiratory',
    recommendedInvestigations: [
      { code: 'CBC', name: 'Complete Blood Count', type: 'lab' },
      { code: 'ThroatSwab', name: 'Throat Swab Culture', type: 'lab' },
    ]},
  { code: 'I10',     name: 'Essential (primary) hypertension', category: 'Cardiovascular',
    recommendedInvestigations: [
      { code: 'BMP', name: 'Basic Metabolic Panel', type: 'lab' },
      { code: 'Lipid', name: 'Lipid Profile', type: 'lab' },
    ]},
  { code: 'E11.9',   name: 'Type 2 diabetes mellitus without complications', category: 'Endocrine',
    recommendedInvestigations: [
      { code: 'HbA1c', name: 'Glycated Hemoglobin', type: 'lab' },
      { code: 'FBS', name: 'Fasting Blood Sugar', type: 'lab' },
    ]},
  { code: 'J44.9',   name: 'Chronic obstructive pulmonary disease, unspecified', category: 'Respiratory',
    recommendedInvestigations: [
      { code: 'CXR', name: 'Chest X-Ray PA View', type: 'imaging' },
      { code: 'ABG', name: 'Arterial Blood Gas', type: 'lab' },
    ]},
  { code: 'G43.909', name: 'Migraine, unspecified, not intractable, without status migrainosus', category: 'Neurology' },
  { code: 'R51',     name: 'Headache', category: 'Neurology' },
];

// --- Investigations catalog --------------------------------------------------

export const MOCK_INVESTIGATIONS: Investigation[] = [
  { code: 'CBC', name: 'Complete Blood Count', type: 'lab' },
  { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', type: 'lab' },
  { code: 'CRP', name: 'C-Reactive Protein', type: 'lab' },
  { code: 'HbA1c', name: 'Glycated Hemoglobin', type: 'lab' },
  { code: 'INR', name: 'Prothrombin Time / INR', type: 'lab' },
  { code: 'FBS', name: 'Fasting Blood Sugar', type: 'lab' },
  { code: 'RBS', name: 'Random Blood Sugar', type: 'lab' },
  { code: 'Lipid', name: 'Lipid Profile', type: 'lab' },
  { code: 'BMP', name: 'Basic Metabolic Panel', type: 'lab' },
  { code: 'CMP', name: 'Comprehensive Metabolic Panel', type: 'lab' },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', type: 'lab' },
  { code: 'CXR', name: 'Chest X-Ray PA View', type: 'imaging' },
  { code: 'ECG', name: 'Electrocardiogram', type: 'imaging' },
  { code: 'USG', name: 'Ultrasound Abdomen', type: 'imaging' },
  { code: 'Spiro', name: 'Spirometry', type: 'imaging' },
  { code: 'PEF', name: 'Peak Expiratory Flow', type: 'imaging' },
  { code: 'ABG', name: 'Arterial Blood Gas', type: 'lab' },
  { code: 'ThroatSwab', name: 'Throat Swab Culture', type: 'lab' },
];

// --- Quick packs -------------------------------------------------------------

export const MOCK_QUICK_PACKS: QuickPack[] = [
  { packId: 'qp-asthma-1', shortcutKey: '1', diagnosisCode: 'J45.909', rankScore: 0.96,
    recommendationReason: 'First-line bronchodilator + inhaled steroid for adult asthma.',
    medications: [
      { drugId: 'salin', genericName: 'Salbutamol', dosage: { value: 100, unit: 'mcg' }, frequency: 'PRN', durationDays: 30, instructions: '2 puffs every 4-6h when needed' },
      { drugId: 'pred', genericName: 'Prednisone', dosage: { value: 10, unit: 'mg' }, frequency: 'BID', durationDays: 5, instructions: 'After breakfast and dinner, taper as directed' },
    ]},
  { packId: 'qp-asthma-2', shortcutKey: '2', diagnosisCode: 'J45.909', rankScore: 0.88,
    recommendationReason: 'Rescue inhaler only — mild intermittent asthma.',
    medications: [
      { drugId: 'salin', genericName: 'Salbutamol', dosage: { value: 100, unit: 'mcg' }, frequency: 'PRN', durationDays: 30, instructions: '2 puffs every 4-6h when needed' },
    ]},
  { packId: 'qp-asthma-3', shortcutKey: '3', diagnosisCode: 'J45.909', rankScore: 0.74,
    recommendationReason: 'Adjunct antihistamine for allergic-trigger asthma.',
    medications: [
      { drugId: 'salin', genericName: 'Salbutamol', dosage: { value: 100, unit: 'mcg' }, frequency: 'PRN', durationDays: 30, instructions: '2 puffs every 4-6h when needed' },
      { drugId: 'cetiri', genericName: 'Cetirizine', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 30, instructions: 'At bedtime' },
    ]},
  { packId: 'qp-uri-1', shortcutKey: '1', diagnosisCode: 'J02.9', rankScore: 0.93,
    recommendationReason: 'Symptomatic relief + first-line antibiotic for strep suspicion.',
    medications: [
      { drugId: 'para', genericName: 'Paracetamol', dosage: { value: 500, unit: 'mg' }, frequency: 'QID', durationDays: 5, instructions: 'Every 6 hours, max 4 doses/day' },
      { drugId: 'amox', genericName: 'Amoxicillin', dosage: { value: 500, unit: 'mg' }, frequency: 'TID', durationDays: 7, instructions: 'After meals' },
    ]},
  { packId: 'qp-uri-2', shortcutKey: '2', diagnosisCode: 'J02.9', rankScore: 0.81,
    recommendationReason: 'Penicillin-allergic alternative.',
    medications: [
      { drugId: 'para', genericName: 'Paracetamol', dosage: { value: 500, unit: 'mg' }, frequency: 'QID', durationDays: 5, instructions: 'Every 6 hours, max 4 doses/day' },
      { drugId: 'azith', genericName: 'Azithromycin', dosage: { value: 500, unit: 'mg' }, frequency: 'QD', durationDays: 3, instructions: '1 hour before or 2 hours after meals' },
    ]},
  { packId: 'qp-uri-3', shortcutKey: '3', diagnosisCode: 'J02.9', rankScore: 0.68,
    recommendationReason: 'Supportive care only — viral etiology likely.',
    medications: [
      { drugId: 'para', genericName: 'Paracetamol', dosage: { value: 500, unit: 'mg' }, frequency: 'QID', durationDays: 5, instructions: 'As needed for pain/fever' },
      { drugId: 'cetiri', genericName: 'Cetirizine', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 7, instructions: 'At bedtime' },
    ]},
  { packId: 'qp-htn-1', shortcutKey: '1', diagnosisCode: 'I10', rankScore: 0.95,
    recommendationReason: 'First-line ACE inhibitor for uncomplicated HTN.',
    medications: [
      { drugId: 'lisinopril', genericName: 'Lisinopril', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Same time daily, monitor BP' },
    ]},
  { packId: 'qp-htn-2', shortcutKey: '2', diagnosisCode: 'I10', rankScore: 0.86,
    recommendationReason: 'CCB alternative for ACE-intolerant patients.',
    medications: [
      { drugId: 'amlo', genericName: 'Amlodipine', dosage: { value: 5, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Same time daily' },
    ]},
  { packId: 'qp-htn-3', shortcutKey: '3', diagnosisCode: 'I10', rankScore: 0.78,
    recommendationReason: 'Combination therapy for stage 2 HTN.',
    medications: [
      { drugId: 'amlo', genericName: 'Amlodipine', dosage: { value: 5, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Morning' },
      { drugId: 'lisinopril', genericName: 'Lisinopril', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Evening' },
    ]},
  { packId: 'qp-dm-1', shortcutKey: '1', diagnosisCode: 'E11.9', rankScore: 0.97,
    recommendationReason: 'First-line biguanide for T2DM without renal impairment.',
    medications: [
      { drugId: 'metformin', genericName: 'Metformin', dosage: { value: 500, unit: 'mg' }, frequency: 'BID', durationDays: 90, instructions: 'With breakfast and dinner' },
    ]},
  { packId: 'qp-dm-2', shortcutKey: '2', diagnosisCode: 'E11.9', rankScore: 0.82,
    recommendationReason: 'Add-on statin for diabetic dyslipidemia.',
    medications: [
      { drugId: 'metformin', genericName: 'Metformin', dosage: { value: 500, unit: 'mg' }, frequency: 'BID', durationDays: 90, instructions: 'With meals' },
      { drugId: 'atorva', genericName: 'Atorvastatin', dosage: { value: 20, unit: 'mg' }, frequency: 'QHS', durationDays: 90, instructions: 'At bedtime' },
    ]},
  { packId: 'qp-dm-3', shortcutKey: '3', diagnosisCode: 'E11.9', rankScore: 0.71,
    recommendationReason: 'Triple therapy for uncontrolled T2DM.',
    medications: [
      { drugId: 'metformin', genericName: 'Metformin', dosage: { value: 1, unit: 'g' }, frequency: 'BID', durationDays: 90, instructions: 'With meals' },
      { drugId: 'amlo', genericName: 'Amlodipine', dosage: { value: 5, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'For BP if needed' },
      { drugId: 'atorva', genericName: 'Atorvastatin', dosage: { value: 20, unit: 'mg' }, frequency: 'QHS', durationDays: 90, instructions: 'At bedtime' },
    ]},
];

// --- Signed Rx seed (so the dashboard has history) ---------------------------

export const MOCK_SIGNED_RX: SignedRx[] = [
  {
    id: 'rx_seed_001',
    signedAt: '2025-09-25T11:20:00.000Z',
    hospitalSlug: 'city-hospital',
    patient: MOCK_PATIENTS[0],
    diagnosis: MOCK_DIAGNOSES[2],   // I10
    medications: [
      { rowId: 'r_seed_1', drugId: 'lisinopril', genericName: 'Lisinopril', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Same time daily' },
      { rowId: 'r_seed_2', drugId: 'amlo',       genericName: 'Amlodipine',  dosage: { value: 5,  unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Morning' },
    ],
    investigations: [{ code: 'BMP', name: 'Basic Metabolic Panel', type: 'lab' }],
    doctorId: 'd_001',
    doctorName: 'Dr. Ayesha Khan',
    doctorLicense: 'PMDC-44121',
  },
  {
    id: 'rx_seed_002',
    signedAt: '2025-09-22T14:10:00.000Z',
    hospitalSlug: 'city-hospital',
    patient: MOCK_PATIENTS[2],
    diagnosis: MOCK_DIAGNOSES[0],   // J45
    medications: [
      { rowId: 'r_seed_3', drugId: 'salin', genericName: 'Salbutamol', dosage: { value: 100, unit: 'mcg' }, frequency: 'PRN', durationDays: 30, instructions: '2 puffs every 4-6h' },
    ],
    investigations: [{ code: 'CXR', name: 'Chest X-Ray PA View', type: 'imaging' }],
    doctorId: 'd_002',
    doctorName: 'Dr. Bilal Ahmed',
    doctorLicense: 'PMDC-50211',
  },
  {
    id: 'rx_seed_003',
    signedAt: '2025-09-26T08:45:00.000Z',
    hospitalSlug: 'northstar-medical',
    patient: MOCK_PATIENTS[3],
    diagnosis: MOCK_DIAGNOSES[1],   // J02.9
    medications: [
      { rowId: 'r_seed_4', drugId: 'para', genericName: 'Paracetamol', dosage: { value: 250, unit: 'mg' }, frequency: 'QID', durationDays: 3, instructions: 'Per weight; max 4 doses/day' },
    ],
    investigations: [{ code: 'ThroatSwab', name: 'Throat Swab Culture', type: 'lab' }],
    doctorId: 'd_003',
    doctorName: 'Dr. Sana Iqbal',
    doctorLicense: 'PMDC-37890',
  },
];

// --- Audit log seed ----------------------------------------------------------

export const MOCK_AUDIT: AuditEvent[] = [
  { kind: 'login',         userId: 'd_001', userEmail: 'ayesha@city-hospital.com',    at: '2025-09-25T11:18:00.000Z', hospitalSlug: 'city-hospital' },
  { kind: 'sign_rx',       userId: 'd_001', userEmail: 'ayesha@city-hospital.com',    at: '2025-09-25T11:20:00.000Z', hospitalSlug: 'city-hospital', rxId: 'rx_seed_001', patientName: 'Bilal Ahmed' },
  { kind: 'login',         userId: 'd_002', userEmail: 'bilal@city-hospital.com',     at: '2025-09-22T14:05:00.000Z', hospitalSlug: 'city-hospital' },
  { kind: 'sign_rx',       userId: 'd_002', userEmail: 'bilal@city-hospital.com',     at: '2025-09-22T14:10:00.000Z', hospitalSlug: 'city-hospital', rxId: 'rx_seed_002', patientName: 'Hassan Raza' },
  { kind: 'create_patient',userId: 'd_001', userEmail: 'ayesha@city-hospital.com',    at: '2025-08-30T09:00:00.000Z', hospitalSlug: 'city-hospital', patientId: 'p_002', patientName: 'Fatima Noor' },
  { kind: 'login',         userId: 'd_003', userEmail: 'sana@northstar-medical.com',  at: '2025-09-26T08:40:00.000Z', hospitalSlug: 'northstar-medical' },
  { kind: 'sign_rx',       userId: 'd_003', userEmail: 'sana@northstar-medical.com',  at: '2025-09-26T08:45:00.000Z', hospitalSlug: 'northstar-medical', rxId: 'rx_seed_003', patientName: 'Ayan Khan' },
  { kind: 'create_hospital', userId: 'u_admin_001', userEmail: 'admin@swiftrx.com',     at: '2025-09-20T14:30:00.000Z', hospitalSlug: 'riverside-clinic', hospitalName: 'Riverside Clinic' },
  { kind: 'invite_user',   userId: 'u_hadmin_city', userEmail: 'admin@city-hospital.com', at: '2025-09-21T10:00:00.000Z', hospitalSlug: 'city-hospital', invitedEmail: 'newdoc@city-hospital.com' },
];

// --- Lookup helpers (used across all three apps) -----------------------------

export function getHospital(slug: string | null | undefined) {
  if (!slug) return null;
  const raw = MOCK_HOSPITALS.find((h) => h.slug === slug);
  return raw ? applyOverrides(raw) : null;
}

export function getUserByEmail(email: string) {
  return MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string) {
  return MOCK_USERS.find((u) => u.id === id);
}

export function listDoctorsForHospital(slug: string) {
  return MOCK_USERS.filter((u) => u.role === 'doctor' && u.hospitalSlug === slug);
}

export function listPatientsForHospital(slug: string) {
  return MOCK_PATIENTS.filter((p) => p.hospitalSlug === slug);
}

export function listSignedRxForHospital(slug: string) {
  return MOCK_SIGNED_RX.filter((r) => r.hospitalSlug === slug);
}

export function listAuditForHospital(slug: string) {
  return MOCK_AUDIT.filter((e) => e.hospitalSlug === slug);
}

export function appendAudit(e: AuditEvent) {
  MOCK_AUDIT.unshift(e);
}

export function appendSignedRx(rx: SignedRx) {
  MOCK_SIGNED_RX.unshift(rx);
  // Bump hospital usage counter.
  const h = getHospital(rx.hospitalSlug);
  if (h) h.monthlyRxUsed += 1;
}

export function findDrug(drugId: string) {
  return MOCK_DRUGS.find((d) => d.id === drugId);
}

// --- Admin mutations ---------------------------------------------------------
//
// These are in-memory only for the mock build, but the API is the same one
// a real backend will eventually expose. They also persist to localStorage
// so admin changes survive a hard reload during testing.

const ADMIN_OVERRIDES_KEY = 'swiftrx:admin-overrides:v1';

type AdminOverrides = Record<string, Partial<Pick<Hospital, 'features' | 'rxDesign' | 'plan' | 'status'>>>;

function loadOverrides(): AdminOverrides {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ADMIN_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as AdminOverrides) : {};
  } catch {
    return {};
  }
}

function saveOverrides(o: AdminOverrides) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(ADMIN_OVERRIDES_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

function applyOverrides(h: Hospital): Hospital {
  const o = loadOverrides()[h.slug];
  if (!o) return h;
  return { ...h, ...o };
}

/** Public list view, with admin overrides applied. */
export function listHospitals(): Hospital[] {
  return MOCK_HOSPITALS.map(applyOverrides);
}

export function updateHospitalFeatures(slug: string, features: HospitalFeatures): Hospital | null {
  const h = MOCK_HOSPITALS.find((x) => x.slug === slug);
  if (!h) return null;
  h.features = features;
  const o = loadOverrides();
  o[slug] = { ...(o[slug] ?? {}), features };
  saveOverrides(o);
  return h;
}

export function updateHospitalRxDesign(slug: string, rxDesign: RxDesign): Hospital | null {
  const h = MOCK_HOSPITALS.find((x) => x.slug === slug);
  if (!h) return null;
  h.rxDesign = rxDesign;
  const o = loadOverrides();
  o[slug] = { ...(o[slug] ?? {}), rxDesign };
  saveOverrides(o);
  return h;
}

/** Returns the design the print pipeline should use for this hospital. */
export function getRxDesign(slug: string | null | undefined): RxDesign | null {
  return getHospital(slug)?.rxDesign ?? null;
}
