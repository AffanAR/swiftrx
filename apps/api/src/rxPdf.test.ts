import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MOCK_SIGNED_RX } from '@swiftrx/shared/seedData';
import { DEFAULT_RX_DESIGN, type Hospital, type SignedRx } from '@swiftrx/shared/types';

import { createApp } from './app';
import type { Database } from './db/client';
import { seed } from './db/seed';
import { SLOW, freshDatabase } from './db/testDatabase';
import { renderRxPdf } from './rxPdf';

const CITY = 'http://city-hospital.swiftrx.com';
const NORTHSTAR = 'http://northstar-medical.swiftrx.com';
const ADMIN = 'http://admin.swiftrx.com';
const PDF_PATH = '/hospitals/city-hospital/prescriptions/rx_seed_001/pdf';

const seeded = MOCK_SIGNED_RX.find((r) => r.id === 'rx_seed_001')!;

describe('renderRxPdf', () => {
  it('draws a signed Rx on the design’s paper, named for the patient and diagnosis', async () => {
    const bytes = await renderRxPdf(
      seeded,
      { ...DEFAULT_RX_DESIGN, pageSize: 'A5' },
      {
        demo: false,
      },
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(420); // 148 mm
    expect(Math.round(height)).toBe(595); // 210 mm
    expect(pdf.getTitle()).toBe(`Prescription ${seeded.id}`);
    expect(pdf.getAuthor()).toBe(seeded.doctorName);
  });

  it('is the same file every time for the same Rx', async () => {
    const a = await renderRxPdf(seeded, DEFAULT_RX_DESIGN, { demo: false });
    const b = await renderRxPdf(seeded, DEFAULT_RX_DESIGN, { demo: false });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('carries on over more pages, and draws text the fonts lack as "?"', async () => {
    const long: SignedRx = {
      ...seeded,
      patient: { ...seeded.patient, name: 'রহিমা Begum', allergies: ['Penicillin'] },
      medications: Array.from({ length: 40 }, (_, i) => ({
        ...seeded.medications[0],
        rowId: `r${i}`,
        instructions: `After food, with water — ${'a-very-long-unbroken-word'.repeat(4)} ${i}`,
      })),
    };
    const pdf = await PDFDocument.load(
      await renderRxPdf(
        long,
        { ...DEFAULT_RX_DESIGN, watermark: 'hospital', landscape: true },
        {
          demo: true,
        },
      ),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it('falls back to the default accent for a color that isn’t one', async () => {
    await expect(
      renderRxPdf(seeded, { ...DEFAULT_RX_DESIGN, accentColor: 'red; evil' }, { demo: false }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('GET /api/hospitals/:slug/prescriptions/:id/pdf', () => {
  let database: Database;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await freshDatabase();
    await seed(database.db);
    app = createApp({ db: database.db, rootDomain: 'swiftrx.com' });
  }, SLOW);

  afterAll(() => database.close());

  async function signIn(origin: string, email: string, password = 'demo1234') {
    const res = await app.request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    return res.headers.getSetCookie()[0].split(';')[0];
  }

  const get = (origin: string, path: string, cookie?: string) =>
    app.request(`${origin}/api${path}`, { headers: cookie ? { cookie } : {} });

  it("downloads a hospital's signed Rx for its users", async () => {
    const res = await get(CITY, PDF_PATH, await signIn(CITY, 'ayesha@city-hospital.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="rx_seed_001.pdf"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const pdf = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(pdf.getTitle()).toBe('Prescription rx_seed_001');
  });

  it('refuses anyone else, and an Rx of another hospital', async () => {
    expect((await get(CITY, PDF_PATH)).status).toBe(401);
    const sana = await signIn(NORTHSTAR, 'sana@northstar-medical.com');
    expect((await get(NORTHSTAR, PDF_PATH, sana)).status).toBe(403);
    // Northstar's own Rx isn't reachable through City Hospital's path.
    const ayesha = await signIn(CITY, 'ayesha@city-hospital.com');
    expect(
      (await get(CITY, '/hospitals/city-hospital/prescriptions/rx_seed_003/pdf', ayesha)).status,
    ).toBe(404);
    expect(
      (await get(CITY, '/hospitals/city-hospital/prescriptions/rx_nothing/pdf', ayesha)).status,
    ).toBe(404);
  });

  it("is refused to the hospital's users when PDF export is switched off", async () => {
    const admin = await signIn(ADMIN, 'admin@swiftrx.com', 'admin1234');
    const city = (await (await get(ADMIN, '/hospitals/city-hospital', admin)).json()) as Hospital;
    const off = await app.request(`${ADMIN}/api/hospitals/city-hospital`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ADMIN, cookie: admin },
      body: JSON.stringify({
        features: { ...city.features, allowPdfExport: false },
        rxDesign: city.rxDesign,
      }),
    });
    expect(off.status).toBe(200);

    const res = await get(CITY, PDF_PATH, await signIn(CITY, 'ayesha@city-hospital.com'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'PDF export is switched off for this hospital.' });
    // The SwiftRx team can still read it.
    expect((await get(ADMIN, PDF_PATH, admin)).status).toBe(200);
  });
});
