import { Link } from 'react-router-dom';
import { useSuspenseQueries } from '@tanstack/react-query';
import { LiveDot, cx, queries } from '@swiftrx/shared';

export function HospitalsListPage() {
  const [{ data: hospitals }, { data: stats }] = useSuspenseQueries({
    queries: [queries.hospitals(), queries.hospitalStats()],
  });

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6 animate-fadeIn">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Hospitals</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">All tenants</h1>
          <p className="text-sm text-ink-400">
            Provision, suspend, or inspect any hospital on SwiftRx.
          </p>
        </div>
        <Link to="/hospitals/new" className="rx-shine rx-btn-primary">
          + New hospital
        </Link>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {hospitals.map((h, i) => {
          const {
            doctors,
            patients,
            prescriptions: rx,
          } = stats[h.slug] ?? {
            doctors: 0,
            patients: 0,
            prescriptions: 0,
          };
          return (
            <Link
              key={h.slug}
              to={`/hospitals/${h.slug}`}
              className="rx-card rx-hover-lift p-4 group animate-fadeIn block"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-400 font-mono">
                    {h.slug}
                  </div>
                  <div className="mt-0.5 text-base font-semibold text-ink-100 group-hover:text-rx-accent transition-colors">
                    {h.name}
                  </div>
                  <div className="text-[11px] text-ink-400">
                    {h.city}, {h.country} · <span className="capitalize">{h.plan}</span>
                  </div>
                </div>
                <StatusPill status={h.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Doctors" value={doctors} />
                <Metric label="Patients" value={patients} />
                <Metric label="Rx" value={rx} />
              </div>
              <div className="mt-3 text-[11px] text-ink-500 font-mono">
                Joined {new Date(h.createdAt).toLocaleDateString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'suspended' | 'trial' }) {
  const tone =
    status === 'active'
      ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/30'
      : status === 'trial'
        ? 'bg-rx-warn/15 text-rx-warn border-rx-warn/30'
        : 'bg-rx-danger/15 text-rx-danger border-rx-danger/30';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider border',
        tone,
      )}
    >
      {status === 'active' && <LiveDot color="bg-rx-accent" />}
      {status}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-800/60 border border-ink-700 rounded-md py-1.5">
      <div className="text-sm font-mono font-semibold text-rx-accent">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
    </div>
  );
}
