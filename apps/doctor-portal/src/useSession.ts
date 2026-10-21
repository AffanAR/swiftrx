import { useCallback, useEffect, useState } from 'react';
import { loadSession, logout } from './auth';
import {
  getUserById,
  getHospital,
  type SessionPayload,
  type User,
  type Hospital,
} from '@swiftrx/shared';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: SessionPayload; user: User; hospital: Hospital };

/**
 * Read the stored session, refresh the user from the shared mock db so role /
 * status changes take effect, and validate the tenant is still alive. Clears
 * the stored session when it is no longer valid.
 */
function readSession(): SessionState {
  const s = loadSession();
  if (!s) return { status: 'signed-out' };
  const user = getUserById(s.userId);
  if (!user || user.status === 'disabled') {
    logout();
    return { status: 'signed-out' };
  }
  let hospital: Hospital | null = null;
  if (s.role !== 'platform_admin') {
    hospital = getHospital(s.hospitalSlug);
    if (!hospital || hospital.status === 'suspended') {
      logout();
      return { status: 'signed-out' };
    }
  }
  return { status: 'signed-in', session: s, user, hospital: hospital! };
}

/**
 * Session hook. Reads localStorage on mount and exposes sign-out plus
 * `refresh`, which the login page calls after writing a new session so the
 * router sees the signed-in state without a page reload.
 */
export function useSession(): [SessionState, () => void, () => void] {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    setState(readSession());
  }, []);

  const signOut = useCallback(() => {
    logout();
    setState({ status: 'signed-out' });
  }, []);

  const refresh = useCallback(() => {
    setState(readSession());
  }, []);

  return [state, signOut, refresh];
}
