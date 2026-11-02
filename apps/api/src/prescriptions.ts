// =============================================================================
//  SwiftRx API — Prescriptions
// =============================================================================
//    GET  /api/hospitals/:slug/prescriptions   a hospital's signed Rx, newest
//                                              first (its users, or the
//                                              platform admin)
//    GET  /api/prescriptions                   every hospital's (platform admin)
//    POST /api/hospitals/:slug/prescriptions   sign one (a licensed doctor there)
//
//  Only the server creates a signed prescription. The pad sends ids and its
//  rows (PrescriptionDraft); the server:
//    - takes the doctor from the session: an active user with a license
//      number and a doctor's role at this hospital (decision D3);
//    - looks up the patient, the diagnosis, every medicine, brand and test
//      itself, and takes names from the catalog, not from the request;
//    - applies the hospital's limits: medicines per Rx, the monthly Rx cap
//      (with the settings row locked, so two signs can't both slip under
//      it), and the brand-search and investigations switches;
//    - re-runs the safety checks (apps/shared/src/safety.ts, the pad's own).
//      They always run: the "safety alerts" switch only hides minor warnings
//      in the pad. A critical alert needs a reason of MIN_OVERRIDE_REASON
//      characters or more, stored with the alerts the server found (422
//      without one);
//    - freezes the patient, the diagnosis and the hospital's Rx design,
//      assigns the id and the time, computes the record hash (rxHash.ts), and
//      writes the prescription, its rows and the audit entry in one
//      transaction. The rows are append-only (migration 0008).
// =============================================================================

import { randomBytes } from 'node:crypto';

import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { Hono } from 'hono';

import { MIN_OVERRIDE_REASON, evaluateAllMedications } from '@swiftrx/shared/safety';
import { prescriptionDraftSchema } from '@swiftrx/shared/schemas';
import type {
  Diagnosis,
  Drug,
  Investigation,
  RxMedication,
  SafetyAlert,
  SignedRx,
} from '@swiftrx/shared/types';

import type { AuthDeps } from './auth/routes';
import { readCatalog } from './catalog';
import {
  auditEvents,
  brands,
  hospitalSettings,
  hospitals,
  prescriptionInvestigations,
  prescriptionItems,
  prescriptions,
} from './db/schema';
import { guard, parseBody, readPatients, startOfMonthInDhaka } from './hospitals';
import { mayRead } from './reads';
import { rxHash } from './rxHash';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

/** What the server checks a draft against; the catalog doesn't change while it runs. */
interface Reference {
  drugs: Drug[];
  drugById: Map<string, Drug>;
  diagnosisByCode: Map<string, Diagnosis>;
  investigationByCode: Map<string, Investigation>;
}

