// =============================================================================
//  SwiftRx API — Seed
// =============================================================================
//  Loads the demo data in apps/shared/src/seed/*.json (through seedData.ts, the
//  same loader the mock db uses) into an empty database.
//
//  - Every row is checked against the shared zod schemas first, so a typo in
//    the JSON fails with a field path instead of half a seed.
//  - It all runs in one transaction: a bad reference (say, an Rx naming a
//    patient of another hospital) rolls everything back.
//  - It only seeds an empty database. With hospitals already present it does
//    nothing, so it can never overwrite or duplicate data; `npm run db:reset`
//    starts a dev database over.
//
//  Where the JSON and the tables differ:
//  - A user's single `hospitalSlug` and `role` become a membership; platform
//    admins get `is_platform_admin` and no membership.
//  - `allergies: []` is seeded as "not recorded", not "none known": the JSON
//    can't tell the two apart, and assuming "none" is the unsafe guess.
//  - A seeded Rx freezes the patient, the diagnosis and the hospital's Rx
//    design as they are in the seed.
//  - `monthlyRxUsed` isn't stored. It is a count of this month's prescriptions,
//    and the read endpoints will work it out from `prescriptions`.
// =============================================================================

import { count, getTableName, type Table } from 'drizzle-orm';
import { z } from 'zod';

import {
  auditEventSchema,
  diagnosisSchema,
  drugSchema,
  hospitalSchema,
  investigationSchema,
  patientSchema,
  quickPackSchema,
  signedRxSchema,
  userSchema,
} from '@swiftrx/shared/schemas';
import {
  MOCK_AUDIT,
  MOCK_DIAGNOSES,
  MOCK_DRUGS,
  MOCK_HOSPITALS,
  MOCK_INVESTIGATIONS,
  MOCK_PATIENTS,
  MOCK_QUICK_PACKS,
  MOCK_SIGNED_RX,
  MOCK_USERS,
} from '@swiftrx/shared/seedData';

import type { Db } from './client';
import {
  auditEvents,
  diagnoses,
  diagnosisInvestigations,
  drugs,
  hospitalSettings,
  hospitals,
  investigations,
  memberships,
  patientAllergies,
  patients,
  prescriptionInvestigations,
  prescriptionItems,
  prescriptions,
  quickPacks,
  users,
} from './schema';

export const seedDataSchema = z.object({
  hospitals: z.array(hospitalSchema),
  users: z.array(userSchema),
  patients: z.array(patientSchema),
  drugs: z.array(drugSchema),
  investigations: z.array(investigationSchema),
  diagnoses: z.array(diagnosisSchema),
  quickPacks: z.array(quickPackSchema),
  signedRx: z.array(signedRxSchema),
  audit: z.array(auditEventSchema),
});

export type SeedData = z.infer<typeof seedDataSchema>;

/** Rows written per table. */
export type SeedCounts = Record<string, number>;

export type SeedResult = { seeded: true; counts: SeedCounts } | { seeded: false };

/** The demo data from apps/shared/src/seed, as a fresh copy. */
export function demoSeedData(): SeedData {
  return structuredClone({
    hospitals: MOCK_HOSPITALS,
    users: MOCK_USERS,
    patients: MOCK_PATIENTS,
    drugs: MOCK_DRUGS,
    investigations: MOCK_INVESTIGATIONS,
    diagnoses: MOCK_DIAGNOSES,
    quickPacks: MOCK_QUICK_PACKS,
    signedRx: MOCK_SIGNED_RX,
    audit: MOCK_AUDIT,
  });
}

