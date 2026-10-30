import { Card, LiveDot, useAudit } from '@swiftrx/shared';
import { useState } from 'react';
import { auditColor, auditTitle } from '../audit';

export function AuditLogPage() {
  const audit = useAudit();
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<string>('all');

  const filtered = audit.filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      e.userEmail.toLowerCase().includes(f) ||
      (e.hospitalSlug ?? '').toLowerCase().includes(f) ||
      JSON.stringify(e).toLowerCase().includes(f)
    );
  });

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-4 animate-fadeIn">
      <div>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Audit log</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Every event, every tenant</h1>
        <p className="text-sm text-ink-400">
          Searchable stream of sign-ins, signed Rx, and admin actions.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by email, tenant, or patient…"
          className="rx-input max-w-md"
        />
        <select
          className="rx-input max-w-[200px]"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All events</option>
          <option value="login">Sign-in</option>
          <option value="sign_rx">Signed Rx</option>
          <option value="create_patient">Create patient</option>
          <option value="create_hospital">Create hospital</option>
          <option value="invite_user">Invite user</option>
        </select>
        <div className="ml-auto text-xs text-ink-400 font-mono">
          {filtered.length} of {audit.length}
        </div>
      </div>

      <Card>
        <ul className="divide-y divide-ink-800">
          {filtered.map((e, i) => (
            <li
              key={i}
              className="py-3 flex items-start gap-3 animate-fadeIn"
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <div
                className="mt-1 h-2 w-2 rounded-full shrink-0"
                style={{ background: auditColor(e.kind) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-100">{auditTitle(e)}</div>
                <div className="text-[11px] text-ink-500 font-mono">
                  {new Date(e.at).toLocaleString()} · {e.hospitalSlug ?? 'platform'}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-ink-400 border border-ink-700 rounded px-1.5 py-0.5">
                {e.kind.replace('_', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
