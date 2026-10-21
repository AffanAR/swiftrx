import React from 'react';
import { useApp, actions } from '../store';
import { loadSession } from '../session';
import { cx } from '../useHotkeys';
import { LiveDot, AnimatedNumber } from './Fx';

export function TopBar({ onSignOut }: { onSignOut: () => void }) {
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);
  const focusZone = useApp((s) => s.focusZone);
  const medCount = useApp((s) => s.medications.length);
  const diagnosis = useApp((s) => s.diagnosis);
  const setFocusZone = actions.setFocusZone;
  const session = loadSession();

  return (
    <header className="relative h-12 border-b border-ink-700 bg-ink-800/80 backdrop-blur flex items-center px-4 gap-4 select-none overflow-hidden">
      {/* A faint sweeping highlight along the bottom border so the bar feels
          "powered on". Pure decoration — kept at low opacity. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px
                   bg-gradient-to-r from-transparent via-rx-accent/50 to-transparent
                   opacity-60 animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />

      <div className="flex items-center gap-2">
        <div className="relative w-7 h-7 rounded-md bg-rx-accent/20 text-rx-accent flex items-center justify-center font-bold animate-float">
          Rx
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
        </div>
        <div className="font-semibold tracking-tight">SwiftRx</div>
        <div className="text-xs text-ink-400 ml-1 hidden md:block">keyboard-first prescription pad</div>
      </div>

      <div className="mx-3 h-6 w-px bg-ink-700" />

      {/* Patient snapshot — keyed so the name slides in when the patient changes. */}
      <div className="flex items-center gap-3 min-w-0" key={patient.id}>
        <div className="text-sm">
          <span className="font-medium animate-slideInRight inline-block">{patient.name}</span>
          <span className="text-ink-400 ml-2">
            {patient.age}{patient.sex} · {patient.weightKg}kg · {patient.contact}
          </span>
        </div>
      </div>

      {/* Allergy tag — pulse-ring + breathing icon when present. */}
      {patient.allergies.length > 0 && (
        <div
          className="ml-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-rx-danger/15 text-rx-danger border border-rx-danger/30 flex items-center gap-1.5 animate-pulseRing"
          title="Patient allergies"
        >
          <span className="animate-breathe inline-block">⚠️</span>
          <span>ALLERGIES:</span>
          <span className="font-bold">{patient.allergies.join(', ')}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
        {/* Active diagnosis badge — slides in when one is set. */}
        {diagnosis && (
          <span
            className="hidden lg:inline-flex items-center gap-1 rounded-md px-1.5 py-0.5
                       bg-rx-accent/10 text-rx-accent border border-rx-accent/30 animate-fadeIn"
            title="Active diagnosis"
          >
            <span className="font-mono font-semibold">{diagnosis.code}</span>
          </span>
        )}

        {/* Inline counter for meds on the pad. */}
        <span
          className="hidden md:inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5
                     bg-ink-800/70 border border-ink-700 animate-fadeIn"
          title="Medications on this prescription"
        >
          <LiveDot color={medCount > 0 ? 'bg-rx-accent' : 'bg-ink-600'} />
          <span className="font-mono text-ink-200 font-semibold">
            <AnimatedNumber value={medCount} />
          </span>
          <span>Rx{medCount === 1 ? '' : 's'}</span>
        </span>

        {session && (
          <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md bg-ink-800/70 border border-ink-700 animate-fadeIn">
            <span className="text-ink-500">Dr.</span>
            <span className="text-ink-200 font-medium">{session.doctorName.replace(/^Dr\.\s*/i, '')}</span>
            <span className="text-ink-600">·</span>
            <span className="font-mono text-ink-400">{session.licenseNo}</span>
            <button
              onClick={onSignOut}
              className="ml-1 px-1.5 py-0.5 rounded text-rx-accent hover:bg-ink-700/60 transition-colors"
              title="Sign out of the doctor portal"
            >
              Sign out
            </button>
          </div>
        )}
        <span className="hidden md:inline">Focus:</span>
        <span
          className={cx(
            'px-2 py-0.5 rounded font-mono transition-colors duration-200 rx-underline-track',
            focusZone === 'diagnosis' && 'bg-rx-focus/15 text-rx-focus border border-rx-focus/30',
            focusZone === 'med-search' && 'bg-rx-accent/15 text-rx-accent border border-rx-accent/30',
            focusZone === 'patient' && 'bg-rx-warn/15 text-rx-warn border border-rx-warn/30',
          )}
        >
          {focusZone ?? 'idle'}
        </span>
        <button
          className="ml-2 px-2 py-1 rounded border border-ink-700 hover:bg-ink-700/50 transition-colors hover:border-rx-warn/40"
          onClick={() => setFocusZone('patient')}
        >
          ⌘K · patient
        </button>
      </div>
    </header>
  );
}
