// =============================================================================
//  SwiftRx API — Hospitals and patients
// =============================================================================
//    GET   /api/hospitals/:slug/profile    name and plan, for the sign-in page
//                                          (no session needed)
//    GET   /api/hospitals                  every hospital (platform admin)
//    POST  /api/hospitals                  create one (platform admin)
//    GET   /api/hospitals/:slug            one hospital, with its settings
//    PATCH /api/hospitals/:slug            its features and Rx design
//                                          (platform admin: decision D12)
//    GET   /api/hospitals/:slug/patients   its patients
//    POST  /api/hospitals/:slug/patients   add one (the hospital's own users)
//
//  Reads follow reads.ts: a platform admin sees every hospital, a hospital's
//  users see their own (401 without a session, 403 otherwise). Writes check
//  the body with the shared zod schemas and write their audit row in the
//  same transaction.
//
//  `monthlyRxUsed` is counted from `prescriptions` signed since the start of
//  this month in Bangladesh (UTC+6, no daylight saving). Prescriptions are
//  still signed in the browser's mock until POST /prescriptions exists, so
//  until then it only counts what the database holds.
// =============================================================================

import { randomBytes } from 'node:crypto';

import { and, asc, count, eq, gte, inArray } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { z } from 'zod';

import {
  hospitalSettingsSchema,
  newHospitalSchema,
  newPatientSchema,
} from '@swiftrx/shared/schemas';
import {
  DEFAULT_HOSPITAL_FEATURES,
  DEFAULT_RX_DESIGN,
  type AuthSession,
  type Hospital,
  type HospitalProfile,
  type Patient,
} from '@swiftrx/shared/types';

import { currentSession, type AuthDeps } from './auth/routes';
import {
  auditEvents,
  hospitalSettings,
  hospitals,
  patientAllergies,
  patients,
  prescriptions,
} from './db/schema';
import { mayRead } from './reads';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

/** Bangladesh Standard Time, for "this month". */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export function hospitalRoutes(deps: Deps) {
  const { db } = deps;
  const routes = new Hono();

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get('/hospitals/:slug/profile', async (c) => {
    const [row] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.slug, c.req.param('slug')));
    if (!row) return c.json({ error: 'No such hospital.' }, 404);
    const profile: HospitalProfile = {
      slug: row.slug,
      name: row.name,
      city: row.city,
      country: row.country,
      status: row.status,
      plan: row.plan,
      ...(row.primaryColor ? { primaryColor: row.primaryColor } : {}),
    };
    return c.json(profile);
  });

  routes.get('/hospitals', async (c) => {
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    return c.json(await readHospitals(deps));
  });

  routes.post('/hospitals', async (c) => {
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    const body = await parseBody(c, newHospitalSchema);
    if (body instanceof Response) return body;

    const now = deps.now();
    const created = await db.transaction(async (tx) => {
      const [taken] = await tx.select().from(hospitals).where(eq(hospitals.slug, body.slug));
      if (taken) return null;
      const [row] = await tx
        .insert(hospitals)
        .values({ ...body, status: 'trial', createdAt: now })
        .returning({ id: hospitals.id });
      await tx.insert(hospitalSettings).values({
        hospitalId: row.id,
        features: { ...DEFAULT_HOSPITAL_FEATURES },
        rxDesign: { ...DEFAULT_RX_DESIGN, headerTitle: body.name },
        updatedAt: now,
      });
      await tx.insert(auditEvents).values({
        kind: 'create_hospital',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: row.id,
        at: now,
        details: { hospitalName: body.name },
      });
      return row;
    });
    if (!created) return c.json({ error: 'A hospital with that subdomain already exists.' }, 409);
    const [hospital] = await readHospitals(deps, body.slug);
    return c.json(hospital, 201);
  });

  routes.get('/hospitals/:slug', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(c, deps, (a) => mayRead(a, slug));
    if (auth instanceof Response) return auth;
    const [hospital] = await readHospitals(deps, slug);
    return hospital ? c.json(hospital) : c.json({ error: 'No such hospital.' }, 404);
  });

  routes.patch('/hospitals/:slug', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    const body = await parseBody(c, hospitalSettingsSchema);
    if (body instanceof Response) return body;

    const [row] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, slug));
    if (!row) return c.json({ error: 'No such hospital.' }, 404);
    await db
      .update(hospitalSettings)
      .set({ features: body.features, rxDesign: body.rxDesign, updatedAt: deps.now() })
      .where(eq(hospitalSettings.hospitalId, row.id));
    const [hospital] = await readHospitals(deps, slug);
    return c.json(hospital);
  });

  routes.get('/hospitals/:slug/patients', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(c, deps, (a) => mayRead(a, slug));
    if (auth instanceof Response) return auth;
    return c.json(await readPatients(deps, slug));
  });

  routes.post('/hospitals/:slug/patients', async (c) => {
    const slug = c.req.param('slug');
    // Only the hospital's own users: a platform admin doesn't add patients.
    const auth = await guard(
      c,
      deps,
      (a) => a.session.role !== 'platform_admin' && a.session.hospitalSlug === slug,
    );
    if (auth instanceof Response) return auth;
    const body = await parseBody(c, newPatientSchema);
    if (body instanceof Response) return body;

    const [hospital] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, slug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);

    const now = deps.now();
    const id = `p_${randomBytes(6).toString('hex')}`;
    await db.transaction(async (tx) => {
      await tx.insert(patients).values({
        id,
        hospitalId: hospital.id,
        name: body.name,
        age: body.age,
        sex: body.sex,
        weightKg: body.weightKg,
        contact: body.contact,
        allergyStatus: body.allergyStatus,
        activeProblems: body.activeProblems,
        activeMedications: [],
        recentVitals: [
          { label: 'BP', value: '—' },
          { label: 'Pulse', value: '—' },
          { label: 'SpO2', value: '—' },
        ],
        createdAt: now,
      });
      if (body.allergies.length > 0) {
        await tx.insert(patientAllergies).values(
          body.allergies.map((substance) => ({
            hospitalId: hospital.id,
            patientId: id,
            substance,
            createdAt: now,
          })),
        );
      }
      await tx.insert(auditEvents).values({
        kind: 'create_patient',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: hospital.id,
        at: now,
        details: { patientId: id, patientName: body.name },
      });
    });
    const patient = (await readPatients(deps, slug)).find((p) => p.id === id)!;
    return c.json(patient, 201);
  });

  return routes;
}

