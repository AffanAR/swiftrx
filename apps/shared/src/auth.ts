// =============================================================================
//  SwiftRx Shared — Auth Primitives
// =============================================================================
//  Pure functions, no React. Each app's `auth.ts` wires the result to its
//  localStorage key and role gates. Keeps login / logout / token encode-decode
//  consistent across admin, hospital, and rx apps.
// =============================================================================

import type { SessionPayload, User, UserRole } from './types';
import { MOCK_USERS, appendAudit, getUserById } from './mockDb';

export type LoginResult =
  | { ok: true; user: User; session: SessionPayload }
  | { ok: false; reason: 'no-hospital' | 'unknown-user' | 'wrong-password' | 'wrong-hospital' | 'disabled' | 'wrong-role' };

export interface LoginOpts {
  email: string;
  password: string;
  expectedRole: UserRole | 'any';
  /** Required when the user is a hospital-scoped role. */
  hospitalSlug?: string | null;
}

/**
 * Mock login. Validates the role + (for hospital-scoped users) that the user
 * belongs to the expected hospital. Replace with API call when ready.
 */
export function login(opts: LoginOpts): LoginResult {
  const email = opts.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: 'unknown-user' };

  const user = MOCK_USERS.find((u) => u.email.toLowerCase() === email);
  if (!user) return { ok: false, reason: 'unknown-user' };
  if (user.password !== opts.password) return { ok: false, reason: 'wrong-password' };
  if (user.status === 'disabled') return { ok: false, reason: 'disabled' };

  if (opts.expectedRole !== 'any' && user.role !== opts.expectedRole) {
    return { ok: false, reason: 'wrong-role' };
  }

  if ((user.role === 'hospital_admin' || user.role === 'doctor') && opts.hospitalSlug) {
    if (user.hospitalSlug !== opts.hospitalSlug) {
      return { ok: false, reason: 'wrong-hospital' };
    }
  }

  // Build the role-specific session payload.
  let session: SessionPayload;
  if (user.role === 'platform_admin') {
    session = { role: 'platform_admin', userId: user.id, issuedAt: Date.now(), email: user.email, name: user.name };
  } else {
    if (!user.hospitalSlug) return { ok: false, reason: 'unknown-user' };
    session = {
      role: user.role as 'hospital_admin' | 'doctor',
      userId: user.id,
      hospitalSlug: user.hospitalSlug,
      issuedAt: Date.now(),
      email: user.email,
      name: user.name,
      licenseNo: user.licenseNo,
    };
  }

  // Audit
  appendAudit({
    kind: 'login',
    userId: user.id,
    userEmail: user.email,
    at: new Date().toISOString(),
    hospitalSlug: user.hospitalSlug,
  });

  return { ok: true, user, session };
}

/** URL-safe base64 JSON encoding (no padding) — works in browser + node. */
export function encodeToken<T>(payload: T): string {
  const json = JSON.stringify(payload);
  // Works in both browser and node 16+
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeToken<T>(token: string): T | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Bridge payload import kept in the type-only path to avoid a circular dep.
import type { BridgeSession } from './types';

/** Helper for callers that want to encode a bridge session specifically. */
export function encodeBridgeToken(s: BridgeSession): string {
  return encodeToken(s);
}
export function decodeBridgeToken(t: string): BridgeSession | null {
  return decodeToken<BridgeSession>(t);
}

/** Tiny `loadSession`-style helpers. Apps plug these into their own storage key. */
export function readSessionFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    // Refresh the user from mock db so role changes take effect on next render.
    if ((parsed as any)?.userId) {
      const u = getUserById((parsed as any).userId);
      if (!u || u.status === 'disabled') return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSessionToStorage<T>(key: string, session: T) {
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearSessionFromStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// --- Bridge session (portal → Rx pad handoff) --------------------------------
// The hospital portal writes a BridgeSession to a single localStorage key
// when a doctor opens the Rx pad. The Rx pad reads the same key on boot
// and (when present) seeds the doctor + tenant context.

export const BRIDGE_KEY = 'swiftrx.session';

export function loadBridge(): BridgeSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRIDGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BridgeSession;
    if (
      typeof parsed.doctorId !== 'string' ||
      typeof parsed.hospitalSlug !== 'string' ||
      typeof parsed.doctorName !== 'string' ||
      typeof parsed.licenseNo !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBridge(s: BridgeSession) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(BRIDGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearBridge() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(BRIDGE_KEY); } catch { /* ignore */ }
}
