import React from 'react';
import { Link } from 'react-router-dom';
import type { Hospital, User } from '@swiftrx/shared';
import {
  actions,
  getState,
  useApp,
  previousRxForPatient,
  loadWorkspace,
  resetWorkspace,
  type DoctorIdentity,
} from './store';
import { useHotkeys, cx } from './useHotkeys';
import { TopBar } from './components/TopBar';
import { LeftColumn } from './components/LeftColumn';
import { CenterColumn } from './components/CenterColumn';
import { RightColumn } from './components/RightColumn';
import { NewPatientModal } from './components/NewPatientModal';
import { SafetyOverrideModal } from './components/SafetyOverrideModal';
import { QUICK_PACKS } from './data';
import type { QuickPack, SignedRx } from './types';
import { printCurrent, signAndPrint } from './print';
import './rx.css';

/**
 * The Rx pad, mounted by the portal at /rx (lazy-loaded). The portal only
 * renders it for a signed-in, licensed doctor of this hospital and passes that
 * identity in, so there is no separate Rx session.
 */
export default function RxPad({
  user,
  hospital,
  onSignOut,
}: {
  user: User;
  hospital: Hospital;
  onSignOut: () => void;
}) {
  const doctor = React.useMemo<DoctorIdentity>(
    () => ({
      id: user.id,
      email: user.email,
      name: user.name,
      licenseNo: user.licenseNo ?? '',
      hospitalSlug: hospital.slug,
    }),
    [user, hospital.slug],
  );
  const [loadedFor, setLoadedFor] = React.useState<DoctorIdentity | null>(null);

  // Load before the first paint so the workspace never flashes empty.
  React.useLayoutEffect(() => {
    loadWorkspace(doctor);
    setLoadedFor(doctor);
  }, [doctor]);

  const signOut = React.useCallback(() => {
    resetWorkspace();
    onSignOut();
  }, [onSignOut]);

  if (loadedFor !== doctor) return null;
  return <Workspace doctor={doctor} onSignOut={signOut} />;
}

function Workspace({ doctor, onSignOut }: { doctor: DoctorIdentity; onSignOut: () => void }) {
  const showNewPatient = useApp((s) => s.showNewPatient);
  const overrideOpen = useApp((s) => s.overridePrompt !== null);
  const hasPatient = useApp((s) => s.patients.some((p) => p.id === s.patientId));
  const patientSearchRef = React.useRef<HTMLInputElement>(null);
  const diagnosisRef = React.useRef<HTMLInputElement>(null);

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

  // Copy a previous Rx onto the pad, then hand focus to the medication search
  // so the doctor can add more or sign straight away.
  const repeatPrescription = React.useCallback((rx: SignedRx) => {
    actions.repeatRx(rx);
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-zone="med-search"]')?.focus();
    });
  }, []);

  const onSign = React.useCallback(() => {
    signAndPrint();
  }, []);

  const onPrint = React.useCallback(() => {
    if (!printCurrent()) {
      actions.setBanner({ kind: 'info', text: 'Nothing to print yet: add a diagnosis and at least one medication.' });
    }
  }, []);

  useHotkeys([
    {
      key: 'k',
      meta: true,
      description: 'Jump to patient search',
      handler: () => patientSearchRef.current?.focus(),
      allowInInputs: true,
    },
    // Alt (not Ctrl/Cmd) for N and 1/2/3: browsers reserve Ctrl/Cmd+N for a
    // new window and Ctrl/Cmd+1–8 for tab switching, and won't let pages
    // override them.
    {
      key: 'n',
      code: 'KeyN',
      alt: true,
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
      description: 'Print a DRAFT of the current pad',
      handler: onPrint,
      // Also inside inputs: otherwise the browser's own print runs and shows
      // whatever is left in #print-area.
      allowInInputs: true,
    },
    {
      key: 'Escape',
      description: 'Clear workspace',
      handler: () => actions.clearAll(),
    },
    {
      key: '1',
      code: 'Digit1',
      alt: true,
      description: 'Apply Quick Pack 1',
      handler: () => applyPackByIndex(0),
      allowInInputs: true,
    },
    {
      key: '2',
      code: 'Digit2',
      alt: true,
      description: 'Apply Quick Pack 2',
      handler: () => applyPackByIndex(1),
      allowInInputs: true,
    },
    {
      key: '3',
      code: 'Digit3',
      alt: true,
      description: 'Apply Quick Pack 3',
      handler: () => applyPackByIndex(2),
      allowInInputs: true,
    },
    {
      key: 'r',
      code: 'KeyR',
      alt: true,
      description: "Repeat the patient's last prescription",
      handler: () => {
        const s = getState();
        const last = previousRxForPatient(s.signed, s.patientId)[0];
        if (last) repeatPrescription(last);
        else actions.setBanner({ kind: 'info', text: 'No previous prescription for this patient.' });
      },
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
  ], !showNewPatient && !overrideOpen); // off while a modal is open

  return (
    <SignedInShell doctor={doctor} onSignOut={onSignOut}>
      {hasPatient ? (
        <>
          <TopBar onSignOut={onSignOut} />
          <div className="flex-1 flex min-h-0">
            <LeftColumn patientSearchRef={patientSearchRef} />
            <CenterColumn diagnosisRef={diagnosisRef} />
            <RightColumn onApply={applyPack} onRepeat={repeatPrescription} />
          </div>
        </>
      ) : (
        <EmptyRoster />
      )}
      <StatusLine />
      <NewPatientModal />
      <SafetyOverrideModal />
    </SignedInShell>
  );
}

/**
 * Shown when the signed-in doctor's hospital has no patients yet. The pad's
 * columns all assume a selected patient, so we offer to add the first one.
 */
function EmptyRoster() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="rounded-xl bg-ink-800/70 border border-ink-700 shadow-card p-8 max-w-sm text-center animate-fadeIn">
        <div className="text-base font-semibold text-ink-100">No patients yet</div>
        <p className="mt-1 text-sm text-ink-400">
          Your hospital's roster is empty. Add the first patient to start prescribing.
        </p>
        <button
          onClick={() => actions.openNewPatient()}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-rx-accent text-ink-900 font-semibold hover:bg-rx-accentDark transition-colors"
        >
          + New patient
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-900/30">Alt+N</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Small layout wrapper for the workspace. Shows the doctor name + tenant label
 * so the user always knows whose workspace they're in, with a way back to the
 * rest of the portal.
 */
function SignedInShell({
  doctor,
  children,
  onSignOut,
}: {
  doctor: DoctorIdentity;
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-ink-900 text-ink-100 relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 rx-bg-grid rx-fade-mask"
      />
      <div className="relative px-4 py-1.5 bg-ink-800/60 border-b border-ink-700 text-[11px] text-ink-400 flex items-center justify-between animate-fadeIn">
        <span className="flex items-center gap-1.5 min-w-0">
          <Link to="/dashboard" className="mr-2 text-rx-accent hover:underline shrink-0">
            ← Portal
          </Link>
          <span className="h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
          <span className="truncate">
            Signed in as <span className="text-ink-200 font-medium">{doctor.name}</span>
            <span className="mx-1.5 text-ink-600">·</span>
            Tenant <span className="font-mono text-ink-300">{doctor.hospitalSlug}</span>
            <span className="mx-1.5 text-ink-600 hidden sm:inline">·</span>
            <span className="hidden sm:inline">{doctor.licenseNo}</span>
          </span>
        </span>
        <button
          onClick={onSignOut}
          className="text-rx-accent hover:underline transition-colors"
        >
          Sign out
        </button>
      </div>
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
