import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './useSession';
import { useTenant } from './tenantStore';
import { LoginPage } from './pages/LoginPage';
import { PortalShell } from './components/PortalShell';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { DoctorsPage } from './pages/DoctorsPage';
import { HospitalSettingsPage } from './pages/HospitalSettingsPage';
import { TenantNotFound } from './pages/TenantNotFound';

export default function App() {
  const tenant = useTenant();
  const [session, signOut, refreshSession] = useSession();

  if (session.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">
        Loading…
      </div>
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

  return (
    <Routes>
      <Route
        path="/"
        element={
          session.status === 'signed-in'
            ? <Navigate to="/dashboard" replace />
            : <LoginPage hospital={hospital} onSignedIn={refreshSession} />
        }
      />
      <Route
        path="/dashboard"
        element={
          session.status === 'signed-in'
            ? (
              <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
                <DashboardPage hospital={hospital} user={session.user} />
              </PortalShell>
            )
            : <Navigate to="/" replace />
        }
      />
      <Route
        path="/patients"
        element={
          session.status === 'signed-in'
            ? (
              <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
                <PatientsPage hospital={hospital} user={session.user} />
              </PortalShell>
            )
            : <Navigate to="/" replace />
        }
      />
      <Route
        path="/prescriptions"
        element={
          session.status === 'signed-in'
            ? (
              <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
                <PrescriptionsPage hospital={hospital} user={session.user} />
              </PortalShell>
            )
            : <Navigate to="/" replace />
        }
      />
      <Route
        path="/doctors"
        element={
          session.status === 'signed-in' && session.user.role === 'hospital_admin'
            ? (
              <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
                <DoctorsPage hospital={hospital} user={session.user} />
              </PortalShell>
            )
            : <Navigate to="/dashboard" replace />
        }
      />
      <Route
        path="/settings"
        element={
          session.status === 'signed-in' && session.user.role === 'hospital_admin'
            ? (
              <PortalShell hospital={hospital} user={session.user} onSignOut={signOut}>
                <HospitalSettingsPage hospital={hospital} user={session.user} />
              </PortalShell>
            )
            : <Navigate to="/dashboard" replace />
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
