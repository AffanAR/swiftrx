// =============================================================================
//  SwiftRx API — Logs and error reports, without patient details
// =============================================================================
//  Render keeps what the server prints, and a log is easy to over-share, so:
//
//   - Every line is one JSON object: {time, level, event, …fields}, which
//     Render's log search (and any log stream it forwards to) can filter.
//   - A request line has the method, the route *pattern*
//     (/api/hospitals/:slug/patients/:id, never the ids), the hospital's
//     slug, the status, the time taken and a request id. Never a body, a
//     query string, a cookie or an address.
//   - An error is scrubbed through an allowlist (scrubError): its type, the
//     database's error code, constraint, table and column names, the stack's
//     frames, and its message with query parameters, emails, phone numbers
//     and long digit runs cut out. Drizzle's "Failed query" errors carry the
//     row's values (a patient's name, phone, allergies) after "params:",
//     and Postgres's `detail` repeats them ("Key (email)=(…)"), so neither
//     is ever kept.
//   - With SENTRY_DSN set, the same scrubbed report also goes to Sentry
//     (sentryReporter); nothing else is sent there.
//
//  The response to the client only ever says "Something went wrong." with
//  the request id, which finds the matching log line.
// =============================================================================

import { randomBytes } from 'node:crypto';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  event: string;
  [field: string]: unknown;
}

export type Logger = (line: LogLine) => void;

/** An error reduced to what is safe to keep. */
export interface ScrubbedError {
  type: string;
  message: string;
  /** Postgres's SQLSTATE, e.g. 23505 for a unique violation. */
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
  /** Stack frames ("at fn (file:line:col)"), innermost first, at most 20. */
  stack: string[];
  /** The error's cause, scrubbed the same way. */
  cause?: ScrubbedError;
}

/** Where scrubbed errors go besides the log (Sentry); `context` is safe fields only. */
export type ErrorSink = (error: ScrubbedError, context: Record<string, string>) => void;

/** One JSON line per call: errors to stderr, the rest to stdout. Quiet for info under tests. */
export const jsonLogger: Logger = (line) => {
  if (line.level === 'info' && process.env.VITEST) return;
  const out = JSON.stringify({ time: new Date().toISOString(), ...line });
  if (line.level === 'error') console.error(out);
  else console.log(out);
};

/** A random id per request, sent back as X-Request-Id and in a 500's body. */
export const newRequestId = () => randomBytes(8).toString('hex');

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Seven or more digits, allowing the separators phone numbers are written with.
const LONG_NUMBER = /\+?\d[\d\s().-]{5,}\d/g;
const QUOTED = /'(?:[^']|'')*'/g;

/** Free text with anything that could identify a person taken out. */
export function scrubText(text: string, max = 500): string {
  // Drizzle appends the query's values after "params:"; drop them all.
  const cut = text.search(/\bparams:/i);
  const head = cut >= 0 ? text.slice(0, cut) + 'params: [removed]' : text;
  return head
    .replace(EMAIL, '[email]')
    .replace(QUOTED, "'[value]'")
    .replace(LONG_NUMBER, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const IDENTIFIER = /^[A-Za-z0-9_.]{1,63}$/;
const pick = (v: unknown) => (typeof v === 'string' && IDENTIFIER.test(v) ? v : undefined);

/** `error` reduced to an allowlist of fields; see the header. */
export function scrubError(error: unknown, depth = 0): ScrubbedError {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: scrubText(String(error)), stack: [] };
  }
  const e = error as Error & Record<string, unknown>;
  const scrubbed: ScrubbedError = {
    type: pick(e.name) ?? 'Error',
    message: scrubText(e.message),
    stack: (e.stack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('at '))
      .slice(0, 20)
      .map((l) => scrubText(l, 300)),
  };
  const code = pick(e.code);
  if (code) scrubbed.code = code;
  for (const key of ['constraint', 'table', 'column'] as const) {
    const v = pick(e[key]);
    if (v) scrubbed[key] = v;
  }
  if (e.cause !== undefined && depth < 3) scrubbed.cause = scrubError(e.cause, depth + 1);
  return scrubbed;
}

// --- Sentry ---------------------------------------------------------------------

/**
 * Sends scrubbed errors to Sentry's envelope endpoint, with no SDK: the event
 * carries the error's type, scrubbed message and frames, and the safe context
 * (route, method, hospital slug, request id, where it came from). No user,
 * no request, no breadcrumbs. Fire and forget; a failure to send is logged
 * once and dropped. Returns null for a DSN that isn't one.
 */
export function sentryReporter(
  dsn: string,
  opts: { environment?: string; release?: string; log?: Logger; send?: typeof fetch } = {},
): ErrorSink | null {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }
  const key = parsed.username;
  const project = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!key || !/^\d+$/.test(project) || parsed.protocol !== 'https:') return null;
  const endpoint = `https://${parsed.host}/api/${project}/envelope/`;
  const send = opts.send ?? fetch;
  let warned = false;

  return (error, context) => {
    const eventId = randomBytes(16).toString('hex');
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      logger: 'swiftrx',
      ...(opts.environment ? { environment: opts.environment } : {}),
      ...(opts.release ? { release: opts.release } : {}),
      tags: context,
      exception: { values: chain(error).map(toSentryException).reverse() },
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');
    send(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=swiftrx/0.1`,
      },
      body,
    }).catch((failure: unknown) => {
      if (warned) return;
      warned = true;
      opts.log?.({ level: 'warn', event: 'sentry_unreachable', error: scrubError(failure) });
    });
  };
}

/** The error, then its causes. */
function chain(error: ScrubbedError): ScrubbedError[] {
  return error.cause ? [error, ...chain(error.cause)] : [error];
}

const FRAME = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

function toSentryException(e: ScrubbedError) {
  const frames = e.stack
    .map((line) => FRAME.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      function: m[1] ?? '?',
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
    }))
    // Sentry lists frames outermost first.
    .reverse();
  return {
    type: e.code ? `${e.type} ${e.code}` : e.type,
    value: e.message,
    ...(frames.length ? { stacktrace: { frames } } : {}),
  };
}
