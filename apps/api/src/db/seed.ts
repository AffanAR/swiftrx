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
//  - The JSON holds no passwords, since the apps bundle it. The demo
//    accounts' passwords are in demo-passwords.json next to this file (they
//    are public: the demo's sign-in pages show them), and the seed stores
//    them as Argon2id hashes. A user without one has no password and can't
//    sign in.
//  - A user's single `hospitalSlug` and `role` become a membership; platform
//    admins get `is_platform_admin` and no membership.
//  - `allergies: []` is seeded as "not recorded", not "none known": the JSON
//    can't tell the two apart, and assuming "none" is the unsafe guess.
//  - A seeded Rx freezes the patient, the diagnosis and the hospital's Rx
//    design as they are in the seed.
//  - `monthlyRxUsed` isn't stored. It is a count of this month's prescriptions,
//    and the read endpoints will work it out from `prescriptions`.
// =============================================================================

import { and, count, eq, getTableName, inArray, like, not, type Table } from 'drizzle-orm';
import { z } from 'zod';

import {
  auditEventSchema,
  brandSchema,
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
  MOCK_BRANDS,
  MOCK_DIAGNOSES,
  MOCK_DRUGS,
  MOCK_HOSPITALS,
  MOCK_INVESTIGATIONS,
  MOCK_PATIENTS,
  MOCK_QUICK_PACKS,
  MOCK_SIGNED_RX,
  MOCK_USERS,
} from '@swiftrx/shared/seedData';

import { hashPassword } from '../auth/passwords';
import type { Db } from './client';
import demoPasswords from './demo-passwords.json';
import {
  auditEvents,
  brands,
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
  brands: z.array(brandSchema),
  investigations: z.array(investigationSchema),
  diagnoses: z.array(diagnosisSchema),
  quickPacks: z.array(quickPackSchema),
  signedRx: z.array(signedRxSchema),
  audit: z.array(auditEventSchema),
});

export type SeedData = z.infer<typeof seedDataSchema>;

/** Rows per INSERT; with the widest table's columns, well under Postgres's parameter limit. */
const INSERT_BATCH = 2000;

/** Rows written per table. */
export type SeedCounts = Record<string, number>;

export type SeedResult = { seeded: true; counts: SeedCounts } | { seeded: false };

/** The demo accounts' passwords, by user id. */
export const DEMO_PASSWORDS: Readonly<Record<string, string>> = demoPasswords;

/** The demo data from apps/shared/src/seed, as a fresh copy. */
export function demoSeedData(): SeedData {
  return structuredClone({
    hospitals: MOCK_HOSPITALS,
    users: MOCK_USERS,
    patients: MOCK_PATIENTS,
    drugs: MOCK_DRUGS,
    brands: MOCK_BRANDS,
    investigations: MOCK_INVESTIGATIONS,
    diagnoses: MOCK_DIAGNOSES,
    quickPacks: MOCK_QUICK_PACKS,
    signedRx: MOCK_SIGNED_RX,
    audit: MOCK_AUDIT,
  });
}

export async function seed(
  db: Db,
  data: SeedData = demoSeedData(),
  passwords: Readonly<Record<string, string>> = DEMO_PASSWORDS,
): Promise<SeedResult> {
  const d = seedDataSchema.parse(data);

  // Argon2 is slow on purpose, so hash before the transaction, and only when
  // there's something to seed. (The transaction checks again.)
  if (await hasHospitals(db)) return { seeded: false };
  const passwordHashes = new Map(
    await Promise.all(
      d.users
        .filter((u) => passwords[u.id] !== undefined)
        .map(async (u) => [u.id, await hashPassword(passwords[u.id])] as const),
    ),
  );

  return db.transaction(async (tx) => {
    if (await hasHospitals(tx)) return { seeded: false };

    const counts: SeedCounts = {};
    async function insertAll<T extends Table>(table: T, rows: T['$inferInsert'][]) {
      // In batches: one statement can carry at most 65,535 parameters, and
      // the brand list alone is about 150,000.
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.insert(table).values(rows.slice(i, i + INSERT_BATCH));
      }
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
        passwordHash: passwordHashes.get(u.id) ?? null,
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
        therapeuticClass: g.therapeuticClass,
        safetyReviewed: g.safetyReviewed,
        defaultDoseValue: g.defaultDosage?.value ?? null,
        defaultDoseUnit: g.defaultDosage?.unit ?? null,
        defaultFrequency: g.defaultFrequency ?? null,
        defaultDurationDays: g.defaultDurationDays ?? null,
        contraindications: g.contraindications,
        interactsWith: g.interactsWith,
      })),
    );
    await insertAll(
      brands,
      d.brands.map((b) => ({
        id: b.id,
        name: b.name,
        drugId: b.drugId,
        form: b.form,
        manufacturer: b.manufacturer,
        strength: b.strength ?? null,
        price: b.price ?? null,
        herbal: b.herbal ?? false,
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
          form: m.form ?? null,
          strength: m.strength ?? null,
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

/**
 * Give the demo accounts Argon2id hashes again where an older seed left
 * bcrypt ones, which the server no longer reads: dev databases seeded before
 * sign-in moved to the API. Other accounts are left alone. Returns how many
 * were updated.
 */
export async function upgradeDemoPasswords(
  db: Db,
  passwords: Readonly<Record<string, string>> = DEMO_PASSWORDS,
): Promise<number> {
  const ids = Object.keys(passwords);
  if (ids.length === 0) return 0;
  const stale = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), not(like(users.passwordHash, '$argon2id$%'))));
  for (const { id } of stale) {
    const passwordHash = await hashPassword(passwords[id]);
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
  return stale.length;
}

async function hasHospitals(db: Pick<Db, 'select'>): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(hospitals);
  return n > 0;
}
