import { useCallback, useEffect, useState } from 'react';
import { fetchSession, signOut as endSession, type AuthSession } from '@swiftrx/shared';

export type SessionState =
  { status: 'loading' } | { status: 'signed-out' } | ({ status: 'signed-in' } & AuthSession);

/**
 * The portal's session, as the server holds it. On mount it asks the API who
 * is signed in at this hospital (GET /api/auth/me), which checks the session
 * cookie, its expiry, the user and their role here. Returns the state,
 * `signOut`, and `signedIn`, which the login page calls with the session the
 * server just made, so the router sees it without another round trip.
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
