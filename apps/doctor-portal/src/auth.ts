// =============================================================================
//  Hospital Portal — auth wiring
// =============================================================================
//  Thin wrapper over `@swiftrx/shared` that persists the session under
//  `swiftrx.portal.session` (this app only). The Rx pad is a route inside the
//  portal (/rx), so it uses this same session — there is no separate hand-off.
// =============================================================================

import {
  login as sharedLogin,
  writeSessionToStorage,
  readSessionFromStorage,
  clearSessionFromStorage,
  getUserById,
  type Hospital,
  type SessionPayload,
  type User,
} from '@swiftrx/shared';

const SESSION_KEY = 'swiftrx.portal.session';

export type LoginResult =
  | { ok: true; session: SessionPayload; user: User }
  | {
      ok: false;
      reason:
        | 'no-hospital'
        | 'unknown-user'
        | 'wrong-password'
        | 'wrong-hospital'
        | 'wrong-role'
        | 'disabled';
    };

export function login(opts: {
  email: string;
  password: string;
  hospitalSlug: string;
}): LoginResult {
  if (!opts.hospitalSlug) return { ok: false, reason: 'no-hospital' };
  const r = sharedLogin({
    email: opts.email,
    password: opts.password,
    expectedRole: 'any', // could be 'doctor' or 'hospital_admin' — accept either
    hospitalSlug: opts.hospitalSlug,
  });
  if (!r.ok) return { ok: false, reason: r.reason as any };

  writeSessionToStorage(SESSION_KEY, r.session);
  return { ok: true, session: r.session, user: r.user };
}

export function logout() {
  clearSessionFromStorage(SESSION_KEY);
}

export function loadSession(): SessionPayload | null {
  return readSessionFromStorage<SessionPayload>(SESSION_KEY);
}

export function getUserFromSession(): User | null {
  const s = loadSession();
  if (!s) return null;
  return getUserById(s.userId) ?? null;
}

/**
 * Who may open the Rx pad: active doctors with a license number, at the
 * hospital this portal is serving. (Checked in the browser for the mock; the
 * backend must enforce it too.)
 */
export function canPrescribe(user: User, hospital: Hospital): boolean {
  return (
    user.role === 'doctor' &&
    user.status === 'active' &&
    !!user.licenseNo &&
    user.hospitalSlug === hospital.slug
  );
}
