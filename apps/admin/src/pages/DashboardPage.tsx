import { Link } from 'react-router-dom';
import {
  MOCK_HOSPITALS,
  MOCK_USERS,
  MOCK_SIGNED_RX,
  MOCK_AUDIT,
  StatTile,
  LiveDot,
  Card,
  ProgressBar,
  cx,
} from '@swiftrx/shared';
import { auditColor, auditTitle } from '../audit';

export function DashboardPage() {
  const totalHospitals = MOCK_HOSPITALS.length;
  const totalDoctors = MOCK_USERS.filter((u) => u.role === 'doctor').length;
  const totalRxThisMonth =
    MOCK_SIGNED_RX.length + MOCK_HOSPITALS.reduce((s, h) => s + h.monthlyRxUsed, 0);
  const totalAudit = MOCK_AUDIT.length;

  const recentAudit = MOCK_AUDIT.slice(0, 8);
  const recentHospitals = [...MOCK_HOSPITALS].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Platform overview</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Network health</h1>
        </div>
        <div className="text-xs text-ink-500 font-mono">
          Generated {new Date().toLocaleString()}
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Tenants"
          value={totalHospitals}
          hint="Active across the network"
          trend={{ delta: 12.4, label: 'vs last mo' }}
        />
        <StatTile
          label="Active doctors"
          value={totalDoctors}
          hint="Signed in this week"
          trend={{ delta: 3.1, label: 'vs last mo' }}
        />
        <StatTile
          label="Rx this month"
          value={totalRxThisMonth}
          hint="Across all hospitals"
          tone="focus"
          trend={{ delta: 8.6, label: 'vs last mo' }}
        />
        <StatTile label="Audit events" value={totalAudit} hint="Last 30 days" tone="warn" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card
          title="Top hospitals by usage"
          subtitle="Monthly prescription count"
          className="lg:col-span-2"
        >
          <ul className="space-y-3">
            {recentHospitals
              .slice()
              .sort((a, b) => b.monthlyRxUsed - a.monthlyRxUsed)
              .map((h, i) => {
                const pct = h.monthlyRxCap > 0 ? h.monthlyRxUsed / h.monthlyRxCap : 0;
                const tone = pct > 0.85 ? 'danger' : pct > 0.6 ? 'warn' : 'accent';
                return (
                  <li
                    key={h.slug}
                    className="animate-fadeIn"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <Link to={`/hospitals/${h.slug}`} className="block group">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div>
                          <div className="text-sm font-medium text-ink-100 group-hover:text-rx-accent transition-colors">
                            {h.name}
                          </div>
                          <div className="text-[11px] text-ink-400 font-mono">
                            {h.city} · {h.plan}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono text-ink-100">
                            {h.monthlyRxUsed.toLocaleString()} / {h.monthlyRxCap.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-ink-500 uppercase tracking-wider">
                            {Math.round(pct * 100)}% of cap
                          </div>
                        </div>
                      </div>
                      <ProgressBar value={pct} tone={tone as any} />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </Card>

        <Card title="Recent activity" subtitle="Last events across tenants">
          <ul className="space-y-2">
            {recentAudit.map((e, i) => (
              <li
                key={i}
                className="text-sm border-l-2 pl-3 py-1 animate-fadeIn"
                style={{
                  animationDelay: `${i * 40}ms`,
                  borderColor: auditColor(e.kind),
                }}
              >
                <div className="text-ink-200">{auditTitle(e)}</div>
                <div className="text-[11px] text-ink-500 font-mono">
                  {new Date(e.at).toLocaleString()} · {e.hospitalSlug ?? 'platform'}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Hospitals" subtitle="All tenants on SwiftRx">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-400">
              <tr className="border-b border-ink-700">
                <th className="text-left py-2 px-2 font-medium">Hospital</th>
                <th className="text-left py-2 px-2 font-medium">Slug</th>
                <th className="text-left py-2 px-2 font-medium">Plan</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-right py-2 px-2 font-medium">Rx / cap</th>
                <th className="text-left py-2 px-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_HOSPITALS.map((h, i) => (
                <tr
                  key={h.slug}
                  className="border-b border-ink-800 hover:bg-ink-800/40 animate-fadeIn transition-colors"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <td className="py-2 px-2">
                    <Link
                      to={`/hospitals/${h.slug}`}
                      className="text-ink-100 hover:text-rx-accent transition-colors font-medium"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-ink-300">{h.slug}</td>
                  <td className="py-2 px-2 text-ink-300 capitalize">{h.plan}</td>
                  <td className="py-2 px-2">
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs">
                    <span className="text-ink-200">{h.monthlyRxUsed.toLocaleString()}</span>
                    <span className="text-ink-500"> / {h.monthlyRxCap.toLocaleString()}</span>
                  </td>
                  <td className="py-2 px-2 text-ink-400 text-xs font-mono">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: 'active' | 'suspended' | 'trial' }) {
  const tone =
    status === 'active'
      ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/30'
      : status === 'trial'
        ? 'bg-rx-warn/15 text-rx-warn border-rx-warn/30'
        : 'bg-rx-danger/15 text-rx-danger border-rx-danger/30';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider border',
        tone,
      )}
    >
      {status === 'active' && <LiveDot color="bg-rx-accent" />}
      {status}
    </span>
  );
}
