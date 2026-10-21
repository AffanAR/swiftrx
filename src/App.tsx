import React from 'react';
import { actions, getState, useApp, bootstrapFromBridge } from './store';
import { useHotkeys, cx } from './useHotkeys';
import { TopBar } from './components/TopBar';
import { LeftColumn } from './components/LeftColumn';
import { CenterColumn } from './components/CenterColumn';
import { RightColumn } from './components/RightColumn';
import { NewPatientModal } from './components/NewPatientModal';
import { SessionGate } from './components/SessionGate';
import { useSession, loadSession } from './session';
import { QUICK_PACKS } from './data';
import type { QuickPack } from './types';
import { printCurrent } from './print';

export default function App() {
  const [session, signOut] = useSession();
  const patientSearchRef = React.useRef<HTMLInputElement>(null);
  const diagnosisRef = React.useRef<HTMLInputElement>(null);

  // On first paint, seed the store with the hospital-scoped patients, signed
  // Rx history, and doctor identity from the bridge session. We do this once
  // (not in response to every session change) so that re-renders triggered
  // by the store don't loop back into the bridge.
  React.useEffect(() => {
    bootstrapFromBridge();
  }, []);

  // When a session appears (URL handoff or localStorage), push the doctor's
  // identity into the store so the Rx pad's "signed by" fields match the
  // logged-in doctor.
  React.useEffect(() => {
    if (session.status === 'signed-in') {
      actions.setDoctorIdentity({
        doctorName: session.session.doctorName,
        doctorLicense: session.session.licenseNo,
      });
    }
  }, [session]);

  const applyPack = React.useCallback((pack: QuickPack) => {
    const meds = pack.medications.map((m) => ({
      drugId: m.drugId,
      genericName: m.genericName,
      brandName: undefined as string | undefined,
      dosage: m.dosage,
      frequency: m.frequency,
      durationDays: m.durationDays,
      instructions: m.instructions,
    }));
    actions.addMedications(meds);
  }, []);

  const applyPackByIndex = React.useCallback(
    (i: number) => {
      const dx = getState().diagnosis;
      if (!dx) {
        actions.setBanner({ kind: 'warn', text: 'Select a diagnosis first.' });
        return;
      }
      const packs = QUICK_PACKS.filter((p) => p.diagnosisCode === dx.code).sort(
        (a, b) => a.shortcutKey.localeCompare(b.shortcutKey),
      );
      if (packs[i]) applyPack(packs[i]);
      else actions.setBanner({ kind: 'info', text: `No pack #${i + 1} for ${dx.code}.` });
    },
    [applyPack],
  );

  const onSign = React.useCallback(() => {
    const ok = actions.sign();
    if (!ok) return;
    printCurrent();
  }, []);

  const onPrint = React.useCallback(() => {
    printCurrent();
  }, []);

  const onSignOut = React.useCallback(() => {
    signOut();
    actions.clearAll();
  }, [signOut]);

  useHotkeys([
    {
      key: 'k',
      meta: true,
      description: 'Jump to patient search',
      handler: () => patientSearchRef.current?.focus(),
      allowInInputs: true,
    },
    {
      key: 'n',
      meta: true,
      description: 'New patient',
      handler: () => actions.openNewPatient(),
      allowInInputs: true,
    },
    {
      key: 'Enter',
      meta: true,
      description: 'Sign & Print',
      handler: onSign,
      allowInInputs: true,
    },
    {
      key: 's',
      meta: true,
      description: 'Sign & Print',
      handler: onSign,
      allowInInputs: true,
    },
    {
      key: 'p',
      meta: true,
      description: 'Print / send to pharmacy',
      handler: onPrint,
    },
    {
      key: 'Escape',
      description: 'Clear workspace',
      handler: () => actions.clearAll(),
    },
    {
      key: '1',
      meta: true,
      description: 'Apply Quick Pack 1',
      handler: () => applyPackByIndex(0),
      allowInInputs: true,
    },
    {
      key: '2',
      meta: true,
      description: 'Apply Quick Pack 2',
      handler: () => applyPackByIndex(1),
      allowInInputs: true,
    },
    {
      key: '3',
      meta: true,
      description: 'Apply Quick Pack 3',
      handler: () => applyPackByIndex(2),
      allowInInputs: true,
    },
    {
      key: '/',
      description: 'Focus diagnosis search',
      handler: () => {
        const el = document.querySelector<HTMLInputElement>('[data-zone="diagnosis"]');
        el?.focus();
        actions.setFocusZone('diagnosis');
      },
    },
  ]);

  return (
    <SessionGate>
      <SignedInShell onSignOut={onSignOut}>
        <TopBar onSignOut={onSignOut} />
        <div className="flex-1 flex min-h-0">
          <LeftColumn patientSearchRef={patientSearchRef} />
          <CenterColumn diagnosisRef={diagnosisRef} />
          <RightColumn onApply={applyPack} />
        </div>
        <StatusLine />
        <NewPatientModal />
      </SignedInShell>
    </SessionGate>
  );
}

