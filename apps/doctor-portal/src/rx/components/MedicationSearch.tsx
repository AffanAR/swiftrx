import React from 'react';
import { useApp, actions, shownAlerts } from '../store';
import { LiveDot, cx, type Drug, type Patient, type RxMedication } from '@swiftrx/shared';
import { buildMedicineIndex, searchMedicines, type MedicineHit } from '../search';
import { evaluateMedication, severityRank } from '@swiftrx/shared';
import { NO_SAFETY_DATA, medicationFor } from '../dosing';

export function MedicationSearch() {
  // Search query is intentionally local — the draft is ephemeral and we don't
  // want med-search input to trigger re-renders of the rest of the pad.
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);
  const drugs = useApp((s) => s.catalog.drugs);
  const brands = useApp((s) => s.catalog.brands);
  const hideMinor = useApp((s) => s.hideMinorAlerts);
  // What's already on the pad: a suggestion is checked against it too.
  const onPad = useApp((s) => s.medications);

  // Built once per catalog: about 21,700 brands, searched on every keystroke.
  const index = React.useMemo(() => buildMedicineIndex({ drugs, brands }), [drugs, brands]);
  const suggestions = React.useMemo(() => searchMedicines(index, q), [index, q]);

  React.useEffect(() => {
    setIdx(0);
  }, [q]);

  const add = (s: MedicineHit) => {
    actions.addMedication(s.drug.id, s.kind === 'brand' ? s.brand : undefined);
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
    ? shownAlerts(alertsFor(enterAccepts, patient, drugs, onPad), hideMinor)
    : [];
  const worstPreview = preview.reduce<null | ReturnType<typeof severityRank>>((acc, a) => {
    const r = severityRank(a.severity);
    if (acc === null || r > acc) return r;
    return acc;
  }, null);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <label
          htmlFor="rx-med-search"
          className="text-[11px] uppercase tracking-wider text-ink-400 w-24"
        >
          Medication
        </label>
        <div className="flex-1 relative">
          <input
            id="rx-med-search"
            data-zone="med-search"
            type="text"
            placeholder={
              brands.length > 0
                ? "Add drug · e.g. 'Napa' (brand) or 'paracetamol' (generic)"
                : "Add drug · e.g. 'paracetamol' (generic)"
            }
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
                const start = medicationFor(s.drug, s.kind === 'brand' ? s.brand : undefined);
                const sev = shownAlerts(
                  evaluateMedication({ rowId: 'p', ...start }, patient, drugs, { others: onPad }),
                  hideMinor,
                );
                const worst = sev.reduce<number>(
                  (acc, a) => Math.max(acc, severityRank(a.severity)),
                  0,
                );
                return (
                  <li
                    key={s.kind === 'brand' ? s.brand.id : s.drug.id}
                    className="animate-fadeIn"
                    style={{ animationDelay: `${i * 22}ms` }}
                  >
                    <button
                      type="button"
                      className={cx(
                        'group w-full text-left px-3 py-1.5 text-sm flex justify-between items-center gap-2 transition-colors',
                        i === idx ? 'bg-rx-focus/15 text-rx-focus' : 'hover:bg-ink-700/60',
                        worst >= 3 && 'bg-rx-danger/5',
                        worst === 2 && 'bg-rx-warn/5',
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(s);
                      }}
                      onMouseEnter={() => setIdx(i)}
                    >
                      <div
                        className="min-w-0"
                        title={
                          s.kind === 'brand'
                            ? [s.drug.genericName, s.brand.manufacturer, s.brand.price]
                                .filter(Boolean)
                                .join(' · ')
                            : s.drug.therapeuticClass
                        }
                      >
                        <div className="font-medium truncate">
                          {s.kind === 'brand' ? (
                            <>
                              <span>{s.brand.name}</span>
                              {s.brand.strength && (
                                <span className="ml-1.5 font-mono text-ink-300">
                                  {s.brand.strength}
                                </span>
                              )}
                              <span className="ml-1.5 text-ink-400">{s.brand.form}</span>
                            </>
                          ) : (
                            <>
                              <span>{s.drug.genericName}</span>
                              <span className="ml-2 text-[10px] text-ink-400 uppercase tracking-wider">
                                generic
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-400 truncate">
                          {s.kind === 'brand' ? (
                            <>
                              <span className="text-rx-accent">{s.drug.genericName}</span>
                              {' · '}
                              {[s.brand.manufacturer, s.brand.price].filter(Boolean).join(' · ')}
                            </>
                          ) : (
                            s.drug.therapeuticClass
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {s.drug.safetyReviewed ? (
                          <div className="text-[11px] font-mono text-ink-300">
                            {start.dosage.value}
                            {start.dosage.unit} · {start.frequency}
                          </div>
                        ) : (
                          <div
                            className="text-[10px] text-ink-400 uppercase tracking-wider"
                            title={NO_SAFETY_DATA}
                          >
                            no safety data
                          </div>
                        )}
                        {worst >= 3 && (
                          <div className="text-[10px] text-rx-danger font-semibold animate-breathe">
                            ⚠ ALLERGY
                          </div>
                        )}
                        {worst === 2 && (
                          <div className="text-[10px] text-rx-warn font-semibold">
                            ⚠ INTERACTION
                          </div>
                        )}
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
          onClick={() => {
            setQ('');
          }}
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

/** The safety alerts a search hit would raise once added, at its starting dose. */
function alertsFor(hit: MedicineHit, patient: Patient, drugs: Drug[], onPad: RxMedication[]) {
  const brand = hit.kind === 'brand' ? hit.brand : undefined;
  return evaluateMedication(
    { rowId: 'preview', ...medicationFor(hit.drug, brand) },
    patient,
    drugs,
    { others: onPad },
  );
}
