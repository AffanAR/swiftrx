import React from 'react';
import { useApp, previousRxForPatient } from '../store';
import { LiveDot, type SignedRx } from '@swiftrx/shared';

const MAX_SHOWN = 5;

/**
 * The selected patient's signed prescriptions, newest first, each with a
 * Repeat button. The newest one is also bound to Alt+R (in App).
 */
export function PreviousRx({ onRepeat }: { onRepeat: (rx: SignedRx) => void }) {
  // Select the raw fields and derive the list in a memo: a selector that
  // returns a fresh array would make useSyncExternalStore re-render forever.
  const signed = useApp((s) => s.signed);
  const patientId = useApp((s) => s.patientId);
  const patientName = useApp((s) => s.patients.find((p) => p.id === s.patientId)?.name ?? '');
  const history = React.useMemo(() => previousRxForPatient(signed, patientId), [signed, patientId]);

  return (
    <div className="mt-5" data-section="previous-rx">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
          <LiveDot color="bg-rx-focus" />
          <span>Previous Rx</span>
          {history.length > 0 && <span className="font-mono text-ink-500">({history.length})</span>}
        </div>
        <div className="text-[10px] text-ink-500">Alt+R repeats last</div>
      </div>

      {history.length === 0 ? (
        <div className="text-xs text-ink-400 bg-ink-800/50 border border-dashed border-ink-700 rounded-md p-3 animate-fadeIn">
          No previous prescriptions for {patientName}.
        </div>
      ) : (
        <ul className="space-y-2">
          {history.slice(0, MAX_SHOWN).map((rx, i) => (
            <li
              key={rx.id}
              className="rounded-md border border-ink-700 p-3 rx-hover-lift transition-colors hover:border-rx-focus/40 animate-fadeIn"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-400 flex items-center gap-1.5 min-w-0">
                    <span className="font-mono shrink-0">
                      {new Date(rx.signedAt).toLocaleDateString()}
                    </span>
                    <span className="text-ink-600">·</span>
                    <span className="truncate">{rx.doctorName}</span>
                  </div>
                  <div
                    className="text-sm font-semibold text-ink-100 truncate"
                    title={rx.diagnosis.name}
                  >
                    <span className="font-mono text-rx-focus mr-1.5">{rx.diagnosis.code}</span>
                    {rx.diagnosis.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRepeat(rx)}
                  className="shrink-0 px-2 py-0.5 rounded bg-rx-accent/15 text-rx-accent font-mono text-xs border border-rx-accent/30 hover:bg-rx-accent/25 transition-colors"
                  title="Copy this prescription onto the pad"
                >
                  {i === 0 ? 'Repeat · Alt+R' : 'Repeat'}
                </button>
              </div>

              <ul className="mt-2 space-y-0.5">
                {rx.medications.map((m) => (
                  <li
                    key={m.rowId}
                    className="text-[11px] font-mono text-ink-300 flex justify-between gap-2"
                  >
                    <span className="truncate">· {m.genericName}</span>
                    <span className="text-ink-400 shrink-0">
                      {m.dosage.value}
                      {m.dosage.unit} · {m.frequency} · {m.durationDays}d
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {history.length > MAX_SHOWN && (
            <li className="text-[11px] text-ink-500 px-1">
              +{history.length - MAX_SHOWN} older prescription
              {history.length - MAX_SHOWN === 1 ? '' : 's'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
