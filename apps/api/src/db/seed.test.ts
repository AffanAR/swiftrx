import { asc, count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyPassword } from '../auth/passwords';
import type { Database } from './client';
import {
  auditEvents,
  hospitalSettings,
  hospitals,
  memberships,
  patientAllergies,
  patients,
  prescriptionInvestigations,
  prescriptionItems,
  prescriptions,
  users,
} from './schema';
import { DEMO_PASSWORDS, demoSeedData, seed, upgradeDemoPasswords, type SeedData } from './seed';
import { SLOW, freshDatabase } from './testDatabase';

describe('seed', () => {
  const data = demoSeedData();
  let database: Database;

  beforeAll(async () => {
    database = await freshDatabase();
  }, SLOW);

  afterAll(() => database.close());

  it('loads every row of the seed JSON', async () => {
    const result = await seed(database.db);

    const allergies = data.patients.flatMap((p) => p.allergies);
    expect(result).toEqual({
      seeded: true,
      counts: {
        hospitals: data.hospitals.length,
        hospital_settings: data.hospitals.length,
        users: data.users.length,
        memberships: data.users.filter((u) => u.role !== 'platform_admin').length,
        drugs: data.drugs.length,
        investigations: data.investigations.length,
        diagnoses: data.diagnoses.length,
        diagnosis_investigations: data.diagnoses.flatMap((d) => d.recommendedInvestigations ?? [])
          .length,
        quick_packs: data.quickPacks.length,
        patients: data.patients.length,
        patient_allergies: allergies.length,
        prescriptions: data.signedRx.length,
        prescription_items: data.signedRx.flatMap((rx) => rx.medications).length,
        prescription_investigations: data.signedRx.flatMap((rx) => rx.investigations).length,
        audit_events: data.audit.length,
      },
    });
    // The demo data is non-trivial, so the counts above prove something.
    expect(data.hospitals.length).toBeGreaterThan(1);
    expect(allergies.length).toBeGreaterThan(0);
  });

  it('does nothing the second time', async () => {
    expect(await seed(database.db)).toEqual({ seeded: false });
    const [{ n }] = await database.db.select({ n: count() }).from(hospitals);
    expect(n).toBe(data.hospitals.length);
  });

  it('stores the demo passwords as Argon2id hashes and turns roles into memberships', async () => {
    const rows = await database.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        isPlatformAdmin: users.isPlatformAdmin,
        slug: hospitals.slug,
        role: memberships.role,
      })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(hospitals, eq(hospitals.id, memberships.hospitalId));

    expect(rows).toHaveLength(data.users.length);
    for (const u of data.users) {
      const row = rows.find((r) => r.id === u.id)!;
      // Every demo account has a password, and the README's is the right one.
      const demoPassword = DEMO_PASSWORDS[u.id];
      expect(demoPassword).toBe(u.role === 'platform_admin' ? 'admin1234' : 'demo1234');
      expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(await verifyPassword(row.passwordHash, demoPassword)).toBe(true);
      if (u.role === 'platform_admin') {
        expect(row).toMatchObject({ isPlatformAdmin: true, slug: null, role: null });
      } else {
        expect(row).toMatchObject({ isPlatformAdmin: false, slug: u.hospitalSlug, role: u.role });
      }
    }
  });

  it('gives a demo account left with an old bcrypt hash an Argon2id one, and only that', async () => {
    const bcrypt = '$2b$08$TAAUtqfRLUtpwnmRvcsNrOTdnQ2v6UMrM4Nx/IPQWkyYrSSwppW9K';
    await database.db.update(users).set({ passwordHash: bcrypt }).where(eq(users.id, 'd_001'));

    expect(await upgradeDemoPasswords(database.db)).toBe(1);
    const [row] = await database.db.select().from(users).where(eq(users.id, 'd_001'));
    expect(await verifyPassword(row.passwordHash, 'demo1234')).toBe(true);
    expect(await upgradeDemoPasswords(database.db)).toBe(0);
  });

  it('stores each hospital with its settings', async () => {
    const rows = await database.db
      .select({ slug: hospitals.slug, features: hospitalSettings.features })
      .from(hospitals)
      .innerJoin(hospitalSettings, eq(hospitalSettings.hospitalId, hospitals.id));
    for (const h of data.hospitals) {
      expect(rows.find((r) => r.slug === h.slug)?.features).toEqual(h.features);
    }
  });

  it('files every patient under their own hospital, with an allergy status', async () => {
    const rows = await database.db
      .select({
        id: patients.id,
        slug: hospitals.slug,
        weightKg: patients.weightKg,
        allergyStatus: patients.allergyStatus,
      })
      .from(patients)
      .innerJoin(hospitals, eq(hospitals.id, patients.hospitalId));
    const allergyRows = await database.db.select().from(patientAllergies);

    for (const p of data.patients) {
      const row = rows.find((r) => r.id === p.id)!;
      expect(row.slug).toBe(p.hospitalSlug);
      expect(row.weightKg).toBe(p.weightKg); // numeric comes back as a number
      // An empty list in the JSON means "never asked", not "no allergies".
      expect(row.allergyStatus).toBe(p.allergies.length > 0 ? 'recorded' : 'not_recorded');
      expect(allergyRows.filter((a) => a.patientId === p.id).map((a) => a.substance)).toEqual(
        p.allergies,
      );
    }
  });

  it('freezes what each prescription showed when it was signed', async () => {
    for (const rx of data.signedRx) {
      const [row] = await database.db
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.id, rx.id));
      const items = await database.db
        .select()
        .from(prescriptionItems)
        .where(eq(prescriptionItems.prescriptionId, rx.id))
        .orderBy(asc(prescriptionItems.position));
      const tests = await database.db
        .select()
        .from(prescriptionInvestigations)
        .where(eq(prescriptionInvestigations.prescriptionId, rx.id))
        .orderBy(asc(prescriptionInvestigations.position));
      const hospital = data.hospitals.find((h) => h.slug === rx.hospitalSlug)!;

      expect(row.patientSnapshot).toEqual(rx.patient);
      expect(row.diagnosisSnapshot).toEqual(rx.diagnosis);
      expect(row.rxDesignSnapshot).toEqual(hospital.rxDesign);
      expect(row).toMatchObject({ doctorName: rx.doctorName, doctorLicense: rx.doctorLicense });
      expect(row.signedAt.toISOString()).toBe(rx.signedAt);
      expect(
        items.map((i) => ({ drugId: i.drugId, value: i.doseValue, unit: i.doseUnit })),
      ).toEqual(rx.medications.map((m) => ({ drugId: m.drugId, ...m.dosage })));
      expect(tests.map((t) => t.code)).toEqual(rx.investigations.map((i) => i.code));
    }
  });

  it('keeps the audit fields that are specific to each kind', async () => {
    const rows = await database.db.select().from(auditEvents).orderBy(asc(auditEvents.id));
    expect(rows.map((r) => r.kind)).toEqual(data.audit.map((e) => e.kind));

    const signed = data.audit.find((e) => e.kind === 'sign_rx')!;
    const row = rows.find((r) => r.kind === 'sign_rx')!;
    expect(row).toMatchObject({ actorId: signed.userId, actorEmail: signed.userEmail });
    expect(row.details).toEqual({ rxId: signed.rxId, patientName: signed.patientName });
  });

  it('never lets an audit event be changed or removed', async () => {
    const [{ id }] = await database.db.select({ id: auditEvents.id }).from(auditEvents).limit(1);
    const attempts = [
      database.db.update(auditEvents).set({ actorEmail: 'x@y.z' }).where(eq(auditEvents.id, id)),
      database.db.delete(auditEvents).where(eq(auditEvents.id, id)),
      database.db.execute(sql`truncate audit_events`),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({
        cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
      });
    }
    const [{ n }] = await database.db.select({ n: count() }).from(auditEvents);
    expect(n).toBe(data.audit.length);
  });

  it('refuses a prescription for another hospital’s patient', async () => {
    const rx = data.signedRx.find((r) => r.hospitalSlug === 'city-hospital')!;
    const [northstar] = await database.db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, 'northstar-medical'));
    const [row] = await database.db.select().from(prescriptions).where(eq(prescriptions.id, rx.id));

    await expect(
      database.db
        .insert(prescriptions)
        .values({ ...row, id: 'rx_cross_tenant', hospitalId: northstar.id }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/prescriptions_patient_fk/),
      }),
    });
  });
});

