// Re-export shared tenant resolution for the React hook. Each app owns the
// hook so it can live next to its React tree; the logic itself is in shared.
import { useEffect, useState } from 'react';
import { getHospital, type Hospital, type ResolvedTenant, resolveFromBrowser } from '@swiftrx/shared';

export type TenantInfo =
  | { status: 'resolved'; hospital: Hospital; source: ResolvedTenant['source'] }
  | { status: 'unknown' };

export function useTenant(): TenantInfo {
  const [info, setInfo] = useState<TenantInfo>(() => resolve());

  useEffect(() => {
    setInfo(resolve());
  }, []);

  return info;
}

function resolve(): TenantInfo {
  if (typeof window === 'undefined') return { status: 'unknown' };
  const t = resolveFromBrowser();
  if (t.surface !== 'hospital' && t.surface !== 'rx') {
    return { status: 'unknown' };
  }
  const h = getHospital(t.hospitalSlug);
  if (!h) return { status: 'unknown' };
  return { status: 'resolved', hospital: h, source: t.source };
}
