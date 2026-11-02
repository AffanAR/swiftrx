// =============================================================================
//  SwiftRx API — Catalog
// =============================================================================
//    GET /api/catalog    the generics, brands, diagnoses, investigations and
//                        quick packs the Rx pad searches and checks against
//
//  The pad searches on the device, so a keystroke never waits on the network:
//  it loads the whole catalog once and keeps it. That's about 3.5 MB of JSON
//  (21,700 brands), sent compressed (about 0.4 MB).
//
//  Every hospital shares one catalog, and nothing writes to it while the
//  server runs, so it's read once. Any signed-in user may read it; without a
//  session it's a 401 like the other reads.
//
//  A hospital's feature switches decide what its users get: with brand search
//  off there are no brands, with quick packs off no packs, and with
//  investigations off no investigations (nor any suggested for a diagnosis).
//  The pad hides what comes back empty, so a switch works even if the pad
//  were changed to ignore it. Each of the eight combinations is turned into
//  JSON once and reused. A platform admin gets everything.
// =============================================================================

import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { compress } from 'hono/compress';

import type { Catalog, HospitalFeatures, Investigation } from '@swiftrx/shared/types';

import { currentSession, type AuthDeps } from './auth/routes';
import {
  brands,
  diagnoses,
  diagnosisInvestigations,
  drugs,
  hospitalSettings,
  hospitals,
  investigations,
  quickPacks,
} from './db/schema';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

export function catalogRoutes(deps: Deps) {
  const routes = new Hono();
  let full: Promise<Catalog> | undefined;
  const bodies = new Map<string, Promise<string>>();

  routes.get('/catalog', compress(), async (c) => {
    c.header('Cache-Control', 'no-store');
    const auth = await currentSession(c, deps);
    if (!auth) return c.json({ error: 'Sign in first.' }, 401);

    const features =
      auth.session.role === 'platform_admin'
        ? null
        : await featuresOf(deps, auth.session.hospitalSlug);
    const parts = {
      brands: features?.enableBrandSearch ?? true,
      quickPacks: features?.enableQuickPacks ?? true,
      investigations: features?.enableInvestigations ?? true,
    };
    const key = JSON.stringify(parts);

    full ??= readCatalog(deps);
    let body = bodies.get(key);
    if (!body) {
      body = full.then((catalog) => JSON.stringify(withParts(catalog, parts)));
      bodies.set(key, body);
    }
    try {
      const json = await body;
      c.header('Content-Type', 'application/json; charset=UTF-8');
      return c.body(json);
    } catch (error) {
      // Try again on the next request.
      full = undefined;
      bodies.clear();
      throw error;
    }
  });

  return routes;
}

/** The catalog without the parts a hospital has switched off. */
export function withParts(
  catalog: Catalog,
  parts: { brands: boolean; quickPacks: boolean; investigations: boolean },
): Catalog {
  return {
    drugs: catalog.drugs,
    brands: parts.brands ? catalog.brands : [],
    diagnoses: parts.investigations
      ? catalog.diagnoses
      : catalog.diagnoses.map((dx) => ({ code: dx.code, name: dx.name, category: dx.category })),
    investigations: parts.investigations ? catalog.investigations : [],
    quickPacks: parts.quickPacks ? catalog.quickPacks : [],
  };
}

async function featuresOf(deps: Pick<Deps, 'db'>, slug: string): Promise<HospitalFeatures | null> {
  const [row] = await deps.db
    .select({ features: hospitalSettings.features })
    .from(hospitalSettings)
    .innerJoin(hospitals, eq(hospitals.id, hospitalSettings.hospitalId))
    .where(eq(hospitals.slug, slug));
  return row?.features ?? null;
}

/** The catalog in the shapes the apps use. */
export async function readCatalog({ db }: Pick<Deps, 'db'>): Promise<Catalog> {
  const [drugRows, brandRows, diagnosisRows, investigationRows, links, packRows] =
    await Promise.all([
      db.select().from(drugs).orderBy(asc(drugs.genericName)),
      db.select().from(brands).orderBy(asc(brands.name), asc(brands.id)),
      db.select().from(diagnoses).orderBy(asc(diagnoses.code)),
      db.select().from(investigations).orderBy(asc(investigations.code)),
      db
        .select()
        .from(diagnosisInvestigations)
        .orderBy(asc(diagnosisInvestigations.diagnosisCode), asc(diagnosisInvestigations.position)),
      db
        .select()
        .from(quickPacks)
        .orderBy(asc(quickPacks.diagnosisCode), asc(quickPacks.shortcutKey)),
    ]);

  const investigationByCode = new Map(
    investigationRows.map((i) => [i.code, { code: i.code, name: i.name, type: i.type }]),
  );
  const recommended = new Map<string, Investigation[]>();
  for (const link of links) {
    const list = recommended.get(link.diagnosisCode) ?? [];
    list.push(investigationByCode.get(link.investigationCode)!);
    recommended.set(link.diagnosisCode, list);
  }

  return {
    drugs: drugRows.map((d) => ({
      id: d.id,
      genericName: d.genericName,
      therapeuticClass: d.therapeuticClass,
      safetyReviewed: d.safetyReviewed,
      ...(d.defaultDoseValue !== null && d.defaultDoseUnit !== null
        ? { defaultDosage: { value: d.defaultDoseValue, unit: d.defaultDoseUnit } }
        : {}),
      ...(d.defaultFrequency !== null ? { defaultFrequency: d.defaultFrequency } : {}),
      ...(d.defaultDurationDays !== null ? { defaultDurationDays: d.defaultDurationDays } : {}),
      contraindications: d.contraindications,
      interactsWith: d.interactsWith,
    })),
    brands: brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      drugId: b.drugId,
      form: b.form,
      manufacturer: b.manufacturer,
      ...(b.strength !== null ? { strength: b.strength } : {}),
      ...(b.price !== null ? { price: b.price } : {}),
      ...(b.herbal ? { herbal: true as const } : {}),
    })),
    diagnoses: diagnosisRows.map((d) => {
      const inv = recommended.get(d.code);
      return {
        code: d.code,
        name: d.name,
        category: d.category,
        ...(inv ? { recommendedInvestigations: inv } : {}),
      };
    }),
    investigations: [...investigationByCode.values()],
    quickPacks: packRows.map((p) => ({
      packId: p.id,
      shortcutKey: p.shortcutKey,
      diagnosisCode: p.diagnosisCode,
      rankScore: p.rankScore,
      recommendationReason: p.recommendationReason,
      medications: p.medications,
    })),
  };
}
