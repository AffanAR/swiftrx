import React from 'react';
import { useApp, actions } from '../store';
import { fuzzySearch } from '../search';
import { cx } from '../useHotkeys';
import { LiveDot, StaggeredList } from './Fx';

export function LeftColumn({ patientSearchRef }: { patientSearchRef: React.RefObject<HTMLInputElement> }) {
  const patients = useApp((s) => s.patients);
  const patientId = useApp((s) => s.patientId);
  const [query, setQuery] = React.useState('');
  const [focused, setFocused] = React.useState(false);

  const results = React.useMemo(() => {
    if (!query.trim()) return patients;
    return fuzzySearch(
      patients,
      query,
      (p) => [p.name, p.contact, p.activeProblems.join(' ')],
      5,
    );
  }, [query, patients]);

  const current = patients.find((p) => p.id === patientId)!;
  const recentVitals = current.recentVitals;

  return (
    <aside className="w-1/5 min-w-[260px] border-r border-ink-700 bg-ink-900/60 p-3 overflow-y-auto rx-bg-radial-accent">
      <div className="text-[11px] uppercase tracking-wider text-ink-400 mb-1 flex items-center gap-1.5">
        <LiveDot color="bg-rx-focus" />
        <span>Patient</span>
      </div>
      <input
        ref={patientSearchRef}
        type="text"
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
      />
      {focused && query && (
        <ul className="mt-1 bg-ink-800 border border-ink-700 rounded-md overflow-hidden animate-slideUpIn shadow-xl">
          {results.map((p, i) => (
            <li
              key={p.id}
              className="animate-fadeIn"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <button
                className={cx(
                  'w-full text-left px-2.5 py-1.5 text-sm flex justify-between items-center transition-colors',
                  'hover:bg-ink-700/60',
                  p.id === patientId && 'bg-ink-700/40',
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  actions.setPatient(p.id);
                  setQuery('');
                  (patientSearchRef.current as HTMLInputElement | null)?.blur();
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-ink-400 shrink-0 ml-2">
                  {p.age}{p.sex}
                </span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="animate-fadeIn">
              <button
                className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-ink-700/60 flex justify-between items-center text-rx-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  actions.openNewPatient();
                  setQuery('');
                  (patientSearchRef.current as HTMLInputElement | null)?.blur();
                }}
              >
                <span>+ Create &quot;{query}&quot;</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-700 text-ink-200 border border-ink-600">⌘N</span>
              </button>
            </li>
          )}
        </ul>
      )}

      <button
        onClick={() => actions.openNewPatient()}
        className="mt-2 w-full px-2.5 py-1.5 rounded-md border border-dashed border-ink-700 text-xs text-ink-400 hover:text-rx-accent hover:border-rx-accent/40 transition-all duration-200 flex items-center justify-center gap-2 hover:bg-rx-accent/5"
        title="New patient (⌘N)"
      >
        <span>+ New patient</span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">⌘N</span>
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
          <div className="text-sm text-ink-400 italic px-2">No known allergies</div>
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