describe('seed with bad data', () => {
  let database: Database;

  beforeAll(async () => {
    database = await freshDatabase();
  }, SLOW);

  afterAll(() => database.close());

  async function hospitalCount() {
    const [{ n }] = await database.db.select({ n: count() }).from(hospitals);
    return n;
  }

  it('rejects a malformed row before writing anything', async () => {
    const data: SeedData = demoSeedData();
    data.hospitals[0].slug = 'City Hospital';

    await expect(seed(database.db, data)).rejects.toThrow(/slug/);
    expect(await hospitalCount()).toBe(0);
  });

  it('rolls everything back when a reference crosses hospitals', async () => {
    const data: SeedData = demoSeedData();
    // A Northstar patient on a City Hospital prescription.
    const rx = data.signedRx.find((r) => r.patient.hospitalSlug === 'northstar-medical')!;
    rx.hospitalSlug = 'city-hospital';

    // The zod schemas can't see across rows; the composite foreign key does.
    await expect(seed(database.db, data)).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/prescriptions_patient_fk/),
      }),
    });
    expect(await hospitalCount()).toBe(0);
  });

  // Last: this one leaves data behind.
  it('gives a user with no demo password no password at all', async () => {
    expect(await seed(database.db, demoSeedData(), {})).toMatchObject({ seeded: true });
    const hashes = await database.db.select({ hash: users.passwordHash }).from(users);
    expect(hashes.length).toBeGreaterThan(0);
    expect(hashes.every((h) => h.hash === null)).toBe(true);
  });
});
