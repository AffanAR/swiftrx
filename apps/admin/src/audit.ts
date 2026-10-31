// Display helpers for audit events, shared by the dashboard, hospital detail
// and audit log pages.

import type { AuditEvent } from '@swiftrx/shared';

/** Accent color for an audit event kind (theme tokens, so it suits both themes). */
export function auditColor(kind: AuditEvent['kind']): string {
  if (kind === 'sign_rx') return 'rgb(var(--rx-accent))';
  if (kind === 'login') return 'rgb(var(--rx-focus))';
  if (kind === 'create_patient') return 'rgb(var(--rx-warn))';
  if (kind === 'create_hospital') return '#8b5cf6';
  return 'rgb(var(--ink-500))';
}

/** One-line description of an audit event. */
export function auditTitle(e: AuditEvent): string {
  switch (e.kind) {
    case 'login':
      return `${e.userEmail} signed in`;
    case 'sign_rx':
      return `${e.userEmail} signed Rx ${e.rxId} for ${e.patientName}`;
    case 'create_patient':
      return `${e.userEmail} created patient ${e.patientName}`;
    case 'create_hospital':
      return `Provisioned hospital ${e.hospitalName}`;
    case 'invite_user':
      return `Invited ${e.invitedEmail}`;
  }
}
