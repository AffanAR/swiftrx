import { Link } from 'react-router-dom';
import {
  LiveDot,
  Card,
  HospitalBadge,
  RX_APP_URL,
  loadBridge,
  encodeBridgeToken,
  listPatientsForHospital,
  listSignedRxForHospital,
  type Hospital,
  type User,
} from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

/**
 * Two different shells in the same file:
 *   - Hospital admin: sees the full ops dashboard (KPIs, plan, recent activity).
 *   - Doctor: sees a minimal "write a prescription" surface — no admin
 *     internals like subscription, plan, usage, doctor roster, audit log.
 */
export function DashboardPage({ hospital, user }: Props) {
  if (user.role === 'doctor') return <DoctorDashboard hospital={hospital} user={user} />;
  return <AdminDashboard hospital={hospital} user={user} />;
}

// -----------------------------------------------------------------------------
//  Doctor dashboard — minimal, just the things a prescribing doctor needs.
// -----------------------------------------------------------------------------

function DoctorDashboard({ hospital, user }: Props) {
  const patients = listPatientsForHospital(hospital.slug);
  const rx = listSignedRxForHospital(hospital.slug).filter((r) => r.doctorId === user.id);

  const rxLink = (() => {
    const bridge = loadBridge();
    if (!bridge) return RX_APP_URL;
    const token = encodeBridgeToken(bridge);
    return `${RX_APP_URL}/?session=${encodeURIComponent(token)}`;
  })();

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-5 animate-fadeIn">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Ready to prescribe</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">
            Hello, {user.name.replace(/^Dr\.\s*/i, '')}
          </h1>
          <p className="text-sm text-ink-400">
            {user.specialty ?? ''} · {hospital.name}
          </p>
        </div>
        <HospitalBadge hospital={hospital} />
      </header>

      <a
        href={rxLink}
        target="_blank"
        rel="noopener noreferrer"
        className="rx-card rx-hover-lift p-6 transition-all hover:border-rx-accent/50 hover:shadow-glow animate-fadeIn block group"
        data-test="open-rx-pad"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-rx-accent uppercase tracking-wider flex items-center gap-1.5">
              <LiveDot color="bg-rx-accent" />
              <span>Open the Rx Pad</span>
            </div>
            <div className="mt-1 text-xl font-semibold text-ink-100 flex items-center gap-2">
              Start a new prescription
              <span className="text-sm text-ink-500 group-hover:translate-x-0.5 transition-transform">↗</span>
            </div>
            <p className="mt-2 text-sm text-ink-400 max-w-md">
              Keyboard-first prescribing. Search a drug, set the dose, and sign.
              Your session is already loaded.
            </p>
          </div>
          <div className="relative h-10 w-10 rounded-full bg-rx-accent/10 border border-rx-accent/30 flex items-center justify-center overflow-hidden shrink-0">
            <div
              className="absolute inset-0 rounded-full border-2 border-rx-accent/0 animate-spinSlowReverse"
              style={{ borderTopColor: 'rgba(16,185,129,0.6)' }}
            />
            <span className="relative text-rx-accent text-base font-bold">↗</span>
          </div>
        </div>
      </a>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card title="Your patients" subtitle={`${patients.length} in roster`} right={<Link to="/patients" className="text-xs text-rx-accent hover:underline">View all →</Link>}>
          {patients.length === 0 ? (
            <p className="text-sm text-ink-400 italic">No patients yet.</p>
          ) : (
            <ul className="space-y-2">
              {patients.slice(0, 5).map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-ink-800/60 border border-ink-700 rounded-md px-3 py-2 animate-fadeIn"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div>
                    <div className="text-sm font-medium text-ink-100">{p.name}</div>
                    <div className="text-[11px] text-ink-400 font-mono">
                      {p.age}{p.sex} · {p.weightKg}kg
                    </div>
                  </div>
                  {p.allergies.length > 0 && (
                    <span className="text-[10px] font-semibold text-rx-danger bg-rx-danger/15 border border-rx-danger/30 rounded px-1.5 py-0.5">
                      ⚠ {p.allergies[0]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your recent prescriptions" subtitle="Last signed by you" right={<Link to="/prescriptions" className="text-xs text-rx-accent hover:underline">View all →</Link>}>
          {rx.length === 0 ? (
            <p className="text-sm text-ink-400 italic">No prescriptions yet.</p>
          ) : (
            <ul className="space-y-2">
              {rx.slice(0, 5).map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between bg-ink-800/60 border border-ink-700 rounded-md px-3 py-2 animate-fadeIn"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div>
                    <div className="text-sm font-medium text-ink-100">{r.patient.name}</div>
                    <div className="text-[11px] text-ink-400 font-mono">
                      {r.diagnosis.code} · {r.medications.length} med{r.medications.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-500 font-mono">
                    {new Date(r.signedAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Hospital admin dashboard — full operations view.
// -----------------------------------------------------------------------------

function AdminDashboard({ hospital, user }: Props) {
  const patients = listPatientsForHospital(hospital.slug);
  const rx = listSignedRxForHospital(hospital.slug);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6 animate-fadeIn">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Welcome back</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Hello, {user.name}</h1>
          <p className="text-sm text-ink-400">Hospital admin · {hospital.name}</p>
        </div>
        <HospitalBadge hospital={hospital} />
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Hospital admins don't prescribe — only doctors sign in to the Rx pad. */}
        <Card title="Prescribing" subtitle="Doctors only">
          <p className="text-sm text-ink-400">
            Doctors open the Rx pad from their own dashboard. Admin accounts can't sign prescriptions.
          </p>
        </Card>

        <Card title="Patients" subtitle={`${patients.length} active`}>
          <Link to="/patients" className="text-sm text-rx-accent hover:underline">View roster →</Link>
        </Card>
        <Card title="Doctors" subtitle="Manage on-call staff">
          <Link to="/doctors" className="text-sm text-rx-accent hover:underline">Manage doctors →</Link>
        </Card>
        <Card title="Prescriptions" subtitle={`${rx.length} all-time`}>
          <Link to="/prescriptions" className="text-sm text-rx-accent hover:underline">View history →</Link>
        </Card>
        <Card title="Settings" subtitle="Subscription & features">
          <Link to="/settings" className="text-sm text-rx-accent hover:underline">Open settings →</Link>
        </Card>
      </div>
    </div>
  );
}
