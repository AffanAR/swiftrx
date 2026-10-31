import { useCallback, useEffect, useState } from 'react';
import {
  fetchSession,
  onSessionEnded,
  signIn as startSession,
  signInErrorMessage,
  signOut as endSession,
  type SessionPayload,
} from '@swiftrx/shared';

type AdminSession = Extract<SessionPayload, { role: 'platform_admin' }>;

export type AdminSessionState =
  | { status: 'loading' }
  /** `ended`: the session ran out or the server dropped it, rather than a sign-out. */
  | { status: 'signed-out'; ended?: boolean }
  | { status: 'signed-in'; session: AdminSession };

/**
 * The admin panel's session, as the server holds it (an httpOnly cookie for
 * this host; the server only accepts platform admins here). Returns the
 * state, `signOut`, and `signIn`, which resolves to an error message or null.
 * At the session's expiry time, or on any 401 from the API, it turns
 * `signed-out` with `ended`.
 */
export function useAdminSession(): [
  AdminSessionState,
  () => Promise<void>,
  (email: string, password: string) => Promise<string | null>,
] {
  const [state, setState] = useState<AdminSessionState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    fetchSession().then(
      (auth) => {
        if (!live) return;
        const session = auth?.session;
        setState(
          session?.role === 'platform_admin'
            ? { status: 'signed-in', session }
            : { status: 'signed-out' },
        );
      },
      // Can't reach the API: show the sign-in page, which says so if they try.
      () => live && setState({ status: 'signed-out' }),
    );
    return () => {
      live = false;
    };
  }, []);

  const expiresAt = state.status === 'signed-in' ? state.session.expiresAt : null;

  useEffect(() => {
    if (expiresAt === null) return;
    const end = () => setState({ status: 'signed-out', ended: true });
    const recheck = () =>
      fetchSession().then(
        (auth) =>
          auth?.session.role === 'platform_admin'
            ? setState({ status: 'signed-in', session: auth.session })
            : end(),
        () => {},
      );
    const timer = setTimeout(recheck, Math.min(Math.max(expiresAt - Date.now(), 0), 2 ** 31 - 1));
    const unsubscribe = onSessionEnded(end);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [expiresAt]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await startSession(email, password);
    if (!result.ok) return signInErrorMessage(result);
    const { session } = result.auth;
    // The server only signs platform admins in here; this keeps the type honest.
    if (session.role !== 'platform_admin') return signInErrorMessage({ reason: 'wrong-role' });
    setState({ status: 'signed-in', session });
    return null;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await endSession();
    } catch {
      // The page signs out anyway; the server's copy still expires on time.
    }
    setState({ status: 'signed-out' });
  }, []);

  return [state, signOut, signIn];
}
