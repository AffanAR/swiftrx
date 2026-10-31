import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageBoundary, useHospital } from '@swiftrx/shared';
import { useSession, type SessionState } from './useSession';
import { useTenantSlug } from './tenantStore';
import { canPrescribe, sessionBelongsTo } from './auth';
import { LoginPage } from './pages/LoginPage';
import { PortalShell } from './components/PortalShell';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { DoctorsPage } from './pages/DoctorsPage';
import { HospitalSettingsPage } from './pages/HospitalSettingsPage';
import { TenantNotFound } from './pages/TenantNotFound';

// The Rx pad is its own chunk, loaded only when a doctor opens /rx.
const RxPad = lazy(() => import('./rx/RxPad'));

export default function App() {
  const slug = useTenantSlug();
  return slug ? <TenantPortal slug={slug} /> : <NoTenant />;
}

/**
 * The portal for one hospital. Fetching the hospital suspends; main.tsx shows
 * the loading and error states for it.
 */
function TenantPortal({ slug }: { slug: string }) {
  const hospital = useHospital(slug);
  const [stored, signOut, signedIn] = useSession(slug);

  if (!hospital) return <NoTenant />;

  if (stored.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">Loading…</div>
    );
  }

  // The server only answers with a session made at this hospital. Checked
  // here too, so a page never shows another hospital's signed-in state.
  const session: SessionState =
    stored.status === 'signed-in' && !sessionBelongsTo(stored.session, hospital)
      ? { status: 'signed-out' }
      : stored;

  if (session.status !== 'signed-in') {
    return (
      <Routes>
        <Route path="/" element={<LoginPage hospital={hospital} onSignedIn={signedIn} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const { user } = session;
  const isAdmin = user.role === 'hospital_admin';
  const prescriber = canPrescribe(session, hospital);
  const shell = (page: ReactNode) => (
    <PortalShell hospital={hospital} user={user} prescriber={prescriber} onSignOut={signOut}>
      {page}
    </PortalShell>
  );

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={shell(<DashboardPage hospital={hospital} user={user} />)} />
      <Route path="/patients" element={shell(<PatientsPage hospital={hospital} user={user} />)} />
      <Route
        path="/prescriptions"
        element={shell(<PrescriptionsPage hospital={hospital} user={user} />)}
      />
      <Route
        path="/rx"
        element={
          prescriber ? (
            // Covers the lazy chunk and the pad's data: one loading state, one error state.
            <PageBoundary loadingLabel="Loading Rx pad…">
              <RxPad user={user} hospital={hospital} onSignOut={signOut} />
            </PageBoundary>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/doctors"
        element={
          isAdmin ? (
            shell(<DoctorsPage hospital={hospital} user={user} />)
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/settings"
        element={
          isAdmin ? (
            shell(<HospitalSettingsPage hospital={hospital} user={user} />)
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function NoTenant() {
  return (
    <Routes>
      <Route path="*" element={<TenantNotFound />} />
    </Routes>
  );
}
