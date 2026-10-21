// Re-export shared tenant utilities. The original portal tenant.ts defined
// `resolveTenantSlug` and `slugToHospitalName`; the shared module uses
// `resolveSurface` instead (which subsumes both). Re-map the legacy names
// so the rest of the app keeps importing them.
import { resolveFromBrowser, resolveSurface, normalizeSlug, type ResolvedTenant, type Surface } from '@swiftrx/shared';

export { resolveFromBrowser, resolveSurface, normalizeSlug };
export type { ResolvedTenant, Surface };

/** @deprecated prefer resolveSurface().hospitalSlug */
export function resolveTenantSlug(): string | null {
  return resolveFromBrowser().hospitalSlug;
}

/** @deprecated — convert a slug to a human-readable hospital name. */
export function slugToHospitalName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
