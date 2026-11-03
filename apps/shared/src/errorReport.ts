// =============================================================================
//  SwiftRx Shared — Reporting the apps' crashes
// =============================================================================
//  The portal and the admin panel call installErrorReporting() at start-up.
//  From then on an uncaught error, a rejected promise nobody handled, or a
//  render error caught by an ErrorBoundary is sent to POST /api/client-errors
//  (apps/api/src/clientErrors.ts), which scrubs and logs it like the server's
//  own errors. Only the error's name, message and stack and the page's path
//  are sent, never its query, the page's data or the session.
//
//  An API's refusal (ApiError: a 4xx or the network) is not a crash, so it
//  isn't reported. At most a few reports go per page load.
// =============================================================================

import { ApiError } from './http';

export type ReportingApp = 'portal' | 'admin';

let app: ReportingApp | null = null;
let sent = 0;
const MAX_PER_PAGE = 5;

/** Start reporting this app's crashes. */
export function installErrorReporting(name: ReportingApp): void {
  if (app) return;
  app = name;
  window.addEventListener('error', (e) => reportClientError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason));
}

/** Send one crash to the server, if reporting is on; never throws. */
export function reportClientError(error: unknown): void {
  if (!app || sent >= MAX_PER_PAGE || error instanceof ApiError) return;
  sent += 1;
  const e = error instanceof Error ? error : new Error(String(error));
  const body = {
    app,
    name: e.name.slice(0, 100),
    message: e.message.slice(0, 1000),
    ...(e.stack ? { stack: e.stack.slice(0, 8000) } : {}),
    path: window.location.pathname.slice(0, 300),
  };
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never be the next crash.
  }
}
