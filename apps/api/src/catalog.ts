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
//  server runs, so the answer is built once and reused. Any signed-in user
//  may read it; without a session it's a 401 like the other reads.
// =============================================================================

import { asc } from 'drizzle-orm';
import { Hono } from 'hono';
import { compress } from 'hono/compress';

import type { Catalog, Investigation } from '@swiftrx/shared/types';

import { currentSession, type AuthDeps } from './auth/routes';
import {
  brands,
  diagnoses,
  diagnosisInvestigations,
  drugs,
  investigations,
  quickPacks,
} from './db/schema';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

export function catalogRoutes(deps: Deps) {
  const routes = new Hono();
  let body: Promise<string> | undefined;

  routes.get('/catalog', compress(), async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!(await currentSession(c, deps))) return c.json({ error: 'Sign in first.' }, 401);

    body ??= readCatalog(deps).then((catalog) => JSON.stringify(catalog));
    try {
      const json = await body;
      c.header('Content-Type', 'application/json; charset=UTF-8');
      return c.body(json);
    } catch (error) {
      body = undefined; // try again on the next request
      throw error;
    }
  });

  return routes;
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
