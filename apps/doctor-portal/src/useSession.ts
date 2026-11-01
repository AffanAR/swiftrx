import { useCallback, useEffect, useState } from 'react';
import {
  fetchSession,
  onSessionEnded,
  signOut as endSession,
  type AuthSession,
} from '@swiftrx/shared';

export type SessionState =
  | { status: 'loading' }
  /** `ended`: the session ran out or the server dropped it, rather than a sign-out. */
  | { status: 'signed-out'; ended?: boolean }
  | ({ status: 'signed-in' } & AuthSession);

export type SignedIn = Extract<SessionState, { status: 'signed-in' }>;

/**
 * The portal's session, as the server holds it. On mount it asks the API who
 * is signed in at this hospital (GET /api/auth/me), which checks the session
 * cookie, its expiry, the user and their role here. Returns the state,
 * `signOut`, and `signedIn`, which the login page calls with the session the
 * server just made, so the router sees it without another round trip.
 *
 * A session also ends without a sign-out: at its expiry time, or when any
 * API call answers 401. Then the state turns `signed-out` with `ended`, and
 * nothing else is cleared, so a doctor who signs straight back in finds the
 * Rx pad as they left it.
 */
export function useSession(
  hospitalSlug: string,
): [SessionState, () => Promise<void>, (auth: AuthSession) => void] {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    fetchSession(hospitalSlug).then(
      (auth) =>
        live && setState(auth ? { status: 'signed-in', ...auth } : { status: 'signed-out' }),
      // Can't reach the API: show the sign-in page, which says so if they try.
      () => live && setState({ status: 'signed-out' }),
    );
    return () => {
      live = false;
    };
  }, [hospitalSlug]);

  const expiresAt = state.status === 'signed-in' ? state.session.expiresAt : null;

  // When the session's time is up, ask the server (its clock decides), and
  // treat any 401 from a data call as the end of the session.
  useEffect(() => {
    if (expiresAt === null) return;
    const end = () => setState({ status: 'signed-out', ended: true });
    const recheck = () =>
      fetchSession(hospitalSlug).then(
        (auth) => (auth ? setState({ status: 'signed-in', ...auth }) : end()),
        () => {},
      );
    const timer = setTimeout(recheck, Math.min(Math.max(expiresAt - Date.now(), 0), 2 ** 31 - 1));
    const unsubscribe = onSessionEnded(end);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [expiresAt, hospitalSlug]);

  const signOut = useCallback(async () => {
    try {
      await endSession(hospitalSlug);
    } catch {
      // The page signs out anyway; the server's copy still expires on time.
    }
    setState({ status: 'signed-out' });
  }, [hospitalSlug]);

  const signedIn = useCallback((auth: AuthSession) => {
    setState({ status: 'signed-in', ...auth });
  }, []);

  return [state, signOut, signedIn];
}
