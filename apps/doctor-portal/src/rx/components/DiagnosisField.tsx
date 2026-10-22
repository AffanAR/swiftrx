import React from 'react';
import { useApp, actions } from '../store';
import { fuzzySearch } from '../search';
import {
  LiveDot,
  MOCK_DIAGNOSES,
  MOCK_INVESTIGATIONS,
  cx,
  type Diagnosis,
  type Investigation,
} from '@swiftrx/shared';

interface Props {
  diagnosisRef: React.RefObject<HTMLInputElement>;
}

export function DiagnosisField({ diagnosisRef }: Props) {
  const query = useApp((s) => s.diagnosisQuery);
  const diagnosis = useApp((s) => s.diagnosis);
  const investigations = useApp((s) => s.investigations);
  const setQuery = actions.setDiagnosisQuery;
  const setDiagnosis = actions.setDiagnosis;
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const results = React.useMemo(() => {
    return fuzzySearch(
      MOCK_DIAGNOSES,
      query,
      (d) => [`${d.code} ${d.name}`, d.name, d.code, d.category],
      8,
    );
  }, [query]);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const choose = (d: Diagnosis) => {
    setDiagnosis(d);
    setOpen(false);
    // Move focus to medication search
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[data-zone="med-search"]');
      el?.focus();
      actions.setFocusZone('med-search');
    }, 0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) choose(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-wider text-ink-400 w-24 flex items-center gap-1.5">
          {diagnosis ? <LiveDot color="bg-rx-accent" /> : null}
          <span>Diagnosis</span>
        </label>
        <div className="flex-1 relative">
          {diagnosis ? (
            <button
              type="button"
              onClick={() => {
                setDiagnosis(null);
                setOpen(true);
                setTimeout(() => diagnosisRef.current?.focus(), 0);
              }}
              className="group w-full text-left px-3 py-2 rounded-md bg-rx-accent/10 border border-rx-accent/40 text-rx-accent font-mono text-sm
                         transition-all hover:bg-rx-accent/15 animate-fadeIn"
            >
              <span className="font-bold">{diagnosis.code}</span> · {diagnosis.name}
              <span className="float-right text-ink-400 group-hover:text-ink-200 transition-colors">
                ✕
              </span>
            </button>
          ) : (
            <>
              <input
                ref={diagnosisRef}
                data-zone="diagnosis"
                type="text"
                placeholder="Search ICD-10 · e.g. 'asthma', 'I10', 'diabetes'"
                className={cx(
                  'w-full px-3 py-2 rounded-md text-sm bg-ink-800 border border-ink-700 transition-all duration-200',
                  'focus:border-rx-focus focus:shadow-glow',
                )}
                value={query}
                onFocus={() => {
                  setOpen(true);
                  actions.setFocusZone('diagnosis');
                }}
                onBlur={() => setTimeout(() => setOpen(false), 100)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onKeyDown={onKey}
              />
              {open && query && (
                <ul className="absolute z-20 mt-1 left-0 right-0 bg-ink-800 border border-ink-700 rounded-md overflow-hidden shadow-2xl animate-slideUpIn max-h-80 overflow-y-auto">
                  {results.map((d, i) => (
                    <li
                      key={d.code}
                      className="animate-fadeIn"
                      style={{ animationDelay: `${i * 22}ms` }}
                    >
                      <button
                        type="button"
                        className={cx(
                          'w-full text-left px-3 py-1.5 text-sm flex justify-between gap-2 transition-colors',
                          i === activeIdx ? 'bg-rx-focus/15 text-rx-focus' : 'hover:bg-ink-700/60',
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(d);
                        }}
                        onMouseEnter={() => setActiveIdx(i)}
                      >
                        <span>
                          <span className="font-mono font-bold text-ink-300 mr-2">{d.code}</span>
                          {d.name}
                        </span>
                        <span className="text-[10px] text-ink-400 uppercase tracking-wider">
                          {d.category}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!results.length && (
                    <li className="px-3 py-2 text-xs text-ink-400">
                      No matches. Try a code or symptom.
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {diagnosis && <InvestigationList selected={investigations} />}
    </div>
  );
}

function InvestigationList({ selected }: { selected: Investigation[] }) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const matches = React.useMemo(() => {
    if (!draft.trim()) return MOCK_INVESTIGATIONS;
    const q = draft.trim().toLowerCase();
    return MOCK_INVESTIGATIONS.filter(
      (i) => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [draft]);

  const isOn = (code: string) => selected.some((i) => i.code === code);

  return (
    <div className="ml-[6.5rem] -mt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-ink-400 mr-1">
          Advised Tests
        </span>
        {selected.map((inv, i) => (
          <button
            key={inv.code}
            onClick={() => actions.toggleInvestigation(inv)}
            className={cx(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border transition-all duration-200 rx-hover-lift animate-fadeIn',
              isOn(inv.code)
                ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/40'
                : 'bg-ink-800 text-ink-400 border-ink-700',
            )}
            title={`${inv.name} (${inv.type})`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <span className="font-mono font-semibold">{inv.code}</span>
            <span className="text-ink-400">·</span>
            <span>{inv.type}</span>
            <span className="opacity-60">✕</span>
          </button>
        ))}
        <button
          onClick={() => {
            setAdding(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border border-dashed border-ink-700 text-ink-400 hover:text-rx-accent hover:border-rx-accent/40 transition-colors"
        >
          + Add test
        </button>
      </div>

      {adding && (
        <div className="mt-1 relative animate-slideUpIn">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            placeholder="Search CBC, HbA1c, CXR, ECG…"
            className="w-full px-2 py-1 rounded-md text-xs bg-ink-900/60 border border-ink-700 focus:border-rx-focus transition-all"
          />
          <ul className="absolute z-10 mt-1 left-0 right-0 max-h-56 overflow-y-auto bg-ink-800 border border-ink-700 rounded-md shadow-2xl">
            {matches.map((m, i) => (
              <li key={m.code} className="animate-fadeIn" style={{ animationDelay: `${i * 18}ms` }}>
                <button
                  className={cx(
                    'w-full text-left px-2 py-1 text-xs flex justify-between hover:bg-ink-700/60 transition-colors',
                    isOn(m.code) && 'text-ink-400 line-through',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!isOn(m.code)) actions.toggleInvestigation(m);
                    setDraft('');
                  }}
                >
                  <span>
                    <span className="font-mono font-semibold mr-2">{m.code}</span>
                    {m.name}
                  </span>
                  <span className="text-[10px] text-ink-400 uppercase">{m.type}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2 py-1 text-xs text-ink-400">No tests match &quot;{draft}&quot;</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
