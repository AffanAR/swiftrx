import React from 'react';
import { useApp, actions } from '../store';
import { fuzzySearch } from '../search';
import {
  LiveDot,
  StaggeredList,
  cx,
  ageSexLabel,
  KIDNEY_LABELS,
  PREGNANCY_LABELS,
} from '@swiftrx/shared';

// The patient search is an ARIA combobox: focus stays in the input, and
// aria-activedescendant tells screen readers which option is highlighted.
const RESULTS_ID = 'rx-patient-results';
const optionId = (i: number) => `rx-patient-option-${i}`;

export function LeftColumn({
  patientSearchRef,
}: {
  patientSearchRef: React.RefObject<HTMLInputElement>;
}) {
  const patients = useApp((s) => s.patients);
  const patientId = useApp((s) => s.patientId);
  const [query, setQuery] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const results = React.useMemo(() => {
    if (!query.trim()) return patients;
    return fuzzySearch(patients, query, (p) => [p.name, p.contact, p.activeProblems.join(' ')], 5);
  }, [query, patients]);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const open = focused && !!query;

  const choose = (id: string) => {
    actions.setPatient(id);
    setQuery('');
    // Continue the keyboard flow at diagnosis, as the new-patient flow does.
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-zone="diagnosis"]')?.focus();
    });
  };

  const createNew = () => {
    actions.openNewPatient();
    setQuery('');
    patientSearchRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      return;
    }
    // Arrows and Enter only act on the open list. An Enter that confirms an
    // IME composition must not pick a patient.
    if (!open || e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // With no matches, the list's only option creates a patient.
      if (results[activeIdx]) choose(results[activeIdx].id);
      else if (!results.length) createNew();
    }
  };

  const current = patients.find((p) => p.id === patientId)!;
  const recentVitals = current.recentVitals;

  return (
    <aside className="w-1/5 min-w-[260px] border-r border-ink-700 bg-ink-900/60 p-3 overflow-y-auto rx-bg-radial-accent">
      <label
        htmlFor="rx-patient-search"
        className="text-[11px] uppercase tracking-wider text-ink-400 mb-1 flex items-center gap-1.5"
      >
        <LiveDot color="bg-rx-focus" />
        <span>Patient</span>
      </label>
      <input
        ref={patientSearchRef}
        id="rx-patient-search"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={RESULTS_ID}
        aria-activedescendant={open ? optionId(activeIdx) : undefined}
        placeholder="Search patients…  ⌘K"
        className={cx(
          'w-full px-2.5 py-2 rounded-md text-sm bg-ink-800 border border-ink-700 transition-all duration-200',
          'focus:border-rx-focus focus:shadow-glow',
          focused && 'ring-1 ring-rx-focus/40',
        )}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setFocused(true);
          actions.setFocusZone('patient');
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKey}
      />
      {open && (
        <ul
          id={RESULTS_ID}
          role="listbox"
          aria-label="Patients"
          className="mt-1 bg-ink-800 border border-ink-700 rounded-md overflow-hidden animate-slideUpIn shadow-xl"
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIdx}
              tabIndex={-1}
              className={cx(
                'px-2.5 py-1.5 text-sm flex justify-between items-center cursor-pointer transition-colors animate-fadeIn',
                i === activeIdx ? 'bg-rx-focus/15 text-rx-focus' : 'hover:bg-ink-700/60',
                i !== activeIdx && p.id === patientId && 'bg-ink-700/40',
              )}
              style={{ animationDelay: `${i * 30}ms` }}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p.id);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-ink-400 shrink-0 ml-2">{ageSexLabel(p)}</span>
            </li>
          ))}
          {!results.length && (
            <li
              id={optionId(0)}
              role="option"
              aria-selected={activeIdx === 0}
              tabIndex={-1}
              className={cx(
                'px-2.5 py-1.5 text-sm flex justify-between items-center cursor-pointer transition-colors animate-fadeIn text-rx-accent',
                activeIdx === 0 ? 'bg-rx-focus/15' : 'hover:bg-ink-700/60',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                createNew();
              }}
            >
              <span>+ Create &quot;{query}&quot;</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-700 text-ink-200 border border-ink-600">
                Alt+N
              </span>
            </li>
          )}
        </ul>
      )}

      <button
        onClick={() => actions.openNewPatient()}
        className="mt-2 w-full px-2.5 py-1.5 rounded-md border border-dashed border-ink-700 text-xs text-ink-400 hover:text-rx-accent hover:border-rx-accent/40 transition-all duration-200 flex items-center justify-center gap-2 hover:bg-rx-accent/5"
        title="New patient (Alt+N)"
      >
        <span>+ New patient</span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">
          Alt+N
        </span>
      </button>

      <Section title="Active Problems">
        <ul className="space-y-1">
          {current.activeProblems.map((p, i) => (
            <li
              key={p}
              className="text-sm px-2 py-1 rounded bg-ink-800/70 border border-ink-700 animate-fadeIn"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {p}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Current Medications">
        <ul className="space-y-1">
          {current.activeMedications.map((m, i) => (
            <li
              key={m.name}
              className="text-sm flex justify-between bg-ink-800/70 border border-ink-700 rounded px-2 py-1 animate-fadeIn"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span>{m.name}</span>
              <span className="text-ink-400 font-mono text-xs">{m.dose}</span>
            </li>
          ))}
          {!current.activeMedications.length && (
            <li className="text-sm text-ink-400 italic px-2">None</li>
          )}
        </ul>
      </Section>

      <Section title="Recent Vitals" right={<LiveDot color="bg-rx-accent" />}>
        <StaggeredList
          className="grid grid-cols-2 gap-1.5"
          stepMs={45}
          initialMs={0}
          itemClassName=""
        >
          {recentVitals.map((v) => (
            <div
              key={v.label}
              className="bg-ink-800/70 border border-ink-700 rounded px-2 py-1.5 transition-colors hover:border-rx-accent/40"
            >
              <div className="text-[10px] uppercase tracking-wider text-ink-400">{v.label}</div>
              <div className="text-sm font-medium">{v.value}</div>
            </div>
          ))}
        </StaggeredList>
      </Section>

      <Section
        title="Allergies"
        right={
          current.allergies.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rx-danger/15 text-rx-danger border border-rx-danger/30 animate-breathe">
              {current.allergies.length}
            </span>
          ) : null
        }
      >
        {current.allergies.length === 0 ? (
          current.allergyStatus === 'none_known' ? (
            <div className="text-sm text-ink-400 italic px-2">No known allergies</div>
          ) : (
            <div className="text-sm text-rx-warn px-2">
              Not recorded yet. Ask before prescribing.
            </div>
          )
        ) : (
          <ul className="space-y-1">
            {current.allergies.map((a, i) => (
              <li
                key={a}
                className="text-sm px-2 py-1 rounded bg-rx-danger/10 border border-rx-danger/30 text-rx-danger font-medium animate-fadeIn"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                ⚠ {a}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* What the dose and pregnancy checks need: shown, and flagged when unknown. */}
      <Section title="Pregnancy & kidneys">
        <dl className="text-sm px-2 space-y-1">
          {current.pregnancy !== 'not_applicable' && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-400">Pregnancy</dt>
              <dd
                className={cx(
                  (current.pregnancy === 'pregnant' || current.pregnancy === 'breastfeeding') &&
                    'text-rx-danger font-medium',
                  current.pregnancy === 'unknown' && 'text-rx-warn',
                )}
              >
                {PREGNANCY_LABELS[current.pregnancy]}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-ink-400">Kidneys</dt>
            <dd
              className={cx(
                'text-right',
                current.kidney === 'unknown' && 'text-rx-warn',
                current.kidney !== 'unknown' &&
                  current.kidney !== 'normal' &&
                  'text-rx-danger font-medium',
              )}
            >
              {KIDNEY_LABELS[current.kidney]}
              {current.egfr !== undefined && (
                <span className="block text-[11px] font-mono text-ink-400">
                  eGFR {current.egfr}
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-400">Born</dt>
            <dd className="font-mono text-xs">
              {current.dateOfBirth}
              {current.dateOfBirthEstimated && <span className="text-ink-400"> (est.)</span>}
            </dd>
          </div>
        </dl>
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1.5 flex items-center gap-2">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}
