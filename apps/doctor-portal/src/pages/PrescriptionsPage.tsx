import { LiveDot, Card, cx, listSignedRxForHospital, type Hospital, type User } from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

export function PrescriptionsPage({ hospital }: Props) {
  const rx = listSignedRxForHospital(hospital.slug);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-4 animate-fadeIn">
      <header>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Prescriptions</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Signed Rx</h1>
        <p className="text-sm text-ink-400">
          {rx.length} prescription{rx.length === 1 ? '' : 's'} signed in {hospital.name}
        </p>
      </header>

      {rx.length === 0 ? (
        <Card>
          <div className="text-sm text-ink-400 italic text-center py-8">
            No prescriptions signed yet. Open the Rx Pad to write one.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rx.map((r, i) => (
            <div
              key={r.id}
              className="rx-card p-4 animate-fadeIn"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink-100">{r.patient.name}</span>
                    <span className="text-xs text-ink-500 font-mono">· {r.patient.age}{r.patient.sex} · {r.patient.weightKg}kg</span>
                    {r.patient.allergies.length > 0 && (
                      <span className="text-[10px] font-semibold text-rx-danger bg-rx-danger/15 border border-rx-danger/30 rounded px-1.5 py-0.5">
                        ⚠ {r.patient.allergies.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-ink-400">
                    <span className="font-mono text-ink-300">{r.diagnosis.code}</span> {r.diagnosis.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-ink-500 font-mono">{r.id}</div>
                  <div className="text-[11px] text-ink-400">
                    {new Date(r.signedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
                {r.medications.map((m, mi) => (
                  <li
                    key={mi}
                    className={cx(
                      'text-[12px] font-mono px-2 py-1 rounded border',
                      'bg-ink-900/40 border-ink-700 text-ink-200',
                    )}
                  >
                    <span className="font-semibold text-ink-100">{m.genericName}</span>
                    {m.brandName && <span className="text-ink-400"> ({m.brandName})</span>}
                    <span className="text-ink-400"> · {m.dosage.value}{m.dosage.unit} {m.frequency} × {m.durationDays}d</span>
                  </li>
                ))}
              </ul>
              {r.investigations.length > 0 && (
                <div className="mt-3 text-[11px] text-ink-400">
                  <span className="text-ink-500">Investigations:</span> {r.investigations.map((i) => i.code).join(', ')}
                </div>
              )}
              <div className="mt-3 text-[11px] text-ink-500 border-t border-ink-800 pt-2">
                Signed by <span className="text-ink-300">{r.doctorName}</span> · {r.doctorLicense}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
