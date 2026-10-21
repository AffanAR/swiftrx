import { useCallback, useEffect, useState } from 'react';
import {
  login,
  readSessionFromStorage,
  writeSessionToStorage,
  clearSessionFromStorage,
  type SessionPayload,
} from '@swiftrx/shared';

const STORAGE_KEY = 'swiftrx.admin.session';

export type AdminSessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Extract<SessionPayload, { role: 'platform_admin' }> };

export function useAdminSession(): [AdminSessionState, () => void, (email: string, password: string) => string | null] {
  const [state, setState] = useState<AdminSessionState>({ status: 'loading' });

  useEffect(() => {
    const s = readSessionFromStorage<SessionPayload>(STORAGE_KEY);
    if (s && s.role === 'platform_admin') {
      setState({ status: 'signed-in', session: s as Extract<SessionPayload, { role: 'platform_admin' }> });
    } else {
      setState({ status: 'signed-out' });
    }
  }, []);

  const signIn = useCallback(
    (email: string, password: string) => {
      const result = login({ email, password, expectedRole: 'platform_admin' });
      if (!result.ok) {
        return reasonToMessage(result.reason);
      }
      writeSessionToStorage(STORAGE_KEY, result.session);
      setState({ status: 'signed-in', session: result.session as Extract<SessionPayload, { role: 'platform_admin' }> });
      return null;
    },
    [],
  );

  const signOut = useCallback(() => {
    clearSessionFromStorage(STORAGE_KEY);
    setState({ status: 'signed-out' });
  }, []);

  return [state, signOut, signIn];
}

function reasonToMessage(r: 'no-hospital' | 'unknown-user' | 'wrong-password' | 'wrong-hospital' | 'disabled' | 'wrong-role'): string {
  switch (r) {
    case 'unknown-user': return 'No platform admin account found for that email.';
    case 'wrong-password': return 'Incorrect password.';
    case 'wrong-role': return 'This account is not a platform admin.';
    case 'disabled': return 'This account is disabled.';
    default: return 'Sign-in failed. Please try again.';
  }
}
