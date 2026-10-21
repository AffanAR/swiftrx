// Shared identity bridge between the doctor-portal login app and the Rx pad.
//
// The portal (`apps/doctor-portal/src/auth.ts`) writes a `BridgeSession` to
// localStorage under `swiftrx.session` after a successful login, and also
// encodes it as a URL token when redirecting the user into the Rx app via
// "Open Rx Pad". This module lets the Rx app read either source, persist it,
// surface it through a React hook, and clear it on sign-out.
//
// In dev the two apps live on different ports (:5174 portal, :5173 Rx), so
// localStorage is NOT shared. The portal therefore passes the session via
// the `?session=<token>` query param on the redirect, and the Rx app writes
// it into its own localStorage on first paint before re-rendering.
//
// In prod, when both apps are deployed on the same registrable domain
// (e.g. portal.swiftrx.com + city-hospital.swiftrx.com), the `?session=`
// handoff still works; localStorage is keyed by origin so we can't share it
// directly across subdomains without a backend-issued cookie.

import { useEffect, useState, useCallback } from 'react';
import {
  decodeBridgeToken as sharedDecodeToken,
  getUserById,
  type BridgeSession as SharedBridge,
} from '@swiftrx/shared';

export const BRIDGE_KEY = 'swiftrx.session';

// Re-export the shared type under the local name so the rest of the app
// keeps importing it from './session'.
export type BridgeSession = SharedBridge;

export function loadBridge(): BridgeSession | null {
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
  try { localStorage.setItem(BRIDGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function clearBridge() {
  try { localStorage.removeItem(BRIDGE_KEY); } catch { /* ignore */ }
}

export function loadSession(): BridgeSession | null {
  return loadBridge();
}

export function saveSession(s: BridgeSession) { saveBridge(s); }
export function clearSession() { clearBridge(); }

export function consumeTokenFromUrl(): BridgeSession | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('session');
    if (!token) return null;
    const decoded = sharedDecodeToken(token);
    if (!decoded) return null;
    saveBridge(decoded);
    // Strip the query param so the address bar stays clean.
    params.delete('session');
    const search = params.toString();
    const newUrl = window.location.pathname + (search ? '?' + search : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    return decoded;
  } catch {
    return null;
  }
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; reason?: string }
  | { status: 'signed-in'; session: BridgeSession };

/**
 * Why this session can't prescribe, or null if it can. Only active doctors with
 * a license, at the hospital the session names, may use the pad. The token is
 * unsigned, so the identity must also match the user record. (A mock-level
 * check — real enforcement belongs on the server.)
 */
function prescriberProblem(s: BridgeSession): string | null {
  const user = getUserById(s.doctorId);
  if (!user || user.status !== 'active') return 'This account is not active.';
  if (user.role !== 'doctor' || !user.licenseNo) {
    return 'Only doctors with a registered license number can use the Rx pad.';
  }
  if (user.hospitalSlug !== s.hospitalSlug) return "This account doesn't belong to that hospital.";
  if (user.licenseNo !== s.licenseNo || user.name !== s.doctorName) {
    return "Your session doesn't match your doctor record. Please sign in again.";
  }
  return null;
}

// Why the session was rejected on this page load. Kept outside React state so
// a re-run of the mount effect (StrictMode runs it twice in dev), which finds
// the bridge already cleared, still shows the reason.
let rejectedReason: string | null = null;

/**
 * Hook that returns the current bridge session. On first mount it also
 * consumes the `?session=<token>` query param if present.
 */
export function useSession(): [SessionState, () => void] {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    consumeTokenFromUrl();
    const s = loadBridge();
    if (!s) {
      setState({ status: 'signed-out', reason: rejectedReason ?? undefined });
      return;
    }
    const problem = prescriberProblem(s);
    if (problem) {
      rejectedReason = problem;
      clearBridge();
      setState({ status: 'signed-out', reason: problem });
      return;
    }
    setState({ status: 'signed-in', session: s });
  }, []);

  const signOut = useCallback(() => {
    clearBridge();
    setState({ status: 'signed-out' });
  }, []);

  return [state, signOut];
}
