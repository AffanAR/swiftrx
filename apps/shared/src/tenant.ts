// =============================================================================
//  SwiftRx Shared — Tenant Resolution
// =============================================================================
//  The platform has three surface areas (<root> is ROOT_DOMAIN, set by
//  VITE_ROOT_DOMAIN at build time, default swiftrx.com):
//    1. SwiftRx Admin     →  admin.<root>       (root, www, or `admin` subdomain)
//    2. Hospital Portal   →  <slug>.<root>      (per-tenant doctor login)
//    3. Rx Pad            →  <slug>.<root>/rx   (per-tenant prescription pad)
//
//  In production a wildcard DNS record + server routes by Host header
//  (scripts/serve.mjs, or deploy/nginx.swiftrx.com.conf). In dev the same
//  logic applies to <host>.localhost:5172 (the gateway). If the host doesn't
//  give us a tenant, we fall back to a `?hospital=` query param so the portal
//  can be opened from a parent domain without changing DNS.
// =============================================================================

import { DEV_GATEWAY_URL, ROOT_DOMAIN } from './config';

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
  rootDomain: string = ROOT_DOMAIN,
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
  const h = host.toLowerCase();
  const parts = h.split('.');
  const last = parts[parts.length - 1];
  let sub: string | null;
  if (parts.length < 2 || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    // Bare `localhost`, another single-label host, or an IP address (whose
    // first octet would otherwise be read as a hospital slug): no subdomain.
    sub = null;
  } else if (last === 'localhost' || last === 'local') {
    // Dev root (Chrome/FF resolve *.localhost → 127.0.0.1).
    sub = parts[0];
  } else if (h === rootDomain) {
    sub = null;
  } else if (h.endsWith('.' + rootDomain)) {
    sub = parts[0];
  } else {
    return { surface: 'unknown', subdomain: null, hospitalSlug: null, source: 'none' };
  }

  if (!sub || sub === 'www')
    return { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };
  if (sub === 'admin')
    return { surface: 'admin', subdomain: 'admin', hospitalSlug: null, source: 'domain' };
  if (pathname.startsWith('/rx') || sub === 'rx') {
    return { surface: 'rx', subdomain: sub, hospitalSlug: sub, source: 'domain' };
  }
  return { surface: 'hospital', subdomain: sub, hospitalSlug: sub, source: 'domain' };
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

/**
 * A hospital portal's address, for links from the admin panel. From
 * admin.<base> it's <slug>.<base> on the same scheme and port (dev gateway,
 * `npm start`, production); from the admin dev server on bare localhost it's
 * the dev gateway; otherwise <slug>.<root domain>.
 */
export function hospitalPortalUrl(slug: string): string {
  const here = typeof window !== 'undefined' ? window.location : null;
  const h = here?.hostname ?? '';
  if (here && h.startsWith('admin.')) {
    return `${here.protocol}//${slug}.${h.slice('admin.'.length)}${here.port ? `:${here.port}` : ''}`;
  }
  if (h === 'localhost' || h === '127.0.0.1') {
    const gateway = new URL(DEV_GATEWAY_URL);
    gateway.hostname = `${slug}.${gateway.hostname}`;
    return gateway.origin;
  }
  return `${here?.protocol ?? 'https:'}//${slug}.${ROOT_DOMAIN}`;
}
