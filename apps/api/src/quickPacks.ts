// =============================================================================
//  SwiftRx API — A hospital's own quick packs
// =============================================================================
//    GET    /api/hospitals/:slug/quick-packs            its own packs
//    PUT    /api/hospitals/:slug/quick-packs/:dx/:key   set the pack in a slot
//    DELETE /api/hospitals/:slug/quick-packs/:dx/:key   back to the default
//
//  The catalog (catalog.ts) carries the default packs every hospital shares.
//  A hospital's own pack replaces the default in its slot, a diagnosis and
//  its Alt+1/2/3 key; the pad merges the two (mergeQuickPacks in
//  @swiftrx/shared). Reads follow reads.ts, and with quick packs switched off
//  a hospital's users get none, as the catalog does for the defaults.
//
//  Only the SwiftRx team (the platform admin) sets packs, like the rest of a
//  hospital's settings, and each change is audited. The server checks the
//  diagnosis and every medicine against the catalog, and writes each
//  medicine's generic name itself.
// =============================================================================

import { and, asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';

import { hospitalQuickPackSchema } from '@swiftrx/shared/schemas';
import { hospitalPackId } from '@swiftrx/shared/quickPacks';
import type { QuickPack } from '@swiftrx/shared/types';

import type { AuthDeps } from './auth/routes';
import {
  auditEvents,
  diagnoses,
  drugs,
  hospitalQuickPacks,
  hospitalSettings,
  hospitals,
} from './db/schema';
import { guard, parseBody, sameJson } from './hospitals';
import { mayRead } from './reads';

type Deps = Pick<AuthDeps, 'db' | 'now' | 'rootDomain' | 'secureCookies'>;

const KEYS = ['1', '2', '3'] as const;
type Key = (typeof KEYS)[number];
const isKey = (k: string): k is Key => (KEYS as readonly string[]).includes(k);

export function quickPackRoutes(deps: Deps) {
  const { db } = deps;
  const routes = new Hono();

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get('/hospitals/:slug/quick-packs', async (c) => {
    const slug = c.req.param('slug');
    const auth = await guard(c, deps, (a) => mayRead(a, slug));
    if (auth instanceof Response) return auth;
    const [hospital] = await db
      .select({ id: hospitals.id, features: hospitalSettings.features })
      .from(hospitals)
      .innerJoin(hospitalSettings, eq(hospitalSettings.hospitalId, hospitals.id))
      .where(eq(hospitals.slug, slug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);
    if (auth.session.role !== 'platform_admin' && !hospital.features.enableQuickPacks) {
      return c.json([]);
    }
    return c.json(await readOwnPacks(deps, hospital.id));
  });

  routes.put('/hospitals/:slug/quick-packs/:dx/:key', async (c) => {
    const { slug, dx, key } = c.req.param();
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    if (!isKey(key)) return c.json({ error: 'The key is 1, 2 or 3.' }, 400);
    const body = await parseBody(c, hospitalQuickPackSchema);
    if (body instanceof Response) return body;

    const [hospital] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, slug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);
    const [diagnosis] = await db.select().from(diagnoses).where(eq(diagnoses.code, dx));
    if (!diagnosis) return c.json({ error: `No diagnosis ${dx} in the catalog.` }, 400);

    const ids = [...new Set(body.medications.map((m) => m.drugId))];
    const known = await db
      .select({ id: drugs.id, genericName: drugs.genericName })
      .from(drugs)
      .where(inArray(drugs.id, ids));
    const nameOf = new Map(known.map((d) => [d.id, d.genericName]));
    const unknown = ids.find((id) => !nameOf.has(id));
    if (unknown) return c.json({ error: `No medicine ${unknown} in the catalog.` }, 400);
    const medications = body.medications.map((m) => ({ ...m, genericName: nameOf.get(m.drugId)! }));

    const slot = and(
      eq(hospitalQuickPacks.hospitalId, hospital.id),
      eq(hospitalQuickPacks.diagnosisCode, dx),
      eq(hospitalQuickPacks.shortcutKey, key),
    );
    const now = deps.now();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(hospitalQuickPacks).where(slot);
      const same =
        current &&
        current.recommendationReason === body.recommendationReason &&
        sameJson(current.medications, medications);
      if (same) return;
      await tx
        .insert(hospitalQuickPacks)
        .values({
          hospitalId: hospital.id,
          diagnosisCode: dx,
          shortcutKey: key,
          recommendationReason: body.recommendationReason,
          medications,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            hospitalQuickPacks.hospitalId,
            hospitalQuickPacks.diagnosisCode,
            hospitalQuickPacks.shortcutKey,
          ],
          set: { recommendationReason: body.recommendationReason, medications, updatedAt: now },
        });
      await tx.insert(auditEvents).values({
        kind: 'set_quick_pack',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: hospital.id,
        at: now,
        details: { diagnosisCode: dx, shortcutKey: key, action: 'set' },
      });
    });
    const pack = (await readOwnPacks(deps, hospital.id)).find(
      (p) => p.diagnosisCode === dx && p.shortcutKey === key,
    );
    return c.json(pack);
  });

  routes.delete('/hospitals/:slug/quick-packs/:dx/:key', async (c) => {
    const { slug, dx, key } = c.req.param();
    const auth = await guard(c, deps, (a) => a.session.role === 'platform_admin');
    if (auth instanceof Response) return auth;
    if (!isKey(key)) return c.json({ error: 'The key is 1, 2 or 3.' }, 400);
    const [hospital] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.slug, slug));
    if (!hospital) return c.json({ error: 'No such hospital.' }, 404);

    const removed = await db.transaction(async (tx) => {
      const gone = await tx
        .delete(hospitalQuickPacks)
        .where(
          and(
            eq(hospitalQuickPacks.hospitalId, hospital.id),
            eq(hospitalQuickPacks.diagnosisCode, dx),
            eq(hospitalQuickPacks.shortcutKey, key),
          ),
        )
        .returning({ key: hospitalQuickPacks.shortcutKey });
      if (gone.length === 0) return false;
      await tx.insert(auditEvents).values({
        kind: 'set_quick_pack',
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        hospitalId: hospital.id,
        at: deps.now(),
        details: { diagnosisCode: dx, shortcutKey: key, action: 'removed' },
      });
      return true;
    });
    if (!removed) return c.json({ error: 'This hospital has no pack in that slot.' }, 404);
    return c.body(null, 204);
  });

  return routes;
}

/** A hospital's own packs, in the catalog's shape. */
export async function readOwnPacks(
  { db }: Pick<Deps, 'db'>,
  hospitalId: string,
): Promise<QuickPack[]> {
  const rows = await db
    .select()
    .from(hospitalQuickPacks)
    .where(eq(hospitalQuickPacks.hospitalId, hospitalId))
    .orderBy(asc(hospitalQuickPacks.diagnosisCode), asc(hospitalQuickPacks.shortcutKey));
  return rows.map((p) => ({
    packId: hospitalPackId(p.diagnosisCode, p.shortcutKey),
    shortcutKey: p.shortcutKey,
    diagnosisCode: p.diagnosisCode,
    // The hospital chose it, so it ranks above any default.
    rankScore: 1,
    recommendationReason: p.recommendationReason,
    medications: p.medications,
  }));
}
