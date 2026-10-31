#!/usr/bin/env node
// =============================================================================
//  SwiftRx — Import the Bangladesh medicine list
// =============================================================================
//  Turns the "Assorted Medicine Dataset of Bangladesh" (Kaggle, scraped from
//  medex.com.bd) into the drug catalog the apps and the API seed load:
//
//    apps/shared/src/seed/drugs.json    one row per generic that has a brand
//    apps/shared/src/seed/brands.json   one row per brand product
//
//  Run it from the repo root after unzipping the dataset into data/bd-medicines
//  (git-ignored: the raw files aren't ours to publish):
//
//    node scripts/bd-medicines/import.mjs [data/bd-medicines]
//
//  What it keeps and drops:
//  - Generics: name and drug class. The dataset's monograph texts (indication,
//    dosage, interactions, …) are left out: they are MedEx's prose, and the
//    Rx pad can't check anything against free text anyway.
//  - Brands: name, generic, dosage form, strength, manufacturer and a price
//    label (the unit price, or the first pack's).
//  - Dose defaults and safety lists come only from reviewed.json next to this
//    file. Every other generic is imported with none and `safetyReviewed:
//    false`, and the Rx pad says so instead of showing an all-clear.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SOURCE = process.argv[2] ?? join(ROOT, 'data', 'bd-medicines');
const OUT = join(ROOT, 'apps', 'shared', 'src', 'seed');

const reviewed = JSON.parse(readFileSync(join(HERE, 'reviewed.json'), 'utf8')).drugs;

const genericRows = readCsv('generic.csv');
const medicineRows = readCsv('medicine.csv');

// --- Generics ----------------------------------------------------------------

const genericByName = new Map();
for (const g of genericRows) {
  const name = clean(g['generic name']);
  if (!name) continue;
  if (genericByName.has(name.toLowerCase())) {
    throw new Error(`generic.csv lists "${name}" twice.`);
  }
  genericByName.set(name.toLowerCase(), {
    id: `g${g['generic id']}`,
    genericName: name,
    therapeuticClass:
      clean(g['drug class']) ||
      clean(stripHtml(g['therapeutic class description'])) ||
      'Unclassified',
  });
}

// --- Brands ------------------------------------------------------------------

const brands = [];
const usedGenerics = new Set();
const skipped = { noGeneric: 0, unknownGeneric: 0 };
const brandIds = new Set();

for (const m of medicineRows) {
  const genericName = clean(m.generic);
  if (!genericName) {
    skipped.noGeneric++;
    continue;
  }
  const generic = genericByName.get(genericName.toLowerCase());
  if (!generic) {
    skipped.unknownGeneric++;
    continue;
  }
  const id = `b${m['brand id']}`;
  if (brandIds.has(id)) throw new Error(`medicine.csv lists brand id ${m['brand id']} twice.`);
  brandIds.add(id);
  usedGenerics.add(generic.id);

  const brand = {
    id,
    name: clean(m['brand name']),
    drugId: generic.id,
    form: clean(m['dosage form']),
    manufacturer: clean(m.manufacturer),
  };
  const strength = clean(m.strength);
  if (strength) brand.strength = strength;
  const price = priceLabel(m['package container']);
  if (price) brand.price = price;
  if (m.type === 'herbal') brand.herbal = true;
  brands.push(brand);
}

brands.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

// --- Drugs (generics with at least one brand) -----------------------------------

const drugs = [...genericByName.values()]
  .filter((g) => usedGenerics.has(g.id))
  .map((g) => {
    const r = reviewed[g.id];
    if (r && r.genericName !== g.genericName) {
      throw new Error(
        `reviewed.json has ${g.id} as "${r.genericName}", but the dataset calls it "${g.genericName}".`,
      );
    }
    return r
      ? {
          ...g,
          safetyReviewed: true,
          defaultDosage: r.defaultDosage,
          defaultFrequency: r.defaultFrequency,
          defaultDurationDays: r.defaultDurationDays,
          contraindications: r.contraindications,
          interactsWith: r.interactsWith,
        }
      : { ...g, safetyReviewed: false, contraindications: [], interactsWith: [] };
  })
  .sort((a, b) => a.genericName.localeCompare(b.genericName));

const missing = Object.keys(reviewed).filter((id) => !drugs.some((d) => d.id === id));
if (missing.length)
  throw new Error(`reviewed.json names generics with no brand: ${missing.join(', ')}`);

// One row per line keeps the files diffable without doubling their size.
const rows = (list) => '[\n' + list.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n';
writeFileSync(join(OUT, 'drugs.json'), rows(drugs), 'utf8');
writeFileSync(join(OUT, 'brands.json'), rows(brands), 'utf8');

console.log(
  `drugs.json: ${drugs.length} generics (${drugs.filter((d) => d.safetyReviewed).length} reviewed)\n` +
    `brands.json: ${brands.length} brands\n` +
    `skipped: ${skipped.noGeneric} brands with no generic, ${skipped.unknownGeneric} with a generic not in generic.csv`,
);

// --- helpers -----------------------------------------------------------------

function clean(s) {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function stripHtml(s) {
  return (s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

/** "Unit Price: ৳ 1.20,(510's pack: ৳ 612.00)," → "৳1.20 per unit"; "60 ml bottle: ৳ 35.00,…" → "৳35.00 per 60 ml bottle". */
function priceLabel(container) {
  const s = clean(container);
  const unit = /Unit Price:\s*৳\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (unit) return `৳${unit[1].replace(/,/g, '')} per unit`;
  const pack = /^\(?([^:(]+?):\s*৳\s*([\d,]+(?:\.\d+)?)/.exec(s);
  if (pack) return `৳${pack[2].replace(/,/g, '')} per ${pack[1].trim()}`;
  return undefined;
}

/** A small RFC 4180 reader: quoted fields may hold commas, quotes and newlines. */
function readCsv(file) {
  const raw = readFileSync(join(SOURCE, file), 'utf8');
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // drop a byte-order mark
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(field);
      field = '';
    } else if (c === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else field += c;
  }
  if (field || record.length) records.push([...record, field]);

  const [header, ...body] = records;
  return body
    .filter((r) => r.some((f) => f.trim()))
    .map((r, n) => {
      if (r.length !== header.length) {
        throw new Error(`${file} row ${n + 2} has ${r.length} fields, expected ${header.length}.`);
      }
      return Object.fromEntries(header.map((h, i) => [h, r[i]]));
    });
}