/**
 * Small layout wrapper for the signed-in workspace. Reads the live session
 * (already validated by SessionGate) and shows the doctor name + tenant
 * label so the user always knows whose workspace they're in.
 */
function SignedInShell({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  const s = loadSession();
  return (
    <div className="h-full flex flex-col bg-ink-900 text-ink-100 relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 rx-bg-grid rx-fade-mask"
      />
      {s && (
        <div className="relative px-4 py-1.5 bg-ink-800/60 border-b border-ink-700 text-[11px] text-ink-400 flex items-center justify-between animate-fadeIn">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
            <span className="truncate">
              Signed in as <span className="text-ink-200 font-medium">{s.doctorName}</span>
              <span className="mx-1.5 text-ink-600">·</span>
              Tenant <span className="font-mono text-ink-300">{s.hospitalSlug}</span>
              <span className="mx-1.5 text-ink-600 hidden sm:inline">·</span>
              <span className="hidden sm:inline">{s.licenseNo}</span>
            </span>
          </span>
          <button
            onClick={onSignOut}
            className="text-rx-accent hover:underline transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
      <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

function StatusLine() {
  const [now, setNow] = React.useState(() => new Date());
  const medCount = useApp((s) => s.medications.length);
  const banner = useApp((s) => s.banner);
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative h-6 border-t border-ink-700 bg-ink-800/70 px-3 flex items-center justify-between text-[11px] text-ink-400 overflow-hidden">
      {/* Travelling shimmer on the top border so the bar feels "live". */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px
                   bg-gradient-to-r from-transparent via-rx-accent/40 to-transparent
                   opacity-50 animate-shimmer"
        style={{ backgroundSize: '200% 100%' }}
      />
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <span className="flex items-center gap-1.5">
          <span className="text-rx-accent animate-breathe">●</span> SwiftRx
        </span>
        <span>v0.1</span>
        <span className="hidden lg:inline">1,500+ drugs · 200+ ICD-10 · 50+ Quick Packs</span>
        {medCount > 0 && (
          <span className="font-mono text-rx-accent animate-fadeIn">
            · {medCount} med{medCount === 1 ? '' : 's'} on pad
          </span>
        )}
        {banner && (
          <span
            key={banner.text}
            className={cx(
              'rounded px-1.5 py-0.5 text-[10px] font-mono animate-slideInRight',
              banner.kind === 'success' && 'bg-rx-accent/15 text-rx-accent',
              banner.kind === 'info' && 'bg-ink-700 text-ink-200',
              banner.kind === 'warn' && 'bg-rx-warn/15 text-rx-warn',
              banner.kind === 'danger' && 'bg-rx-danger/15 text-rx-danger animate-breathe',
            )}
          >
            {banner.text}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
          <span className="hidden md:inline">autocomplete median ~12ms</span>
        </span>
        <span className="font-mono tabular-nums">{now.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
