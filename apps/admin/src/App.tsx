import { Navigate, Route, Routes } from 'react-router-dom';
import { useAdminSession } from './useAdminSession';
import { AdminShell } from './components/AdminShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HospitalsListPage } from './pages/HospitalsListPage';
import { HospitalDetailPage } from './pages/HospitalDetailPage';
import { NewHospitalPage } from './pages/NewHospitalPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';
import { HospitalFeaturesPage } from './pages/HospitalFeaturesPage';

export default function App() {
  const [session, signOut, signIn] = useAdminSession();

  if (session.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">Loading…</div>
    );
  }

  if (session.status === 'signed-out') {
    return <LoginPage onSignIn={signIn} />;
  }

  return (
    <AdminShell session={session.session} onSignOut={signOut}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/hospitals" element={<HospitalsListPage />} />
        <Route path="/hospitals/new" element={<NewHospitalPage />} />
        <Route path="/hospitals/:slug" element={<HospitalDetailPage />} />
        <Route path="/hospitals/:slug/features" element={<HospitalFeaturesPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/settings" element={<PlatformSettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AdminShell>
  );
}
