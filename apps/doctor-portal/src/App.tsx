import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession, type SessionState } from './useSession';
import { useTenant } from './tenantStore';
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
  const tenant = useTenant();
  const [stored, signOut, refreshSession] = useSession();

  if (stored.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">Loading…</div>
    );
  }

  if (tenant.status === 'unknown') {
    return (
      <Routes>
        <Route path="*" element={<TenantNotFound />} />
      </Routes>
    );
  }

  const hospital = tenant.hospital;
  // A session belongs to the hospital it signed in at. When the URL names a
  // different hospital (possible on a shared origin, e.g. dev `?hospital=`),
  // that hospital's portal treats the visitor as signed out.
  const session: SessionState =
    stored.status === 'signed-in' && !sessionBelongsTo(stored.session, hospital)
      ? { status: 'signed-out' }
      : stored;

  return (
    <Routes>
      <Route
        path="/"
        element={
          session.status === 'signed-in' ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage hospital={hospital} onSignedIn={refreshSession} />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          session.status === 'signed-in' ? (
            <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
              <DashboardPage hospital={hospital} user={session.user} />
            </PortalShell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/patients"
        element={
          session.status === 'signed-in' ? (
            <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
              <PatientsPage hospital={hospital} user={session.user} />
            </PortalShell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/prescriptions"
        element={
          session.status === 'signed-in' ? (
            <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
              <PrescriptionsPage hospital={hospital} user={session.user} />
            </PortalShell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/rx"
        element={
          session.status !== 'signed-in' ? (
            <Navigate to="/" replace />
          ) : canPrescribe(session.user, hospital) ? (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-ink-400 text-sm">
                  Loading Rx pad…
                </div>
              }
            >
              <RxPad user={session.user} hospital={hospital} onSignOut={signOut} />
            </Suspense>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/doctors"
        element={
          session.status === 'signed-in' && session.user.role === 'hospital_admin' ? (
            <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
              <DoctorsPage hospital={hospital} user={session.user} />
            </PortalShell>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/settings"
        element={
          session.status === 'signed-in' && session.user.role === 'hospital_admin' ? (
            <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
              <HospitalSettingsPage hospital={hospital} user={session.user} />
            </PortalShell>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
