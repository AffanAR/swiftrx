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
 * Session hook. Reads localStorage once, refreshes the user from the shared
 * mock db so role / status changes take effect on next render, and validates
 * the tenant is still alive. Exposes sign-out.
 */
export function useSession(): [SessionState, () => void] {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      setState({ status: 'signed-out' });
      return;
    }
    const user = getUserById(s.userId);
    if (!user || user.status === 'disabled') {
      logout();
      setState({ status: 'signed-out' });
      return;
    }
    let hospital: Hospital | null = null;
    if (s.role !== 'platform_admin') {
      hospital = getHospital(s.hospitalSlug);
      if (!hospital || hospital.status === 'suspended') {
        logout();
        setState({ status: 'signed-out' });
        return;
      }
    }
    setState({ status: 'signed-in', session: s, user, hospital: hospital! });
  }, []);

  const signOut = useCallback(() => {
    logout();
    setState({ status: 'signed-out' });
  }, []);

  return [state, signOut];
}
