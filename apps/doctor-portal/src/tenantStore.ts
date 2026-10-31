// Which hospital this portal is serving. The slug comes from the URL
// (resolveSurface in shared, which keeps the host ahead of `?hospital=`); App
// then fetches the hospital itself through the data client.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveFromBrowser } from '@swiftrx/shared';

/** The hospital slug the URL names, or null if it names none. Read once per page load. */
export function useTenantSlug(): string | null {
  const [slug] = useState(() => {
    if (typeof window === 'undefined') return null;
    const t = resolveFromBrowser();
    return t.surface === 'hospital' || t.surface === 'rx' ? t.hospitalSlug : null;
  });
  return slug;
}

/**
 * Where the hospital came from `?hospital=` (a host that names none, such as
 * plain localhost), put it back on every URL the app navigates to. Links and
 * redirects inside the app drop the query, and a reload without it would
 * show "Hospital portal not found".
 */
export function useKeepTenantQuery(slug: string): void {
  const location = useLocation();
  const navigate = useNavigate();
  const [fromQuery] = useState(() => resolveFromBrowser().source === 'query');

  useEffect(() => {
    if (!fromQuery) return;
    const params = new URLSearchParams(location.search);
    if (params.get('hospital') === slug) return;
    params.set('hospital', slug);
    // Keep the router state too: the sign-in page reads where to return from it.
    navigate({ ...location, search: `?${params}` }, { replace: true, state: location.state });
  }, [fromQuery, slug, location, navigate]);
}
