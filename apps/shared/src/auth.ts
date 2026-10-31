// =============================================================================
//  SwiftRx Shared — Sign-in
// =============================================================================
//  Sign-in, sign-out and "who is signed in", through the API's /api/auth
//  routes on the app's own origin. The server checks the password and keeps
//  the session; the browser only holds the session's httpOnly cookie, which
//  no script can read. So nothing in the apps sees a password hash or a
//  session token, and nothing is kept in localStorage.
//
//  The server takes the hospital from the host. Where the host names none
//  (plain localhost, where the portal is opened with `?hospital=`), it reads
//  `?hospital=` on the request, so the portal always names its hospital; on a
//  hospital's own subdomain the host wins anyway, as in resolveSurface().
// =============================================================================

import type { AuthSession, DemoAccount, SignInRefusal } from './types';

/** Why a sign-in failed: the server's reason, or 'unavailable' when it couldn't be asked. */
export type SignInFailure = SignInRefusal | 'unavailable';

export type SignInResult =
  | { ok: true; auth: AuthSession }
  | { ok: false; reason: SignInFailure; retryAfterSeconds?: number };

/** Sign in at this host, or at `hospitalSlug` on a host that names no hospital. */
export async function signIn(
  email: string,
  password: string,
  hospitalSlug?: string | null,
): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch(authUrl('login', hospitalSlug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, auth: body as AuthSession };

  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason !== 'string' || !REFUSALS.has(reason))
    return { ok: false, reason: 'unavailable' };
  const retryAfter = Number(res.headers.get('Retry-After'));
  return {
    ok: false,
    reason: reason as SignInRefusal,
    ...(retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

/**
 * The session this browser holds here, or null when it holds none (or one
 * the server no longer accepts). Throws when the server can't be reached.
 */
export async function fetchSession(hospitalSlug?: string | null): Promise<AuthSession | null> {
  const res = await fetch(authUrl('me', hospitalSlug), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /api/auth/me answered ${res.status}.`);
  return (await res.json()) as AuthSession | null;
}

/** End this browser's session here. The server clears the cookie. */
export async function signOut(hospitalSlug?: string | null): Promise<void> {
  const res = await fetch(authUrl('logout', hospitalSlug), { method: 'POST' });
  if (!res.ok) throw new Error(`POST /api/auth/logout answered ${res.status}.`);
}

/**
 * The demo accounts for this sign-in page, which the server only lists in
 * demo mode, so their passwords never ship in a bundle. Empty outside demo
 * mode, and when the server can't be reached.
 */
export async function fetchDemoAccounts(hospitalSlug?: string | null): Promise<DemoAccount[]> {
  try {
    const res = await fetch(authUrl('demo-accounts', hospitalSlug), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    return ((await res.json()) as { accounts: DemoAccount[] }).accounts;
  } catch {
    return [];
  }
}

/** What to tell the person signing in. */
export function signInErrorMessage(failure: {
  reason: SignInFailure;
  retryAfterSeconds?: number;
}): string {
  switch (failure.reason) {
    case 'invalid-credentials':
      return 'Incorrect email or password.';
    case 'rate-limited': {
      const minutes = Math.max(1, Math.ceil((failure.retryAfterSeconds ?? 60) / 60));
      return `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    case 'no-hospital':
      return 'There is no SwiftRx sign-in at this address.';
    case 'disabled':
      return 'This account is disabled.';
    case 'invited':
      return "This account hasn't been activated yet. Use the link in your invitation.";
    case 'wrong-role':
      return 'This account is not a platform admin.';
    case 'wrong-hospital':
      return "This account isn't registered with this hospital.";
    case 'hospital-suspended':
      return 'This hospital is suspended. Contact SwiftRx support.';
    case 'unavailable':
      return "Can't reach SwiftRx right now. Check your connection and try again.";
  }
}

const REFUSALS: ReadonlySet<string> = new Set<SignInRefusal>([
  'invalid-credentials',
  'rate-limited',
  'no-hospital',
  'disabled',
  'invited',
  'wrong-role',
  'wrong-hospital',
  'hospital-suspended',
]);

function authUrl(route: string, hospitalSlug?: string | null): string {
  const query = hospitalSlug ? `?${new URLSearchParams({ hospital: hospitalSlug })}` : '';
  return `/api/auth/${route}${query}`;
}