export async function seed(db: Db, data: SeedData = demoSeedData()): Promise<SeedResult> {
  const d = seedDataSchema.parse(data);

  return db.transaction(async (tx) => {
    const [{ existing }] = await tx.select({ existing: count() }).from(hospitals);
    if (existing > 0) return { seeded: false };

    const counts: SeedCounts = {};
    async function insertAll<T extends Table>(table: T, rows: T['$inferInsert'][]) {
      if (rows.length > 0) await tx.insert(table).values(rows);
      counts[getTableName(table)] = rows.length;
    }

    // --- Hospitals ---------------------------------------------------------
    const inserted = await tx
      .insert(hospitals)
      .values(
        d.hospitals.map((h) => ({
          slug: h.slug,
          name: h.name,
          city: h.city,
          country: h.country,
          status: h.status,
          plan: h.plan,
          contactEmail: h.contactEmail,
          monthlyRxCap: h.monthlyRxCap,
          primaryColor: h.primaryColor ?? null,
          createdAt: new Date(h.createdAt),
        })),
      )
      .returning({ id: hospitals.id, slug: hospitals.slug });
    counts.hospitals = inserted.length;

    const idBySlug = new Map(inserted.map((h) => [h.slug, h.id]));
    const hospitalId = (slug: string) => {
      const id = idBySlug.get(slug);
      if (!id)
        throw new Error(`Seed data names hospital "${slug}", which isn't in hospitals.json.`);
      return id;
    };
    const rxDesign = (slug: string) => d.hospitals.find((h) => h.slug === slug)!.rxDesign;

    await insertAll(
      hospitalSettings,
      d.hospitals.map((h) => ({
        hospitalId: hospitalId(h.slug),
        features: h.features,
        rxDesign: h.rxDesign,
      })),
    );

    // --- Users ---------------------------------------------------------------
    await insertAll(
      users,
      d.users.map((u) => ({
        id: u.id,
        email: u.email,
        passwordHash: u.passwordHash,
        name: u.name,
        isPlatformAdmin: u.role === 'platform_admin',
        specialty: u.specialty ?? null,
        licenseNo: u.licenseNo ?? null,
        status: u.status,
        createdAt: new Date(u.createdAt),
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      })),
    );
    await insertAll(
      memberships,
      d.users.flatMap((u) =>
        u.role === 'platform_admin' || u.hospitalSlug === null
          ? []
          : [
              {
                hospitalId: hospitalId(u.hospitalSlug),
                userId: u.id,
                role: u.role,
                createdAt: new Date(u.createdAt),
              },
            ],
      ),
    );

    // --- Catalog ---------------------------------------------------------------
    await insertAll(
      drugs,
      d.drugs.map((g) => ({
        id: g.id,
        genericName: g.genericName,
        brandNames: g.brandNames,
        therapeuticClass: g.therapeuticClass,
        defaultDoseValue: g.defaultDosage.value,
        defaultDoseUnit: g.defaultDosage.unit,
        defaultFrequency: g.defaultFrequency,
        defaultDurationDays: g.defaultDurationDays,
        contraindications: g.contraindications,
        interactsWith: g.interactsWith,
      })),
    );
    await insertAll(investigations, d.investigations);
    await insertAll(
      diagnoses,
      d.diagnoses.map(({ code, name, category }) => ({ code, name, category })),
    );
    await insertAll(
      diagnosisInvestigations,
      d.diagnoses.flatMap((dx) =>
        (dx.recommendedInvestigations ?? []).map((inv, position) => ({
          diagnosisCode: dx.code,
          investigationCode: inv.code,
          position,
        })),
      ),
    );
    await insertAll(
      quickPacks,
      d.quickPacks.map((p) => ({
        id: p.packId,
        diagnosisCode: p.diagnosisCode,
        shortcutKey: p.shortcutKey,
        rankScore: p.rankScore,
        recommendationReason: p.recommendationReason,
        medications: p.medications,
      })),
    );

    // --- Patients --------------------------------------------------------------
    await insertAll(
      patients,
      d.patients.map((p) => ({
        id: p.id,
        hospitalId: hospitalId(p.hospitalSlug),
        name: p.name,
        age: p.age,
        sex: p.sex,
        weightKg: p.weightKg,
        contact: p.contact,
        allergyStatus: p.allergies.length > 0 ? ('recorded' as const) : ('not_recorded' as const),
        activeProblems: p.activeProblems,
        activeMedications: p.activeMedications,
        recentVitals: p.recentVitals,
        createdAt: new Date(p.createdAt),
      })),
    );
    await insertAll(
      patientAllergies,
      d.patients.flatMap((p) =>
        p.allergies.map((substance) => ({
          hospitalId: hospitalId(p.hospitalSlug),
          patientId: p.id,
          substance,
        })),
      ),
    );

    // --- Prescriptions -------------------------------------------------------
    await insertAll(
      prescriptions,
      d.signedRx.map((rx) => ({
        id: rx.id,
        hospitalId: hospitalId(rx.hospitalSlug),
        patientId: rx.patient.id,
        doctorId: rx.doctorId,
        diagnosisCode: rx.diagnosis.code,
        signedAt: new Date(rx.signedAt),
        patientSnapshot: rx.patient,
        diagnosisSnapshot: rx.diagnosis,
        // hospitalId() above has already refused an unknown slug.
        rxDesignSnapshot: rxDesign(rx.hospitalSlug),
        doctorName: rx.doctorName,
        doctorLicense: rx.doctorLicense,
        safetyOverride: rx.safetyOverride ?? null,
      })),
    );
    await insertAll(
      prescriptionItems,
      d.signedRx.flatMap((rx) =>
        rx.medications.map((m, position) => ({
          hospitalId: hospitalId(rx.hospitalSlug),
          prescriptionId: rx.id,
          position,
          rowId: m.rowId,
          drugId: m.drugId,
          genericName: m.genericName,
          brandName: m.brandName ?? null,
          doseValue: m.dosage.value,
          doseUnit: m.dosage.unit,
          frequency: m.frequency,
          durationDays: m.durationDays,
          instructions: m.instructions,
        })),
      ),
    );
    await insertAll(
      prescriptionInvestigations,
      d.signedRx.flatMap((rx) =>
        rx.investigations.map((inv, position) => ({
          hospitalId: hospitalId(rx.hospitalSlug),
          prescriptionId: rx.id,
          position,
          code: inv.code,
          name: inv.name,
          type: inv.type,
        })),
      ),
    );

    // --- Audit log -------------------------------------------------------------
    await insertAll(
      auditEvents,
      d.audit.map((e) => {
        // The columns take the fields every kind shares; the rest is details.
        const { kind, userId, userEmail, at, hospitalSlug, ...rest } = e;
        const { ip, ...details } = rest as typeof rest & { ip?: string };
        return {
          kind,
          actorId: userId,
          actorEmail: userEmail,
          at: new Date(at),
          hospitalId: hospitalSlug ? hospitalId(hospitalSlug) : null,
          ip: ip ?? null,
          details,
        };
      }),
    );

    return { seeded: true, counts };
  });
}