export function prescriptionRoutes(deps: Deps) {
  const { db } = deps;
  const routes = new Hono();
  let reference: Promise<Reference> | undefined;

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get('/hospitals/:slug/prescriptions', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(c, deps, (a) => mayRead(a, slug));
    if (auth instanceof Response) return auth;
    return c.json(await readPrescriptions(deps, slug));
  });

  routes.get('/prescriptions', async (c) => {
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    return c.json(await readPrescriptions(deps));
  });

  routes.post('/hospitals/:slug/prescriptions', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(
      c,
      deps,
      (a) => a.session.role !== 'platform_admin' && a.session.hospitalSlug === slug,
    );
    if (auth instanceof Response) return auth;
    const prescriber =
      auth.user.status === 'active' &&
      !!auth.user.licenseNo?.trim() &&
      auth.memberships.some((m) => m.role === 'doctor' && m.hospitalSlug === slug);
    if (!prescriber) {
      return c.json({ error: 'Only a licensed doctor at this hospital can sign.' }, 403);
    }
    const body = await parseBody(c, prescriptionDraftSchema);
    if (body instanceof Response) return body;

    const [hospital] = await db
      .select({ id: hospitals.id, features: hospitalSettings.features })
      .from(hospitals)
      .innerJoin(hospitalSettings, eq(hospitalSettings.hospitalId, hospitals.id))
      .where(eq(hospitals.slug, slug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);
    const { features } = hospital;

    reference ??= loadReference(deps).catch((error: unknown) => {
      reference = undefined;
      throw error;
    });
    const ref = await reference;
    const bad = (error: string) => c.json({ error }, 400);

    // --- what the draft names ------------------------------------------------
    const [patient] = await readPatients(deps, slug, body.patientId);
    if (!patient) return bad('No such patient at this hospital.');
    const catalogDiagnosis = ref.diagnosisByCode.get(body.diagnosisCode);
    if (!catalogDiagnosis) return bad(`Unknown diagnosis ${body.diagnosisCode}.`);
    const diagnosis: Diagnosis = features.enableInvestigations
      ? catalogDiagnosis
      : {
          code: catalogDiagnosis.code,
          name: catalogDiagnosis.name,
          category: catalogDiagnosis.category,
        };

    if (body.medications.length > features.maxMedicationsPerRx) {
      return bad(
        `This hospital allows at most ${features.maxMedicationsPerRx} medicines on one prescription.`,
      );
    }
    const brandRows = await db
      .select()
      .from(brands)
      .where(
        inArray(
          brands.drugId,
          body.medications.map((m) => m.drugId),
        ),
      );
    const medications: RxMedication[] = [];
    for (const [i, m] of body.medications.entries()) {
      const row = `Row ${i + 1}`;
      const drug = ref.drugById.get(m.drugId);
      if (!drug) return bad(`${row}: unknown medicine ${m.drugId}.`);
      const med: RxMedication = {
        rowId: m.rowId,
        drugId: drug.id,
        genericName: drug.genericName,
        dosage: m.dosage,
        frequency: m.frequency,
        durationDays: m.durationDays,
        instructions: m.instructions,
      };
      if (m.brandName) {
        if (!features.enableBrandSearch) return bad(`${row}: brands are switched off here.`);
        const brand = brandRows.find(
          (b) =>
            b.drugId === drug.id &&
            b.name === m.brandName &&
            (m.form === undefined || b.form === m.form) &&
            (m.strength === undefined || (b.strength ?? undefined) === m.strength),
        );
        if (!brand) return bad(`${row}: ${m.brandName} isn't a brand of ${drug.genericName}.`);
        med.brandName = brand.name;
        med.form = brand.form;
        if (brand.strength) med.strength = brand.strength;
      }
      medications.push(med);
    }

    if (body.investigations.length > 0 && !features.enableInvestigations) {
      return bad('Investigations are switched off here.');
    }
    const investigations: Investigation[] = [];
    for (const inv of body.investigations) {
      const found = ref.investigationByCode.get(inv.code);
      if (!found) return bad(`Unknown investigation ${inv.code}.`);
      investigations.push(found);
    }

    // --- safety: always, whatever the hospital's switch ------------------------
    const critical: SafetyAlert[] = [
      ...evaluateAllMedications(medications, patient, ref.drugs).values(),
    ]
      .flat()
      .filter((a) => a.severity === 'critical');
    const reason = body.overrideReason?.trim() ?? '';
    if (critical.length > 0 && reason.length < MIN_OVERRIDE_REASON) {
      return c.json(
        {
          error: `Signing through ${critical.length === 1 ? 'a critical alert' : `${critical.length} critical alerts`} needs a reason of at least ${MIN_OVERRIDE_REASON} characters.`,
          alerts: critical,
        },
        422,
      );
    }

    // --- sign ------------------------------------------------------------------
    const now = deps.now();
    const rx: SignedRx = {
      id: `rx_${randomBytes(6).toString('hex')}`,
      signedAt: now.toISOString(),
      hospitalSlug: slug,
      patient,
      diagnosis,
      medications,
      investigations,
      doctorId: auth.user.id,
      doctorName: auth.user.name,
      doctorLicense: auth.user.licenseNo!.trim(),
      ...(critical.length > 0 ? { safetyOverride: { reason, alerts: critical } } : {}),
    };
    rx.recordHash = rxHash(rx);

    const capped = await db.transaction(async (tx) => {
      // Locks the hospital's settings, so two signs can't both slip under
      // the monthly cap.
      const [settings] = await tx
        .select({ rxDesign: hospitalSettings.rxDesign })
        .from(hospitalSettings)
        .where(eq(hospitalSettings.hospitalId, hospital.id))
        .for('update');
      const [cap] = await tx
        .select({ monthlyRxCap: hospitals.monthlyRxCap })
        .from(hospitals)
        .where(eq(hospitals.id, hospital.id));
      const [{ n }] = await tx
        .select({ n: count() })
        .from(prescriptions)
        .where(
          and(
            eq(prescriptions.hospitalId, hospital.id),
            gte(prescriptions.signedAt, startOfMonthInDhaka(now)),
          ),
        );
      if (n >= cap.monthlyRxCap) return cap.monthlyRxCap;

      await tx.insert(prescriptions).values({
        id: rx.id,
        hospitalId: hospital.id,
        patientId: patient.id,
        doctorId: rx.doctorId,
        diagnosisCode: diagnosis.code,
        signedAt: now,
        patientSnapshot: patient,
        diagnosisSnapshot: diagnosis,
        rxDesignSnapshot: settings.rxDesign,
        doctorName: rx.doctorName,
        doctorLicense: rx.doctorLicense,
        safetyOverride: rx.safetyOverride ?? null,
        recordHash: rx.recordHash,
      });
      await tx.insert(prescriptionItems).values(
        medications.map((m, position) => ({
          hospitalId: hospital.id,
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
      );
      if (investigations.length > 0) {
        await tx.insert(prescriptionInvestigations).values(
          investigations.map((inv, position) => ({
            hospitalId: hospital.id,
            prescriptionId: rx.id,
            position,
            code: inv.code,
            name: inv.name,
            type: inv.type,
          })),
        );
      }
      await tx.insert(auditEvents).values({
        kind: 'sign_rx',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: hospital.id,
        at: now,
        details: {
          rxId: rx.id,
          patientName: patient.name,
          ...(rx.safetyOverride ? { overrideReason: reason } : {}),
        },
      });
      return null;
    });
    if (capped !== null) {
      return c.json(
        { error: `This hospital has reached its limit of ${capped} prescriptions this month.` },
        409,
      );
    }
    return c.json(rx, 201);
  });

  return routes;
}

/** Signed prescriptions, newest first, as the apps see them: every hospital's, or one's. */
export async function readPrescriptions(
  deps: Pick<Deps, 'db'>,
  slug?: string,
): Promise<SignedRx[]> {
  const rows = await deps.db
    .select({ rx: prescriptions, hospitalSlug: hospitals.slug })
    .from(prescriptions)
    .innerJoin(hospitals, eq(hospitals.id, prescriptions.hospitalId))
    .where(slug ? eq(hospitals.slug, slug) : undefined)
    .orderBy(desc(prescriptions.signedAt), desc(prescriptions.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.rx.id);
  const [items, tests] = await Promise.all([
    deps.db
      .select()
      .from(prescriptionItems)
      .where(inArray(prescriptionItems.prescriptionId, ids))
      .orderBy(asc(prescriptionItems.prescriptionId), asc(prescriptionItems.position)),
    deps.db
      .select()
      .from(prescriptionInvestigations)
      .where(inArray(prescriptionInvestigations.prescriptionId, ids))
      .orderBy(
        asc(prescriptionInvestigations.prescriptionId),
        asc(prescriptionInvestigations.position),
      ),
  ]);

  return rows.map(({ rx, hospitalSlug }) => ({
    id: rx.id,
    signedAt: rx.signedAt.toISOString(),
    hospitalSlug,
    patient: rx.patientSnapshot,
    diagnosis: rx.diagnosisSnapshot,
    medications: items
      .filter((m) => m.prescriptionId === rx.id)
      .map((m) => ({
        rowId: m.rowId,
        drugId: m.drugId,
        genericName: m.genericName,
        ...(m.brandName !== null ? { brandName: m.brandName } : {}),
        ...(m.form !== null ? { form: m.form } : {}),
        ...(m.strength !== null ? { strength: m.strength } : {}),
        dosage: { value: m.doseValue, unit: m.doseUnit },
        frequency: m.frequency,
        durationDays: m.durationDays,
        instructions: m.instructions,
      })),
    investigations: tests
      .filter((t) => t.prescriptionId === rx.id)
      .map((t) => ({ code: t.code, name: t.name, type: t.type })),
    doctorId: rx.doctorId,
    doctorName: rx.doctorName,
    doctorLicense: rx.doctorLicense,
    ...(rx.safetyOverride ? { safetyOverride: rx.safetyOverride } : {}),
    ...(rx.recordHash ? { recordHash: rx.recordHash } : {}),
  }));
}

async function loadReference(deps: Pick<Deps, 'db'>): Promise<Reference> {
  const catalog = await readCatalog(deps);
  return {
    drugs: catalog.drugs,
    drugById: new Map(catalog.drugs.map((d) => [d.id, d])),
    diagnosisByCode: new Map(catalog.diagnoses.map((d) => [d.code, d])),
    investigationByCode: new Map(catalog.investigations.map((i) => [i.code, i])),
  };
}
