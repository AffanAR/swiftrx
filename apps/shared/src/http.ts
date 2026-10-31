// =============================================================================
//  SwiftRx Shared — Calls to the API
// =============================================================================
//  Every request to apps/api goes through callApi(): JSON in and out, on the
//  app's own origin, so the session cookie goes along.
//
//  - The server takes the hospital from the host. Where the host names none
//    (plain localhost, where the portal is opened with `?hospital=`), this
//    adds the same `?hospital=` to the request, so the server reads the
//    portal's session there, not the admin panel's.
//  - A 401 means the session has ended (expired, signed out elsewhere, or
//    the account changed). Besides throwing, it tells onSessionEnded()'s
//    listeners, so each app can go back to its sign-in page wherever the
//    call was made.
// =============================================================================

import { resolveFromBrowser } from './tenant';

/** A failed request. `status` is the HTTP status, 0 when the server wasn't reached. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const sessionEndedListeners = new Set<() => void>();

/** Call `listener` whenever an API call finds the session gone. Returns the unsubscribe. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/** GET or POST `path` (under /api) and return its JSON body; throws ApiError. */
export async function callApi<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withSurface(`/api${path}`), {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach SwiftRx right now.");
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return data as T;
  if (res.status === 401) sessionEndedListeners.forEach((listener) => listener());
  const message = (data as { error?: unknown } | null)?.error;
  throw new ApiError(res.status, typeof message === 'string' ? message : `HTTP ${res.status}`);
}

// Read once, as the page loads (like useTenantSlug): links inside the app drop
// the query, and a call made before it's put back must still go to the same
// hospital. Outside a browser (the API imports this file) it names nothing.
const pageSurface = resolveFromBrowser();

/** `url` with the page's `?hospital=`, where the host itself names no hospital. */
export function withSurface(url: string): string {
  const here = pageSurface;
  if (here.source !== 'query' || !here.hospitalSlug) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${new URLSearchParams({ hospital: here.hospitalSlug })}`;
}
