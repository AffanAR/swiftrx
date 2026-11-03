import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LiveDot,
  Card,
  Select,
  TextField,
  api,
  cx,
  medicineLabel,
  usePrescriptions,
  type Hospital,
  type User,
  ageSexLabel,
} from '@swiftrx/shared';
import {
  NO_FILTERS,
  filterChoices,
  filterPrescriptions,
  filtersFrom,
  hasFilters,
  withFilters,
  type RxFilters,
} from '../prescriptionFilters';

type Props = { hospital: Hospital; user: User };

export function PrescriptionsPage({ hospital }: Props) {
  const all = usePrescriptions(hospital.slug);
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const filters = React.useMemo(() => filtersFrom(new URLSearchParams(query)), [query]);
  const set = (patch: Partial<RxFilters>) =>
    setParams((p) => withFilters(p, { ...filtersFrom(p), ...patch }), { replace: true });
  const choices = React.useMemo(() => filterChoices(all), [all]);
  const rx = React.useMemo(() => filterPrescriptions(all, filters), [all, filters]);
  const filtered = hasFilters(filters);

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-4 animate-fadeIn">
      <header>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Prescriptions</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Signed Rx</h1>
        <p className="text-sm text-ink-400" aria-live="polite">
          {filtered
            ? `Showing ${rx.length} of ${all.length} prescriptions signed in ${hospital.name}`
            : `${all.length} prescription${all.length === 1 ? '' : 's'} signed in ${hospital.name}`}
        </p>
      </header>

      {all.length > 0 && (
        <div
          role="search"
          aria-label="Search prescriptions"
          className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[2fr_1fr_1fr_auto_auto_auto] items-end"
        >
          <TextField
            label="Search"
            value={filters.q}
            onChange={(q) => set({ q })}
            placeholder="Patient, phone, Rx id or medicine…"
          />
          <Select
            label="Doctor"
            value={filters.doctor}
            onChange={(doctor) => set({ doctor })}
            options={[{ value: '', label: 'All doctors' }, ...choices.doctors]}
          />
          <Select
            label="Diagnosis"
            value={filters.dx}
            onChange={(dx) => set({ dx })}
            options={[{ value: '', label: 'All diagnoses' }, ...choices.diagnoses]}
          />
          <DateField label="From" value={filters.from} onChange={(from) => set({ from })} />
          <DateField label="To" value={filters.to} onChange={(to) => set({ to })} />
          <button
            type="button"
            className="rx-btn-ghost h-9"
            disabled={!filtered}
            onClick={() => set(NO_FILTERS)}
          >
            Clear
          </button>
        </div>
      )}

      {all.length === 0 ? (
        <Card>
          <div className="text-sm text-ink-400 italic text-center py-8">
            No prescriptions signed yet. Open the Rx Pad to write one.
          </div>
        </Card>
      ) : rx.length === 0 ? (
        <Card>
          <div className="text-sm text-ink-400 italic text-center py-8">
            No prescriptions match these filters.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rx.map((r, i) => (
            <div
              key={r.id}
              className="rx-card p-4 animate-fadeIn"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink-100">{r.patient.name}</span>
                    <span className="text-xs text-ink-500 font-mono">
                      · {ageSexLabel(r.patient, r.signedAt)} · {r.patient.weightKg}kg
                    </span>
                    {r.patient.allergies.length > 0 && (
                      <span className="text-[10px] font-semibold text-rx-danger bg-rx-danger/15 border border-rx-danger/30 rounded px-1.5 py-0.5">
                        ⚠ {r.patient.allergies.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-ink-400">
                    <span className="font-mono text-ink-300">{r.diagnosis.code}</span>{' '}
                    {r.diagnosis.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-ink-500 font-mono">{r.id}</div>
                  <div className="text-[11px] text-ink-400">
                    {new Date(r.signedAt).toLocaleString()}
                  </div>
                  {hospital.features.allowPdfExport && (
                    <a
                      href={api.prescriptions.pdfUrl(hospital.slug, r.id)}
                      download
                      className="mt-1 inline-block text-[11px] text-rx-accent hover:underline"
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              </div>
              <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
                {r.medications.map((m, mi) => (
                  <li
                    key={mi}
                    className={cx(
                      'text-[12px] font-mono px-2 py-1 rounded border',
                      'bg-ink-900/40 border-ink-700 text-ink-200',
                    )}
                  >
                    <span className="font-semibold text-ink-100">{medicineLabel(m)}</span>
                    {m.brandName && <span className="text-ink-400"> ({m.genericName})</span>}
                    <span className="text-ink-400">
                      {' '}
                      · {m.dosage.value}
                      {m.dosage.unit} {m.frequency} × {m.durationDays}d
                    </span>
                  </li>
                ))}
              </ul>
              {r.investigations.length > 0 && (
                <div className="mt-3 text-[11px] text-ink-400">
                  <span className="text-ink-500">Investigations:</span>{' '}
                  {r.investigations.map((i) => i.code).join(', ')}
                </div>
              )}
              <div className="mt-3 text-[11px] text-ink-500 border-t border-ink-800 pt-2">
                Signed by <span className="text-ink-300">{r.doctorName}</span> · {r.doctorLicense}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A day picker; the value is YYYY-MM-DD, or '' when cleared. */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="block">
      <span className="rx-label">{label}</span>
      <input
        id={id}
        type="date"
        className="rx-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
