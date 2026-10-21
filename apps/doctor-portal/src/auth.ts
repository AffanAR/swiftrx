// =============================================================================
//  Hospital Portal — auth wiring
// =============================================================================
//  Thin wrapper over `@swiftrx/shared` that:
//    - persists the session under `swiftrx.portal.session` (this app only)
//    - mirrors a smaller "bridge" payload to `swiftrx.session` so the Rx Pad
//      can hydrate doctor identity without re-running login or having a
//      shared DB.
//    - encodes the bridge payload as a URL-safe token for the cross-origin
//      "Open Rx Pad" link.
// =============================================================================

import {
  login as sharedLogin,
  encodeToken as sharedEncodeToken,
  decodeToken as sharedDecodeToken,
  writeSessionToStorage,
  readSessionFromStorage,
  clearSessionFromStorage,
  getUserById,
  saveBridge as sharedSaveBridge,
  clearBridge as sharedClearBridge,
  type BridgeSession,
  type SessionPayload,
  type User,
} from '@swiftrx/shared';

// Re-export the bridge helpers from shared so existing portal code that
// imports them from this module keeps working.
export { loadBridge, saveBridge, clearBridge, BRIDGE_KEY } from '@swiftrx/shared';

const SESSION_KEY = 'swiftrx.portal.session';

export type LoginResult =
  | { ok: true; session: SessionPayload; user: User }
  | { ok: false; reason: 'no-hospital' | 'unknown-user' | 'wrong-password' | 'wrong-hospital' | 'wrong-role' | 'disabled' };

export function login(opts: { email: string; password: string; hospitalSlug: string }): LoginResult {
  if (!opts.hospitalSlug) return { ok: false, reason: 'no-hospital' };
  const r = sharedLogin({
    email: opts.email,
    password: opts.password,
    expectedRole: 'any', // could be 'doctor' or 'hospital_admin' — accept either
    hospitalSlug: opts.hospitalSlug,
  });
  if (!r.ok) return { ok: false, reason: r.reason as any };

  writeSessionToStorage(SESSION_KEY, r.session);

  // Only licensed doctors get an Rx pad hand-off. Anyone else clears any
  // bridge left behind on this browser so they can't open the pad as someone else.
  if (r.user.role !== 'doctor' || !r.user.licenseNo) {
    sharedClearBridge();
  } else {
    const bridge: BridgeSession = {
      doctorId: r.user.id,
      hospitalSlug: r.user.hospitalSlug!,
      doctorName: r.user.name,
      licenseNo: r.user.licenseNo,
      email: r.user.email,
      issuedAt: Date.now(),
    };
    sharedSaveBridge(bridge);
  }

  return { ok: true, session: r.session, user: r.user };
}

export function logout() {
  clearSessionFromStorage(SESSION_KEY);
  sharedClearBridge();
}

export function loadSession(): SessionPayload | null {
  return readSessionFromStorage<SessionPayload>(SESSION_KEY);
}

export function getUserFromSession(): User | null {
  const s = loadSession();
  if (!s) return null;
  return getUserById(s.userId) ?? null;
}

export function encodeBridgeToken(s: BridgeSession): string {
  return sharedEncodeToken(s);
}

export function decodeBridgeToken(t: string): BridgeSession | null {
  return sharedDecodeToken<BridgeSession>(t);
}