// --- reads -------------------------------------------------------------------

/** Every hospital, or the one with `slug`, in the shape the apps use. */
async function readHospitals(deps: Deps, slug?: string): Promise<Hospital[]> {
  const rows = await deps.db
    .select({ hospital: hospitals, settings: hospitalSettings })
    .from(hospitals)
    .innerJoin(hospitalSettings, eq(hospitalSettings.hospitalId, hospitals.id))
    .where(slug ? eq(hospitals.slug, slug) : undefined)
    .orderBy(asc(hospitals.createdAt), asc(hospitals.slug));
  if (rows.length === 0) return [];

  const used = await deps.db
    .select({ hospitalId: prescriptions.hospitalId, n: count() })
    .from(prescriptions)
    .where(
      and(
        inArray(
          prescriptions.hospitalId,
          rows.map((r) => r.hospital.id),
        ),
        gte(prescriptions.signedAt, startOfMonthInDhaka(deps.now())),
      ),
    )
    .groupBy(prescriptions.hospitalId);
  const usedBy = new Map(used.map((u) => [u.hospitalId, u.n]));

  return rows.map(({ hospital: h, settings }) => ({
    slug: h.slug,
    name: h.name,
    city: h.city,
    country: h.country,
    status: h.status,
    plan: h.plan,
    createdAt: h.createdAt.toISOString(),
    contactEmail: h.contactEmail,
    monthlyRxCap: h.monthlyRxCap,
    monthlyRxUsed: usedBy.get(h.id) ?? 0,
    ...(h.primaryColor ? { primaryColor: h.primaryColor } : {}),
    features: settings.features,
    rxDesign: settings.rxDesign,
  }));
}

/** A hospital's patients, oldest first, with their recorded allergies. */
async function readPatients(deps: Deps, slug: string): Promise<Patient[]> {
  const rows = await deps.db
    .select({ patient: patients })
    .from(patients)
    .innerJoin(hospitals, eq(hospitals.id, patients.hospitalId))
    .where(eq(hospitals.slug, slug))
    .orderBy(asc(patients.createdAt), asc(patients.id));
  if (rows.length === 0) return [];
  const allergyRows = await deps.db
    .select()
    .from(patientAllergies)
    .where(
      inArray(
        patientAllergies.patientId,
        rows.map((r) => r.patient.id),
      ),
    )
    .orderBy(asc(patientAllergies.createdAt), asc(patientAllergies.id));

  return rows.map(({ patient: p }) => ({
    id: p.id,
    hospitalSlug: slug,
    name: p.name,
    age: p.age,
    sex: p.sex,
    weightKg: p.weightKg,
    contact: p.contact,
    allergyStatus: p.allergyStatus,
    allergies: allergyRows.filter((a) => a.patientId === p.id).map((a) => a.substance),
    activeProblems: p.activeProblems,
    activeMedications: p.activeMedications,
    recentVitals: p.recentVitals,
    createdAt: p.createdAt.toISOString(),
  }));
}

// --- helpers -----------------------------------------------------------------

function startOfMonthInDhaka(now: Date): Date {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - DHAKA_OFFSET_MS);
}

/** The session when `allowed` says yes; otherwise the 401 or 403 to send. */
async function guard(
  c: Context,
  deps: Deps,
  allowed: (auth: AuthSession) => boolean,
): Promise<AuthSession | Response> {
  const auth = await currentSession(c, deps);
  if (!auth) return c.json({ error: 'Sign in first.' }, 401);
  if (!allowed(auth)) return c.json({ error: 'Not allowed.' }, 403);
  return auth;
}

/** The JSON body checked against `schema`, or the 400 to send. */
async function parseBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.infer<S> | Response> {
  const json: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.');
  return c.json({ error: field ? `${field}: ${issue.message}` : 'Send a JSON body.' }, 400);
}
