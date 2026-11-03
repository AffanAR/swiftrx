import React from 'react';
import { useApp, actions } from '../store';
import { DiagnosisField } from './DiagnosisField';
import { MedicationSearch } from './MedicationSearch';
import { MedicationRow } from './MedicationRow';
import { AnimatedNumber, Kbd, LiveDot, TypingDots, cx, ageSexLabel } from '@swiftrx/shared';
import { printCurrent, signAndPrint } from '../print';

export function CenterColumn({
  diagnosisRef,
}: {
  diagnosisRef: React.RefObject<HTMLInputElement>;
}) {
  const medications = useApp((s) => s.medications);
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);
  const diagnosis = useApp((s) => s.diagnosis);
  const banner = useApp((s) => s.banner);
  const signing = useApp((s) => s.signing);
  const setBanner = actions.setBanner;

  // Auto-clear banner after a short delay.
  React.useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner, setBanner]);

  const handleSign = React.useCallback(() => {
    void signAndPrint();
  }, []);

  // Prints the unsigned pad, watermarked DRAFT (there is no pharmacy link yet).
  const handlePrintDraft = React.useCallback(() => {
    printCurrent();
  }, []);

  // Build a tiny "Rx completeness" gauge: 0 when only diagnosis, 1 with a med,
  // 2 with ≥2 meds. Visualises progress in the header.
  const completeness = diagnosis ? (medications.length === 0 ? 1 : 2) : 0;

  return (
    <main className="flex-1 min-w-0 overflow-y-auto px-5 py-4 rx-bg-radial-focus">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Banner */}
        {banner && (
          <div
            className={cx(
              'rounded-md px-3 py-2 text-sm border animate-slideUpIn shadow-lg',
              banner.kind === 'success' && 'bg-rx-accent/10 text-rx-accent border-rx-accent/30',
              banner.kind === 'info' && 'bg-ink-800 border-ink-700 text-ink-200',
              banner.kind === 'warn' && 'bg-rx-warn/10 text-rx-warn border-rx-warn/30',
              banner.kind === 'danger' && 'bg-rx-danger/10 text-rx-danger border-rx-danger/30',
            )}
          >
            {banner.text}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
              <span>Active Prescription</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rx-accent/10 text-rx-accent border border-rx-accent/30">
                live
              </span>
            </h2>
            <p className="text-xs text-ink-400">
              {patient.name} · {ageSexLabel(patient)} · {patient.weightKg}kg
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-ink-400">
            <Kbd>Tab</Kbd> next · <Kbd>⇧Tab</Kbd> prev · <Kbd>↵</Kbd> accept · <Kbd>⌘K</Kbd> patient
            · <Kbd>Esc</Kbd> clear
          </div>
        </div>

        {/* Progress strip — lights up as the prescription is filled in. */}
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <Step on={completeness >= 1} label="Diagnosis" code={diagnosis?.code} />
          <Connector on={completeness >= 2} />
          <Step on={completeness === 2} label="Medications" count={medications.length} />
          <Connector on={false} />
          <Step on={false} label="Sign" />
        </div>

        {/* Fields */}
        <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-3 space-y-3 transition-shadow hover:shadow-glow/0">
          <DiagnosisField diagnosisRef={diagnosisRef} />
          <MedicationSearch />
        </div>

        {/* Medications list */}
        <div className="space-y-2" data-rows>
          {medications.map((m, i) => (
            <div
              data-row
              key={m.rowId}
              className="animate-fadeIn"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <MedicationRow med={m} index={i} />
            </div>
          ))}
          {!medications.length && (
            <div className="rounded-lg border border-dashed border-ink-700 p-6 text-center text-sm text-ink-400 transition-colors hover:border-rx-accent/40 hover:text-ink-300">
              <div className="flex items-center justify-center gap-2">
                <TypingDots className="text-ink-500" />
                <span>Add a medication above, or pick a quick pack (Alt+1/2/3).</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-ink-900/95 backdrop-blur border-t border-ink-700 flex items-center gap-2">
          <button
            onClick={handleSign}
            disabled={signing}
            className="rx-shine px-4 py-2 rounded-md bg-rx-accent text-ink-900 font-semibold hover:bg-rx-accentDark hover:text-white transition-colors flex items-center gap-2 animate-pulseRing disabled:opacity-60"
            data-action="sign"
          >
            <span>{signing ? 'Signing…' : 'Sign & Print'}</span>
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-black/20">⌘S</span>
          </button>
          <button
            onClick={handlePrintDraft}
            className="px-3 py-2 rounded-md border border-ink-700 text-ink-200 hover:bg-ink-700/40 flex items-center gap-2 transition-colors hover:border-rx-focus/40"
            title="Print the unsigned pad, marked DRAFT"
          >
            <span>Print draft</span>
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-ink-800">⌘P</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={actions.clearAll}
            className="px-3 py-2 rounded-md border border-ink-700 text-ink-300 hover:bg-ink-700/40 flex items-center gap-2 transition-colors"
          >
            <span>Clear</span>
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-ink-800">Esc</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function Step({
  on,
  label,
  code,
  count,
}: {
  on: boolean;
  label: string;
  code?: string;
  count?: number;
}) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 border transition-colors duration-300',
        on
          ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/40'
          : 'bg-ink-800/60 text-ink-500 border-ink-700',
      )}
    >
      {on ? (
        <LiveDot color="bg-rx-accent" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-ink-600" aria-hidden />
      )}
      <span>{label}</span>
      {code && <span className="font-mono">{code}</span>}
      {typeof count === 'number' && (
        <span className="font-mono font-semibold">
          (<AnimatedNumber value={count} />)
        </span>
      )}
    </div>
  );
}

function Connector({ on }: { on: boolean }) {
  return (
    <div
      className={cx(
        'h-px flex-1 transition-colors duration-500',
        on ? 'bg-rx-accent/60' : 'bg-ink-700',
      )}
    />
  );
}
