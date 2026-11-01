import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  HospitalBadge,
  MIN_PASSWORD_LENGTH,
  Spinner,
  TextField,
  fetchPasswordLink,
  setPassword,
  type HospitalProfile,
  type PasswordLinkInfo,
} from '@swiftrx/shared';

type Status =
  | { step: 'checking' }
  | { step: 'invalid' }
  | { step: 'form'; link: PasswordLinkInfo }
  | { step: 'done'; link: PasswordLinkInfo };

/**
 * Where an invitation or a password-reset link lands: /set-password#<token>.
 * Works signed in or out; setting the password ends every session the user
 * had, and they sign in again with the new one.
 */
export function SetPasswordPage({ hospital }: { hospital: HospitalProfile }) {
  const [token] = React.useState(() => window.location.hash.slice(1));
  const [status, setStatus] = React.useState<Status>({ step: 'checking' });
  const [password, setPasswordValue] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    (token ? fetchPasswordLink(token) : Promise.resolve(null)).then(
      (link) => live && setStatus(link ? { step: 'form', link } : { step: 'invalid' }),
      () => live && setStatus({ step: 'invalid' }),
    );
    return () => {
      live = false;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status.step !== 'form') return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setPassword(token, password);
      // The token is spent; keep it out of the address bar and history.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setStatus({ step: 'done', link: status.link });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fadeIn">
        <div className="mb-8">
          <HospitalBadge hospital={hospital} />
        </div>

        {status.step === 'checking' && (
          <div className="text-sm text-ink-400 flex items-center gap-2">
            <Spinner /> Checking the link…
          </div>
        )}

        {status.step === 'invalid' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-100">This link doesn't work</h1>
            <p className="mt-2 text-sm text-ink-400">
              It has expired, was already used, or belongs to another hospital. Ask your hospital's
              admin for a new one.
            </p>
            <Link to="/" className="mt-6 inline-block text-sm text-rx-accent">
              Go to sign-in
            </Link>
          </>
        )}

        {status.step === 'form' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-100">
              {status.link.purpose === 'invite' ? 'Welcome to SwiftRx' : 'Choose a new password'}
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              {status.link.name} · <span className="font-mono">{status.link.email}</span>
            </p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <TextField
                label="New password"
                type="password"
                value={password}
                onChange={setPasswordValue}
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short sentence works well.`}
                autoFocus
                required
              />
              <TextField
                label="The same again"
                type="password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                required
              />
              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-rx-danger/40 bg-rx-danger/10 px-3 py-2 text-sm text-rx-danger"
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !password || !confirm}
                className="rx-btn-primary w-full justify-center"
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  'Set password'
                )}
              </button>
            </form>
          </>
        )}

        {status.step === 'done' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-100">Password set</h1>
            <p className="mt-2 text-sm text-ink-400">
              Sign in as <span className="font-mono">{status.link.email}</span> with your new
              password.
            </p>
            <Link to="/" className="mt-6 rx-btn-primary inline-flex">
              Sign in to {hospital.name}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
