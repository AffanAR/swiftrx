import React from 'react';
import { useApp, actions } from '../store';
import type { Drug } from '../types';
import { DRUGS } from '../data';
import { fuzzySearch, findBrandMatches } from '../search';
import { findDrug, evaluateMedication, severityRank } from '../safety';
import { cx } from '../useHotkeys';
import { LiveDot } from './Fx';

export function MedicationSearch() {
  // Search query is intentionally local — the draft is ephemeral and we don't
  // want med-search input to trigger re-renders of the rest of the pad.
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);

  const drugResults = React.useMemo(
    () => fuzzySearch(DRUGS, q, (d) => [d.genericName, d.brandNames.join(' '), d.therapeuticClass], 6),
    [q],
  );
  const brandHits = React.useMemo(() => findBrandMatches(q, DRUGS, 3), [q]);

  // Build a unified list, brand suggestions first (they have higher substitution priority)
  const suggestions = React.useMemo(() => {
    const out: Array<{ kind: 'brand' | 'drug'; drug: Drug; brandName?: string }> = [];
    const seen = new Set<string>();
    for (const b of brandHits) {
      const drug = findDrug(b.drugId, DRUGS);
      if (drug && !seen.has(drug.id)) {
        out.push({ kind: 'brand', drug, brandName: b.brandName });
        seen.add(drug.id);
      }
    }
    for (const d of drugResults) {
      if (!seen.has(d.id)) {
        out.push({ kind: 'drug', drug: d });
        seen.add(d.id);
      }
    }
    return out;
  }, [drugResults, brandHits]);

  React.useEffect(() => { setIdx(0); }, [q]);

  const add = (s: typeof suggestions[number]) => {
    actions.addMedication(s.drug.id, s.kind === 'brand' ? s.brandName : undefined);
    setQ('');
    setOpen(false);
    actions.setFocusZone('med-row');
    // Focus last row's first input if exists
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLElement>('[data-row]');
      const last = rows[rows.length - 1];
      const input = last?.querySelector<HTMLInputElement>('input,select');
      input?.focus();
    });
  };

  const enterAccepts = suggestions[idx];

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (enterAccepts) add(enterAccepts);
    } else if (e.key === 'Tab' && enterAccepts && q) {
      // Tab accepts top suggestion (per spec)
      e.preventDefault();
      add(enterAccepts);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Preview alerts for the highlighted suggestion
  const preview = enterAccepts
    ? evaluateMedication(
        {
          rowId: 'preview',
          drugId: enterAccepts.drug.id,
          genericName: enterAccepts.drug.genericName,
          brandName: enterAccepts.brandName,
          dosage: { ...enterAccepts.drug.defaultDosage },
          frequency: enterAccepts.drug.defaultFrequency,
          durationDays: enterAccepts.drug.defaultDurationDays,
          instructions: 'As directed',
        },
        patient,
        DRUGS,
      )
    : [];
  const worstPreview = preview.reduce<null | ReturnType<typeof severityRank>>((acc, a) => {
    const r = severityRank(a.severity);
    if (acc === null || r > acc) return r;
    return acc;
  }, null);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-wider text-ink-400 w-24">Medication</label>
        <div className="flex-1 relative">
          <input
            data-zone="med-search"
            type="text"
            placeholder="Add drug · e.g. 'Lipitor' (brand) or 'atorvastatin' (generic)"
            className={cx(
              'w-full px-3 py-2 rounded-md text-sm bg-ink-800 border border-ink-700 transition-all duration-200',
              'focus:border-rx-focus focus:shadow-glow',
              worstPreview !== null && worstPreview >= 2 && 'border-rx-warn/60',
              worstPreview === 3 && 'border-rx-danger/70',
            )}
            value={q}
            onFocus={() => {
              setOpen(true);
              actions.setFocusZone('med-search');
            }}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKey}
          />
          {/* Live safety indicator inside the input. */}
          {q && (
            <span
              className={cx(
                'absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider pointer-events-none animate-fadeIn',
                worstPreview === 3 && 'text-rx-danger',
                worstPreview === 2 && 'text-rx-warn',
                worstPreview === 1 && 'text-ink-400',
                worstPreview === null && 'text-rx-accent',
              )}
            >
              {worstPreview === 3 || worstPreview === 2 ? (
                <LiveDot color={worstPreview === 3 ? 'bg-rx-danger' : 'bg-rx-warn'} />
              ) : worstPreview === null ? (
                <LiveDot color="bg-rx-accent" />
              ) : null}
              <span>
                {worstPreview === 3
                  ? 'allergy'
                  : worstPreview === 2
                  ? 'interact'
                  : worstPreview === 1
                  ? 'dup'
                  : 'ok'}
              </span>
            </span>
          )}
          {open && q && (
            <ul className="absolute z-20 mt-1 left-0 right-0 bg-ink-800 border border-ink-700 rounded-md overflow-hidden shadow-2xl animate-slideUpIn max-h-72 overflow-y-auto">
              {suggestions.map((s, i) => {
                const sev = evaluateMedication(
                  {
                    rowId: 'p',
                    drugId: s.drug.id,
                    genericName: s.drug.genericName,
                    dosage: { ...s.drug.defaultDosage },
                    frequency: s.drug.defaultFrequency,
                    durationDays: s.drug.defaultDurationDays,
                    instructions: '',
                  },
                  patient,
                  DRUGS,
                );
                const worst = sev.reduce<number>((acc, a) => Math.max(acc, severityRank(a.severity)), 0);
                return (
                  <li
                    key={`${s.kind}-${s.drug.id}`}
                    className="animate-fadeIn"
                    style={{ animationDelay: `${i * 22}ms` }}
                  >
                    <button
                      type="button"
                      className={cx(
                        'group w-full text-left px-3 py-1.5 text-sm flex justify-between items-center gap-2 transition-colors',
                        i === idx
                          ? 'bg-rx-focus/15 text-rx-focus'
                          : 'hover:bg-ink-700/60',
                        worst >= 3 && 'bg-rx-danger/5',
                        worst === 2 && 'bg-rx-warn/5',
                      )}
                      onMouseDown={(e) => { e.preventDefault(); add(s); }}
                      onMouseEnter={() => setIdx(i)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {s.kind === 'brand' ? (
                            <>
                              <span className="font-mono text-ink-300">{s.brandName}</span>
                              <span className="mx-1.5 text-ink-400">→</span>
                              <span className="text-rx-accent">{s.drug.genericName}</span>
                              <span className="ml-2 text-[10px] text-ink-400 uppercase tracking-wider">brand→generic</span>
                            </>
                          ) : (
                            <span>{s.drug.genericName}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-400 truncate">{s.drug.therapeuticClass}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-mono text-ink-300">
                          {s.drug.defaultDosage.value}{s.drug.defaultDosage.unit} · {s.drug.defaultFrequency}
                        </div>
                        {worst >= 3 && <div className="text-[10px] text-rx-danger font-semibold animate-breathe">⚠ ALLERGY</div>}
                        {worst === 2 && <div className="text-[10px] text-rx-warn font-semibold">⚠ INTERACTION</div>}
                      </div>
                    </button>
                  </li>
                );
              })}
              {!suggestions.length && (
                <li className="px-3 py-2 text-xs text-ink-400 animate-fadeIn">No drug matches.</li>
              )}
            </ul>
          )}
        </div>
        <button
          onClick={() => { setQ(''); }}
          className="px-2.5 py-2 text-xs rounded border border-ink-700 text-ink-400 hover:bg-ink-700/40 transition-colors"
          title="Clear medication search"
        >
          ⌫
        </button>
      </div>

      {preview.length > 0 && (
        <div className="mt-1 ml-24 space-y-0.5 animate-slideUpIn">
          {preview.map((a, i) => (
            <div
              key={i}
              className={cx(
                'text-[11px] px-2 py-0.5 rounded animate-fadeIn',
                a.severity === 'critical' && 'bg-rx-danger/15 text-rx-danger animate-pulseRing',
                a.severity === 'moderate' && 'bg-rx-warn/15 text-rx-warn',
                a.severity === 'low' && 'bg-ink-700/60 text-ink-300',
              )}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className="font-semibold uppercase tracking-wider mr-1">[{a.severity}]</span>
              {a.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
