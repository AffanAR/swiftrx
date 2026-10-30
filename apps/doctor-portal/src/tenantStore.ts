// Which hospital this portal is serving. The slug comes from the URL
// (resolveSurface in shared, which keeps the host ahead of `?hospital=`); App
// then fetches the hospital itself through the data client.
import { useState } from 'react';
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
