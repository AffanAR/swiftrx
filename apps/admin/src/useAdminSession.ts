import { useCallback, useEffect, useState } from 'react';
import {
  fetchSession,
  signIn as startSession,
  signInErrorMessage,
  signOut as endSession,
  type SessionPayload,
} from '@swiftrx/shared';

type AdminSession = Extract<SessionPayload, { role: 'platform_admin' }>;

export type AdminSessionState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: AdminSession };

/**
 * The admin panel's session, as the server holds it (an httpOnly cookie for
 * this host; the server only accepts platform admins here). Returns the
 * state, `signOut`, and `signIn`, which resolves to an error message or null.
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
