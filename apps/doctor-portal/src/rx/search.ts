// Fuzzy search helpers — sub-50ms target. Small datasets, so a simple
// scored include-rank with diacritic-insensitive matching is plenty.

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

// Brand-to-generic substitution: find a drug whose brand name matches the query.
export interface BrandMatch {
  drugId: string;
  genericName: string;
  brandName: string;
}

export function findBrandMatches(
  query: string,
  drugs: { id: string; genericName: string; brandNames: string[] }[],
  limit = 5,
): BrandMatch[] {
  if (!query.trim()) return [];
  const out: BrandMatch[] = [];
  const q = norm(query);
  for (const d of drugs) {
    for (const b of d.brandNames) {
      const n = norm(b);
      if (n === q) {
        out.unshift({ drugId: d.id, genericName: d.genericName, brandName: b });
        break;
      } else if (n.includes(q) && out.length < limit) {
        out.push({ drugId: d.id, genericName: d.genericName, brandName: b });
        break;
      }
    }
    if (out.length >= limit + 2) break;
  }
  return out.slice(0, limit);
}
