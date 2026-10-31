// Fuzzy search helpers — sub-50ms target. Patients and diagnoses are small
// lists, so a simple scored include-rank with diacritic-insensitive matching is
// plenty; medicines have their own index below.

import type { Brand, Drug } from '@swiftrx/shared';

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

interface Scored<T> {
  item: T;
  score: number;
  indexOf: number;
}

// Substring match with earlier index = higher score; prefix bonus.
function substringScore(
  haystack: string,
  needle: string,
): { score: number; indexOf: number } | null {
  if (!needle) return { score: 0, indexOf: 0 };
  const h = norm(haystack);
  const n = norm(needle);
  const i = h.indexOf(n);
  if (i < 0) return null;
  const prefixBonus = i === 0 ? 50 : 0;
  // Shorter strings = denser match = higher score
  const density = 1000 / (h.length + 1);
  return {
    score: 100 - i * 2 + prefixBonus + density,
    indexOf: i,
  };
}

export function fuzzySearch<T>(
  items: T[],
  needle: string,
  fields: (item: T) => string[],
  limit = 8,
): T[] {
  if (!needle.trim()) return [];
  const scored: Scored<T>[] = [];
  for (const item of items) {
    let best: { score: number; indexOf: number } | null = null;
    for (const f of fields(item)) {
      const s = substringScore(f, needle);
      if (s && (!best || s.score > best.score)) best = s;
    }
    if (best) scored.push({ item, ...best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

// --- Medicines -----------------------------------------------------------------
//  The Bangladesh list has about 21,700 brands, so medicine search works on an
//  index built once per catalog (names normalized up front) rather than on
//  fuzzySearch, which normalizes every field on every keystroke.

export interface MedicineIndex {
  brands: { brand: Brand; drug: Drug; name: string }[];
  drugs: { drug: Drug; name: string; cls: string }[];
}

export type MedicineHit =
  { kind: 'brand'; brand: Brand; drug: Drug } | { kind: 'generic'; drug: Drug };

export function buildMedicineIndex(catalog: { drugs: Drug[]; brands: Brand[] }): MedicineIndex {
  const byId = new Map(catalog.drugs.map((d) => [d.id, d]));
  return {
    brands: catalog.brands.flatMap((brand) => {
      const drug = byId.get(brand.drugId);
      return drug ? [{ brand, drug, name: norm(brand.name) }] : [];
    }),
    drugs: catalog.drugs.map((drug) => ({
      drug,
      name: norm(drug.genericName),
      cls: norm(drug.therapeuticClass),
    })),
  };
}

/**
 * Brands and generics matching `query`, best first: an exact name, then a
 * name that starts with it, then one that contains it. Doctors in Bangladesh
 * mostly write brands, so brands lead at equal rank, but a few generics are
 * always kept in the list (searching "napa" shows Napa's strengths and forms;
 * "paracetamol" shows the generic and its brands).
 */
export function searchMedicines(
  index: MedicineIndex,
  query: string,
  limit = 8,
  maxGenerics = 3,
): MedicineHit[] {
  const q = norm(query);
  if (!q) return [];
  const rank = (name: string) =>
    name === q ? 3 : name.startsWith(q) ? 2 : name.includes(q) ? 1 : 0;

  const brands: { hit: MedicineHit; score: number }[] = [];
  const drugIdsByName = new Set<string>();
  for (const b of index.brands) {
    const r = rank(b.name);
    if (r) brands.push({ hit: { kind: 'brand', brand: b.brand, drug: b.drug }, score: r * 10 + 1 });
  }
  const generics: { hit: MedicineHit; score: number }[] = [];
  for (const d of index.drugs) {
    const r = rank(d.name);
    if (r) {
      generics.push({ hit: { kind: 'generic', drug: d.drug }, score: r * 10 });
      drugIdsByName.add(d.drug.id);
    } else if (d.cls.includes(q)) {
      generics.push({ hit: { kind: 'generic', drug: d.drug }, score: 1 });
    }
  }
  // Searching a generic by name also brings up its brands.
  if (drugIdsByName.size) {
    for (const b of index.brands) {
      if (drugIdsByName.has(b.drug.id) && !rank(b.name)) {
        brands.push({ hit: { kind: 'brand', brand: b.brand, drug: b.drug }, score: 5 });
      }
    }
  }

  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  // Stable sorts: equal scores keep the catalog's order (brands A–Z by name).
  brands.sort(byScore);
  generics.sort(byScore);
  const keptGenerics = generics.slice(0, maxGenerics);
  return [...brands.slice(0, limit - keptGenerics.length), ...keptGenerics]
    .sort(byScore)
    .map((s) => s.hit);
}
