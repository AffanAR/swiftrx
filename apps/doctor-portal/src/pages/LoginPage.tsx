import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DemoAccounts,
  TextField,
  LiveDot,
  Spinner,
  ThemeToggle,
  HospitalBadge,
  signIn,
  signInErrorMessage,
  type AuthSession,
  type Hospital,
} from '@swiftrx/shared';

type Props = {
  hospital: Hospital;
  onSignedIn: (auth: AuthSession) => void;
  /** The last session ended on its own (expired or dropped by the server). */
  ended?: boolean;
};

export function LoginPage({ hospital, onSignedIn, ended = false }: Props) {
  const navigate = useNavigate();
  // Where they were going before sign-in (App's redirect leaves it), else the dashboard.
  const returnTo = (useLocation().state as { returnTo?: unknown } | null)?.returnTo;
  const next = typeof returnTo === 'string' && /^\/[a-z]/.test(returnTo) ? returnTo : '/dashboard';
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // The server checks the password and the hospital, and sets the cookie.
    const result = await signIn(email, password, hospital.slug);
    setBusy(false);
    if (!result.ok) {
      setError(signInErrorMessage(result));
      return;
    }
    onSignedIn(result.auth);
    navigate(next, { replace: true });
  };

  return (
    <div className="min-h-full grid lg:grid-cols-2 relative overflow-hidden">
      <ThemeToggle className="absolute top-3 right-3 z-10" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-grid opacity-40" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-radial-accent" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-rx-accent/40 to-transparent opacity-50 animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />

      <div className="hidden lg:flex relative flex-col justify-between p-12 border-r border-ink-700">
        <div className="flex items-center gap-3 animate-fadeIn">
          <div className="relative h-10 w-10 rounded-lg bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-rx-accent animate-float"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rx-accent animate-breathe" />
          </div>
          <div className="text-lg font-semibold tracking-tight">SwiftRx</div>
        </div>

        <div className="max-w-md animate-fadeIn" style={{ animationDelay: '120ms' }}>
          <h2 className="text-3xl font-semibold text-ink-100 leading-tight">
            Welcome to <span className="text-rx-accent">{hospital.name}</span>.
          </h2>
          <p className="mt-4 text-ink-400 leading-relaxed">
            This is your hospital's SwiftRx workspace. Sign in to access the prescription pad, your
            patient roster, and the {hospital.plan}-plan sign-and-print tools.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-ink-400">
            <Stat label="Drugs" value="1,500+" delay={220} />
            <Stat label="ICD-10" value="200+" delay={300} />
            <Stat label="Quick Packs" value="50+" delay={380} />
          </div>
        </div>

        <div
          className="text-xs text-ink-500 flex items-center gap-1.5 animate-fadeIn"
          style={{ animationDelay: '420ms' }}
        >
          <LiveDot color="bg-rx-accent" />
          <span>© SwiftRx · Tenant-isolated · audit on every sign</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <HospitalBadge hospital={hospital} />
          </div>

          <h1
            className="text-2xl font-semibold text-ink-100 animate-fadeIn"
            style={{ animationDelay: '60ms' }}
          >
            Sign in
          </h1>
          <p
            className="mt-1 text-sm text-ink-400 animate-fadeIn"
            style={{ animationDelay: '120ms' }}
          >
            Use your hospital-issued credentials.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="animate-fadeIn" style={{ animationDelay: '180ms' }}>
              <TextField
                label="Work email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder={`you@${hospital.slug}.com`}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
            <div className="animate-fadeIn" style={{ animationDelay: '240ms' }}>
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                rightAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="text-xs hover:text-ink-200 px-2 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                }
              />
            </div>

            {ended && !error && (
              <div
                role="status"
                className="rounded-md border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm text-ink-300"
              >
                Your session ended. Sign in again to carry on where you left off.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-rx-danger/40 bg-rx-danger/10 px-3 py-2 text-sm text-rx-danger animate-slideUpIn animate-pulseRing"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="rx-shine rx-btn-primary w-full justify-center animate-fadeIn disabled:animate-none"
              style={{ animationDelay: '300ms' }}
            >
              {busy ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                `Sign in to ${hospital.name}`
              )}
            </button>

            <DemoAccounts hospitalSlug={hospital.slug} />
          </form>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div
      className="rx-card rx-hover-lift px-3 py-2 animate-fadeIn"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="font-mono text-rx-accent text-base">{value}</div>
      <div className="mt-0.5 text-ink-500">{label}</div>
    </div>
  );
}
