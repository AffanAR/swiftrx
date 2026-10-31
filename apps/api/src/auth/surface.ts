// =============================================================================
//  SwiftRx API — Where a request was made
// =============================================================================
//  The server decides which sign-in a request belongs to from its Host
//  header, by the rule the apps use (resolveSurface in @swiftrx/shared):
//    admin.<root>, <root>, www.<root>   → the admin panel
//    <slug>.<root> (and /rx under it)   → that hospital's portal
//    plain localhost or an IP address   → the admin panel, unless the
//                                         request names `?hospital=<slug>`
//    any other host                     → nothing; sign-in is refused
//  `?hospital=` only counts where the host names no subdomain, as in the
//  apps, so on <slug>.<root> it can't point a request at another hospital.
//  The portal sends it on plain localhost, where it's opened the same way.
// =============================================================================

import { resolveSurface } from '@swiftrx/shared/tenant';

export type Surface = { kind: 'admin' } | { kind: 'hospital'; slug: string } | { kind: 'unknown' };

/** The surface a request URL (built by the server from the Host header) belongs to. */
export function surfaceOf(requestUrl: string, rootDomain: string): Surface {
  const url = new URL(requestUrl);
  const t = resolveSurface(url.hostname, url.pathname, url.searchParams, rootDomain);
  if (t.surface === 'admin') return { kind: 'admin' };
  if ((t.surface === 'hospital' || t.surface === 'rx') && t.hospitalSlug) {
    return { kind: 'hospital', slug: t.hospitalSlug };
  }
  return { kind: 'unknown' };
}
