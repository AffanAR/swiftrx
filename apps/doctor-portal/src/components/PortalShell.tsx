import { NavLink } from 'react-router-dom';
import { LiveDot, cx, type Hospital, type User } from '@swiftrx/shared';

export function PortalShell({
  children,
  hospital,
  user,
  onSignOut,
}: {
  children: React.ReactNode;
  hospital: Hospital;
  user: User;
  onSignOut: () => void;
}) {
  const isAdmin = user.role === 'hospital_admin';

  return (
    <div className="h-full flex flex-col bg-ink-900 text-ink-100 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-grid opacity-40" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-radial-accent" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-rx-accent/40 to-transparent opacity-50 animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />

      <header className="relative h-12 border-b border-ink-700 bg-ink-800/80 backdrop-blur flex items-center px-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-7 h-7 rounded-md bg-rx-accent/20 text-rx-accent flex items-center justify-center font-bold">
            R
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">{hospital.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 truncate">
              {hospital.city} · {isAdmin ? 'Hospital admin' : 'Doctor portal'}
            </div>
          </div>
        </div>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          {(isAdmin ? NAV_ADMIN : NAV_DOCTOR).map((n) => (
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
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 bg-ink-800/70 border border-ink-700">
            <LiveDot color="bg-rx-accent" />
            <span>Live</span>
          </span>
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-ink-800/70 border border-ink-700">
            <span className="text-ink-500">{user.name}</span>
            <span className="text-ink-600">·</span>
            <span className="font-mono text-ink-400">{user.email}</span>
            <button
              onClick={onSignOut}
              className="ml-1 px-1.5 py-0.5 rounded text-rx-accent hover:bg-ink-700/60 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
}

// Hospital admins see the full operations surface.
const NAV_ADMIN = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/patients', label: 'Patients' },
  { to: '/prescriptions', label: 'Prescriptions' },
  { to: '/doctors', label: 'Doctors' },
  { to: '/settings', label: 'Settings' },
];

// Doctors only see what's needed to write prescriptions. Everything else
// (subscription, doctor roster, usage, billing) is admin-only and lives
// on the admin panel or a hospital-admin sign-in.
const NAV_DOCTOR = [
  { to: '/dashboard', label: 'Today' },
  { to: '/patients', label: 'Patients' },
  { to: '/prescriptions', label: 'My Rx' },
];
