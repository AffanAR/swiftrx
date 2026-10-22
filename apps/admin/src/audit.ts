// Display helpers for audit events, shared by the dashboard, hospital detail
// and audit log pages.

import type { AuditEvent } from '@swiftrx/shared';

/** Accent color for an audit event kind. */
export function auditColor(kind: AuditEvent['kind']): string {
  if (kind === 'sign_rx') return '#10b981';
  if (kind === 'login') return '#3b82f6';
  if (kind === 'create_patient') return '#f59e0b';
  if (kind === 'create_hospital') return '#8b5cf6';
  return '#5e6781';
}

/** One-line description of an audit event. */
export function auditTitle(e: AuditEvent): string {
  switch (e.kind) {
    case 'login': return `${e.userEmail} signed in`;
    case 'sign_rx': return `${e.userEmail} signed Rx ${e.rxId} for ${e.patientName}`;
    case 'create_patient': return `${e.userEmail} created patient ${e.patientName}`;
    case 'create_hospital': return `Provisioned hospital ${e.hospitalName}`;
    case 'invite_user': return `Invited ${e.invitedEmail}`;
  }
}
