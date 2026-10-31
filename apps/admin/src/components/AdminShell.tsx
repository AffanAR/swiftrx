import { NavLink, useLocation } from 'react-router-dom';
import { LiveDot, ThemeToggle, cx } from '@swiftrx/shared';
import type { SessionPayload } from '@swiftrx/shared';

type AdminSession = Extract<SessionPayload, { role: 'platform_admin' }>;

export function AdminShell({
  children,
  session,
  onSignOut,
}: {
  children: React.ReactNode;
  session: AdminSession;
  onSignOut: () => void;
}) {
  const location = useLocation();
  const isLogin = location.pathname === '/login';
  return (
    <div className="h-full flex flex-col bg-ink-900 text-ink-100 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-grid opacity-40" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-radial-focus" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-rx-accent/40 to-transparent opacity-50 animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />
      {!isLogin && (
        <header className="relative h-12 border-b border-ink-700 bg-ink-800/80 backdrop-blur flex items-center px-4 gap-4">
          <Brand />
          <nav className="ml-2 flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx(
                    'px-3 py-1.5 rounded-md transition-colors',
                    isActive
                      ? 'bg-rx-accent/15 text-rx-accent border border-rx-accent/30'
                      : 'text-ink-300 hover:bg-ink-700/40 border border-transparent',
                  )
                }
                end={n.to === '/dashboard'}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-400">
            <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 bg-ink-800/70 border border-ink-700">
              <LiveDot color="bg-rx-accent" />
              <span>Platform</span>
            </span>
            <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md bg-ink-800/70 border border-ink-700">
              <span className="text-ink-500">{session.name}</span>
              <span className="text-ink-600">·</span>
              <span className="font-mono text-ink-400">{session.email}</span>
              <button
                onClick={onSignOut}
                className="ml-1 px-1.5 py-0.5 rounded text-rx-accent hover:bg-ink-700/60 transition-colors"
              >
                Sign out
              </button>
            </div>
            <ThemeToggle />
          </div>
        </header>
      )}
      <main className="relative flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/hospitals', label: 'Hospitals' },
  { to: '/audit', label: 'Audit log' },
  { to: '/settings', label: 'Settings' },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7 rounded-md bg-rx-accent/20 text-rx-accent flex items-center justify-center font-bold">
        A
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
      </div>
      <div className="font-semibold tracking-tight">SwiftRx</div>
      <div className="text-[10px] uppercase tracking-wider text-rx-accent bg-rx-accent/10 border border-rx-accent/30 rounded px-1.5 py-0.5">
        Admin
      </div>
    </div>
  );
}
