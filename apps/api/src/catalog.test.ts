import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Catalog } from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { demoSeedData, seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';

const CITY = 'http://city-hospital.swiftrx.com';

let database: Database;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await freshDatabase();
  await seed(database.db);
  app = createApp({ db: database.db, rootDomain: 'swiftrx.com' });
}, SLOW);

afterAll(() => database.close());

async function signIn() {
  const res = await app.request(`${CITY}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: CITY },
    body: JSON.stringify({ email: 'ayesha@city-hospital.com', password: 'demo1234' }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie()[0].split(';')[0];
}

describe('GET /api/catalog', () => {
  it('needs a session', async () => {
    expect((await app.request(`${CITY}/api/catalog`)).status).toBe(401);
  });

  it(
    'answers the seeded catalog exactly as the seed JSON has it',
    async () => {
      const res = await app.request(`${CITY}/api/catalog`, { headers: { cookie: await signIn() } });
      expect(res.status).toBe(200);
      const catalog = (await res.json()) as Catalog;

      const seedData = demoSeedData();
      const byId = <T extends { id: string }>(list: T[]) =>
        [...list].sort((a, b) => a.id.localeCompare(b.id));
      expect(byId(catalog.drugs)).toEqual(byId(seedData.drugs));
      expect(byId(catalog.brands)).toEqual(byId(seedData.brands));
      expect(catalog.diagnoses).toEqual(
        [...seedData.diagnoses].sort((a, b) => a.code.localeCompare(b.code)),
      );
      expect(new Set(catalog.quickPacks.map((p) => p.packId))).toEqual(
        new Set(seedData.quickPacks.map((p) => p.packId)),
      );
      // The Bangladesh list, not a sample.
      expect(catalog.brands.length).toBeGreaterThan(20_000);
      expect(catalog.brands).toContainEqual(
        expect.objectContaining({ name: 'Napa', strength: '500 mg', form: 'Tablet' }),
      );
    },
    SLOW,
  );

  it('compresses the answer for clients that accept it', async () => {
    const res = await app.request(`${CITY}/api/catalog`, {
      headers: { cookie: await signIn(), 'accept-encoding': 'gzip' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });
});
