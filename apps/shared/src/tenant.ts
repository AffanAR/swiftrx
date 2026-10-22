// =============================================================================
//  SwiftRx Shared — Tenant Resolution
// =============================================================================
//  The platform has three surface areas:
//    1. SwiftRx Admin     →  admin.swiftrx.com       (root, or `admin` subdomain)
//    2. Hospital Portal   →  <slug>.swiftrx.com      (per-tenant doctor login)
//    3. Rx Pad            →  <slug>.swiftrx.com/rx   (per-tenant prescription pad)
//
//  In production a wildcard DNS record + reverse proxy routes by Host header.
//  In dev the same logic applies to <host>.localhost:5172 (the gateway). If
//  the host doesn't give us a tenant, we fall back to a `?hospital=` query
//  param so the portal can be opened from a parent domain without changing
//  DNS.
// =============================================================================

const ROOT_HOSTS = new Set(['swiftrx.com', 'www.swiftrx.com', 'localhost', '127.0.0.1']);

/** Normalize a free-form string into a tenant slug (lowercase, dash-separated). */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type Surface = 'admin' | 'hospital' | 'rx' | 'unknown';

export interface ResolvedTenant {
  surface: Surface;
  /** The host subdomain, e.g. "city-hospital" or "admin". */
  subdomain: string | null;
  /** The hospital slug for hospital/rx surfaces; null for admin/root. */
  hospitalSlug: string | null;
  /** Free-form hint for where this came from (useful for debug UI). */
  source: 'domain' | 'query' | 'path' | 'none';
}

/**
 * Decide which surface we're rendering and which hospital (if any) the URL
 * points at. Pure function — does not touch window if a `host` is passed in.
 */
export function resolveSurface(
  host: string,
  pathname: string,
  query: URLSearchParams,
): ResolvedTenant {
  // 1. Query override wins (handy for dev & sharing links).
  const qSlug = query.get('hospital');
  const qRole = query.get('as'); // "admin" | "rx" | undefined
  if (qSlug) {
    const slug = normalizeSlug(qSlug);
    // If ?as=admin, the user is testing the admin panel locally.
    if (qRole === 'admin' || slug === 'admin') {
      return { surface: 'admin', subdomain: 'admin', hospitalSlug: null, source: 'query' };
    }
    // If the path starts with /rx, the rx app is open against this slug.
    if (pathname.startsWith('/rx') || qRole === 'rx') {
      return { surface: 'rx', subdomain: slug, hospitalSlug: slug, source: 'query' };
    }
    return { surface: 'hospital', subdomain: slug, hospitalSlug: slug, source: 'query' };
  }

  // 2. Subdomain from host.
  const parts = host.toLowerCase().split('.');
  if (parts.length < 2) {
    // No subdomain — default to admin in dev, hospital in prod (handled by host).
    return { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };
  }

  // Treat `.localhost` as a dev root (Chrome/FF resolve *.localhost → 127.0.0.1).
  const root = parts.slice(-2).join('.');
  const lastIsTld = parts[parts.length - 1] === 'localhost' || parts[parts.length - 1] === 'local';
  const isLocalhost = lastIsTld || ROOT_HOSTS.has(root) || ROOT_HOSTS.has(host);

  if (isLocalhost) {
    let sub: string | null = null;
    if (lastIsTld) {
      sub = parts.length >= 2 && parts[0] !== 'www' ? parts[0] : null;
    } else if (parts.length >= 3) {
      sub = parts[0] !== 'www' ? parts[0] : null;
    }
    if (!sub) return { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };

    if (sub === 'admin')
      return { surface: 'admin', subdomain: 'admin', hospitalSlug: null, source: 'domain' };
    if (pathname.startsWith('/rx') || sub === 'rx') {
      return { surface: 'rx', subdomain: sub, hospitalSlug: sub, source: 'domain' };
    }
    return { surface: 'hospital', subdomain: sub, hospitalSlug: sub, source: 'domain' };
  }

  // 3. Production: <sub>.swiftrx.com
  if (ROOT_HOSTS.has(root) || host === 'swiftrx.com') {
    const sub = parts.length >= 3 ? parts[0] : null;
    if (!sub) return { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };
    if (sub === 'admin')
      return { surface: 'admin', subdomain: 'admin', hospitalSlug: null, source: 'domain' };
    if (sub === 'www')
      return { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };
    if (sub === 'rx')
      return { surface: 'rx', subdomain: 'rx', hospitalSlug: null, source: 'domain' };
    return { surface: 'hospital', subdomain: sub, hospitalSlug: sub, source: 'domain' };
  }

  return { surface: 'unknown', subdomain: null, hospitalSlug: null, source: 'none' };
}

/** Browser wrapper that pulls from `window.location`. */
export function resolveFromBrowser(): ResolvedTenant {
  if (typeof window === 'undefined') {
    return { surface: 'unknown', subdomain: null, hospitalSlug: null, source: 'none' };
  }
  return resolveSurface(
    window.location.hostname,
    window.location.pathname,
    new URLSearchParams(window.location.search),
  );
}
