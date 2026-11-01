// =============================================================================
//  Hospital Portal — who may do what
// =============================================================================
//  Sign-in itself is the server's (apps/shared/src/auth.ts calls /api/auth,
//  and useSession.ts holds the result). These are the portal's gates on what
//  the server answered. The server already refuses a session at any hospital
//  but its own; it will check the prescribing rule again when signing moves
//  to it (POST /prescriptions).
// =============================================================================

import type { AuthSession, Hospital, SessionPayload } from '@swiftrx/shared';

/**
 * Whether a session may be used on this hospital's portal: only the one it
 * signed in at. Platform admins sign in at the admin panel and have no
 * hospital, so a portal never takes their session.
 */
export function sessionBelongsTo(
  session: SessionPayload,
  hospital: Pick<Hospital, 'slug'>,
): boolean {
  return session.role !== 'platform_admin' && session.hospitalSlug === hospital.slug;
}

/**
 * Who may open the Rx pad (decision D3, ROADMAP.md §7): active users with a
 * license number who hold a doctor role at this hospital. A hospital admin
 * who also prescribes holds a second, doctor role there; the admin role
 * alone never prescribes.
 */
export function canPrescribe(
  auth: Pick<AuthSession, 'user' | 'memberships'>,
  hospital: Hospital,
): boolean {
  return (
    auth.user.status === 'active' &&
    !!auth.user.licenseNo?.trim() &&
    auth.memberships.some((m) => m.role === 'doctor' && m.hospitalSlug === hospital.slug)
  );
}
