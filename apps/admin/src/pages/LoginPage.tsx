import * as React from 'react';
import { DemoAccounts, TextField, LiveDot, Spinner, ThemeToggle } from '@swiftrx/shared';

export function LoginPage({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
}) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // The server checks the password and sets the cookie.
    const err = await onSignIn(email, password);
    setBusy(false);
    if (err) setError(err);
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
              <path d="M12 2l9 4-9 4-9-4 9-4z" strokeLinejoin="round" />
              <path d="M3 10l9 4 9-4" strokeLinejoin="round" />
              <path d="M3 16l9 4 9-4" strokeLinejoin="round" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rx-accent animate-breathe" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">SwiftRx</div>
            <div className="text-[10px] uppercase tracking-wider text-rx-accent">
              Platform Console
            </div>
          </div>
        </div>

        <div className="max-w-md animate-fadeIn" style={{ animationDelay: '120ms' }}>
          <h2 className="text-3xl font-semibold text-ink-100 leading-tight">
            The control room for every hospital running SwiftRx.
          </h2>
          <p className="mt-4 text-ink-400 leading-relaxed">
            Provision tenants, monitor usage, audit prescription activity, and manage doctors across
            the entire network — from a single console.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-xs text-ink-400">
            <Stat label="Tenants" value="3" delay={220} />
            <Stat label="Active doctors" value="3" delay={300} />
            <Stat label="Rx this month" value="1,690" delay={380} />
            <Stat label="Audit events" value="9" delay={460} />
          </div>
        </div>

        <div
          className="text-xs text-ink-500 flex items-center gap-1.5 animate-fadeIn"
          style={{ animationDelay: '420ms' }}
        >
          <LiveDot color="bg-rx-accent" />
          <span>© SwiftRx · Platform admin · audit logged</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <h1
            className="text-2xl font-semibold text-ink-100 animate-fadeIn"
            style={{ animationDelay: '60ms' }}
          >
            Platform admin sign-in
          </h1>
          <p
            className="mt-1 text-sm text-ink-400 animate-fadeIn"
            style={{ animationDelay: '120ms' }}
          >
            Authorized personnel only. All sign-ins are audited.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="animate-fadeIn" style={{ animationDelay: '180ms' }}>
              <TextField
                label="Admin email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="admin@swiftrx.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>
            <div className="animate-fadeIn" style={{ animationDelay: '240ms' }}>
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

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
                'Open console'
              )}
            </button>

            <DemoAccounts />
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
