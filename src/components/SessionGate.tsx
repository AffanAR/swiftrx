import React from 'react';
import { useSession } from '../session';
import { PORTAL_URL } from '../config';

/**
 * Gate that gates the whole Rx pad on a doctor-portal session.
 *  - `loading`     → tiny spinner
 *  - `signed-in`   → render `children`
 *  - `signed-out`  → friendly "Sign in via portal" screen with a link to the
 *                    login portal, plus a sign-in hint for local dev
 *                    (`?hospital=...` so the portal resolves the tenant).
 *
 * Kept intentionally minimal so it works with no Tailwind class lookups — the
 * gate doubles as a debug surface when opening the Rx app standalone.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const [session] = useSession();

  if (session.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-ink-900 text-ink-400 text-sm">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          Loading workspace…
        </span>
      </div>
    );
  }

  if (session.status === 'signed-out') {
    return <SignedOutScreen />;
  }

  return <>{children}</>;
}

function SignedOutScreen() {
  return (
    <div className="h-full grid lg:grid-cols-2 bg-ink-900">
      {/* Left: branding — mirrors the portal's left rail so the handoff feels seamless */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 border-r border-ink-700">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-rx-accent" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-lg font-semibold tracking-tight">SwiftRx</div>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold text-ink-100 leading-tight">
            Keyboard-first prescribing, secured per hospital.
          </h2>
          <p className="mt-4 text-ink-400 leading-relaxed">
            The Rx pad is part of your hospital's SwiftRx workspace. Sign in
            through the doctor portal to load your patients, presets, and
            signed-Rx history.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-ink-400">
            <Stat label="Drugs" value="1,500+" />
            <Stat label="ICD-10" value="200+" />
            <Stat label="Quick Packs" value="50+" />
          </div>
        </div>

        <div className="text-xs text-ink-500">© SwiftRx · HIPAA-aware · audit logs on every sign</div>
      </div>

      {/* Right: sign-in CTA */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-rx-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" />
              </svg>
            </div>
            <div className="font-semibold tracking-tight">SwiftRx</div>
          </div>

          <h1 className="text-2xl font-semibold text-ink-100">Sign in to continue</h1>
          <p className="mt-1 text-sm text-ink-400">
            You'll be sent to your hospital's secure doctor portal. After signing in,
            you'll come back here with your session loaded.
          </p>

          <a
            href={PORTAL_URL}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 font-medium bg-rx-accent text-ink-900 hover:bg-rx-accentDark hover:text-ink-50 transition"
          >
            Open doctor portal
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-900/30 text-ink-900/80">↗</span>
          </a>

          <div className="mt-6 text-xs text-ink-500 leading-relaxed">
            Don't have an account? Ask your hospital administrator to provision
            a tenant at <span className="font-mono text-ink-400">portal.swiftrx.com</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-800/70 border border-ink-700 shadow-card px-3 py-2 text-center">
      <div className="font-mono text-rx-accent">{value}</div>
      <div className="mt-0.5 text-ink-500">{label}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
