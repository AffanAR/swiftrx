import { LiveDot, Card, cx, listDoctorsForHospital, type Hospital, type User } from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

export function DoctorsPage({ hospital, user }: Props) {
  const doctors = listDoctorsForHospital(hospital.slug);
  const isAdmin = user.role === 'hospital_admin';

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-4 animate-fadeIn">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Doctors</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">On-call roster</h1>
          <p className="text-sm text-ink-400">
            {doctors.length} doctor{doctors.length === 1 ? '' : 's'} registered to {hospital.name}
          </p>
        </div>
        {isAdmin && (
          <button className="rx-shine rx-btn-primary">+ Invite doctor</button>
        )}
      </header>

      {doctors.length === 0 ? (
        <Card>
          <div className="text-sm text-ink-400 italic text-center py-8">
            No doctors on staff yet.
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {doctors.map((d, i) => (
            <div
              key={d.id}
              className="rx-card rx-hover-lift p-4 animate-fadeIn"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center text-rx-accent font-bold">
                  {d.name.replace(/^Dr\.\s*/i, '').slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-100">{d.name}</div>
                  <div className="text-[11px] text-ink-400 font-mono">
                    {d.specialty} · {d.licenseNo}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-500">{d.email}</div>
                </div>
                <span className={cx('text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border', d.status === 'active' ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/30' : 'bg-ink-700 text-ink-300 border-ink-600')}>
                  {d.status}
                </span>
              </div>
              {d.lastLoginAt && (
                <div className="mt-3 text-[11px] text-ink-500 font-mono">
                  Last sign-in: {new Date(d.lastLoginAt).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
