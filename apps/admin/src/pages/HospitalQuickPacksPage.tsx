import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuspenseQueries } from '@tanstack/react-query';
import {
  Card,
  HospitalBadge,
  Select,
  TextField,
  cx,
  queries,
  useRemoveQuickPack,
  useSetQuickPack,
  type Drug,
  type DoseUnit,
  type Frequency,
  type QuickPack,
  type QuickPackMed,
} from '@swiftrx/shared';

/**
 * HospitalQuickPacksPage
 * ----------------------
 * The platform admin's editor for one hospital's quick packs. Every hospital
 * starts with the catalog's default packs, up to three per diagnosis on
 * Alt+1/2/3. Setting a pack here replaces the default in that slot for this
 * hospital only; "Use the default" removes it again. The server checks each
 * medicine against the catalog and audits every change.
 */
export function HospitalQuickPacksPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [{ data: hospital }, { data: catalog }, { data: own }] = useSuspenseQueries({
    queries: [queries.hospital(slug), queries.catalog(), queries.quickPacks(slug)],
  });
  const [code, setCode] = React.useState(() => catalog.diagnoses[0]?.code ?? '');

  if (!hospital) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rx-card p-6 text-center animate-fadeIn">
          <h1 className="text-lg font-semibold text-ink-100">Hospital not found</h1>
          <Link to="/hospitals" className="rx-btn-ghost mt-4 inline-flex">
            Back to hospitals
          </Link>
        </div>
      </div>
    );
  }

  const ownCount = (dx: string) => own.filter((p) => p.diagnosisCode === dx).length;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-5 animate-fadeIn">
      <Link
        to={`/hospitals/${hospital.slug}`}
        className="text-xs text-ink-400 hover:text-rx-accent"
      >
        ← {hospital.name}
      </Link>
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <HospitalBadge hospital={hospital} />
          <h1 className="mt-3 text-xl font-semibold text-ink-100">Quick packs</h1>
          <p className="text-sm text-ink-400 max-w-2xl">
            Each diagnosis has up to three packs on Alt+1, Alt+2 and Alt+3. A pack set here replaces
            the default in its slot for {hospital.name} only.
          </p>
        </div>
      </header>

      {!hospital.features.enableQuickPacks && (
        <div role="status" className="rx-card p-3 text-sm text-rx-warn border-rx-warn/40">
          Quick packs are switched off for {hospital.name}, so its doctors see none of these. Switch
          them on under{' '}
          <Link to={`/hospitals/${hospital.slug}/features`} className="underline">
            Features &amp; Rx design
          </Link>
          .
        </div>
      )}

      <div className="max-w-sm">
        <Select
          label="Diagnosis"
          value={code}
          onChange={setCode}
          options={catalog.diagnoses.map((d) => ({
            value: d.code,
            label: `${d.code} · ${d.name}${ownCount(d.code) ? ` (${ownCount(d.code)} own)` : ''}`,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['1', '2', '3'] as const).map((key) => (
          <SlotCard
            // Keyed by slot, so switching diagnosis starts each card afresh.
            key={`${code}#${key}`}
            slug={hospital.slug}
            diagnosisCode={code}
            shortcutKey={key}
            own={own.find((p) => p.diagnosisCode === code && p.shortcutKey === key)}
            fallback={catalog.quickPacks.find(
              (p) => p.diagnosisCode === code && p.shortcutKey === key,
            )}
            drugs={catalog.drugs}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  slug,
  diagnosisCode,
  shortcutKey,
  own,
  fallback,
  drugs,
}: {
  slug: string;
  diagnosisCode: string;
  shortcutKey: QuickPack['shortcutKey'];
  /** The hospital's own pack in this slot, if it has one. */
  own?: QuickPack;
  /** The catalog's default pack in this slot, if there is one. */
  fallback?: QuickPack;
  drugs: Drug[];
}) {
  const [editing, setEditing] = React.useState(false);
  const remove = useRemoveQuickPack(slug);
  const shown = own ?? fallback;

  return (
    <Card
      subtitle={`Alt+${shortcutKey}`}
      title={own ? 'Own pack' : fallback ? 'Default pack' : 'Empty'}
      right={
        own ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rx-accent/15 text-rx-accent border border-rx-accent/30">
            this hospital
          </span>
        ) : null
      }
    >
      {editing ? (
        <PackEditor
          slug={slug}
          slot={{ diagnosisCode, shortcutKey }}
          start={shown}
          drugs={drugs}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-3">
          {shown ? (
            <>
              <ul className="space-y-1">
                {shown.medications.map((m, i) => (
                  <li key={i} className="text-sm text-ink-100">
                    {m.genericName}{' '}
                    <span className="text-ink-400 font-mono text-xs">
                      {m.dosage.value}
                      {m.dosage.unit} {m.frequency} × {m.durationDays}d
                    </span>
                  </li>
                ))}
              </ul>
              {shown.recommendationReason && (
                <p className="text-xs text-ink-400">{shown.recommendationReason}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-400 italic">No pack in this slot.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="rx-btn-ghost" onClick={() => setEditing(true)}>
              {own ? 'Edit' : 'Set own pack'}
            </button>
            {own && (
              <button
                className="rx-btn-ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ diagnosisCode, shortcutKey })}
              >
                {fallback ? 'Use the default' : 'Remove'}
              </button>
            )}
          </div>
          {remove.isError && (
            <p role="alert" className="text-xs text-rx-danger">
              Couldn't remove it: {remove.error.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

const UNITS: DoseUnit[] = ['mg', 'ml', 'g', 'mcg', 'tablets'];
const FREQUENCIES: Frequency[] = ['QD', 'BID', 'TID', 'QID', 'PRN', 'QHS'];

/** A medicine row while it's being edited: numbers as typed. */
interface Row {
  drugId: string;
  value: string;
  unit: DoseUnit;
  frequency: Frequency;
  days: string;
  instructions: string;
}

const rowOf = (m: QuickPackMed): Row => ({
  drugId: m.drugId,
  value: String(m.dosage.value),
  unit: m.dosage.unit,
  frequency: m.frequency,
  days: String(m.durationDays),
  instructions: m.instructions,
});

function PackEditor({
  slug,
  slot,
  start,
  drugs,
  onDone,
}: {
  slug: string;
  slot: { diagnosisCode: string; shortcutKey: QuickPack['shortcutKey'] };
  /** What the form starts from: the slot's current pack, own or default. */
  start?: QuickPack;
  drugs: Drug[];
  onDone: () => void;
}) {
  const save = useSetQuickPack(slug);
  const [reason, setReason] = React.useState(start?.recommendationReason ?? '');
  const [rows, setRows] = React.useState<Row[]>(() => start?.medications.map(rowOf) ?? []);
  const byId = React.useMemo(() => new Map(drugs.map((d) => [d.id, d])), [drugs]);

  const valid =
    rows.length > 0 &&
    rows.every(
      (r) =>
        byId.has(r.drugId) &&
        Number(r.value) > 0 &&
        Number.isInteger(Number(r.days)) &&
        Number(r.days) > 0,
    );

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate(
      {
        ...slot,
        recommendationReason: reason.trim(),
        medications: rows.map((r) => ({
          drugId: r.drugId,
          genericName: byId.get(r.drugId)!.genericName,
          dosage: { value: Number(r.value), unit: r.unit },
          frequency: r.frequency,
          durationDays: Number(r.days),
          instructions: r.instructions.trim(),
        })),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <TextField
        label="Why this pack"
        value={reason}
        onChange={setReason}
        placeholder="Shown to the doctor under the pack"
      />
      {rows.map((r, i) => (
        <fieldset key={i} className="rounded-md border border-ink-700 p-2 space-y-2">
          <legend className="px-1 text-[11px] text-ink-400">Medicine {i + 1}</legend>
          <DrugPicker
            drugs={drugs}
            value={byId.get(r.drugId)}
            onChange={(d) =>
              update(i, {
                drugId: d.id,
                ...(d.defaultDosage
                  ? { value: String(d.defaultDosage.value), unit: d.defaultDosage.unit }
                  : {}),
                ...(d.defaultFrequency ? { frequency: d.defaultFrequency } : {}),
                ...(d.defaultDurationDays ? { days: String(d.defaultDurationDays) } : {}),
              })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Dose"
              type="number"
              value={r.value}
              onChange={(v) => update(i, { value: v })}
            />
            <Select
              label="Unit"
              value={r.unit}
              onChange={(v) => update(i, { unit: v })}
              options={UNITS.map((u) => ({ value: u, label: u }))}
            />
            <Select
              label="How often"
              value={r.frequency}
              onChange={(v) => update(i, { frequency: v })}
              options={FREQUENCIES.map((f) => ({ value: f, label: f }))}
            />
            <TextField
              label="Days"
              type="number"
              value={r.days}
              onChange={(v) => update(i, { days: v })}
            />
          </div>
          <TextField
            label="Instructions"
            value={r.instructions}
            onChange={(v) => update(i, { instructions: v })}
          />
          <button
            type="button"
            className="text-xs text-ink-400 hover:text-rx-danger"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove medicine {i + 1}
          </button>
        </fieldset>
      ))}
      {rows.length < 10 && (
        <button
          type="button"
          className="text-xs text-rx-accent hover:underline"
          onClick={() =>
            setRows([
              ...rows,
              { drugId: '', value: '', unit: 'mg', frequency: 'QD', days: '5', instructions: '' },
            ])
          }
        >
          + Add a medicine
        </button>
      )}
      {save.isError && (
        <p role="alert" className="text-xs text-rx-danger">
          Couldn't save: {save.error.message}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" className="rx-btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="rx-btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save pack'}
        </button>
      </div>
    </form>
  );
}

/** Finds a generic by name; the catalog has about 1,700. */
function DrugPicker({
  drugs,
  value,
  onChange,
}: {
  drugs: Drug[];
  value?: Drug;
  onChange: (d: Drug) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return drugs
      .filter((d) => d.genericName.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.genericName.toLowerCase().startsWith(q)) -
            Number(a.genericName.toLowerCase().startsWith(q)) ||
          Number(b.safetyReviewed) - Number(a.safetyReviewed),
      )
      .slice(0, 8);
  }, [drugs, query]);

  return (
    <div className="relative">
      <label htmlFor={id} className="rx-label">
        Medicine
      </label>
      <input
        id={id}
        className={cx('rx-input w-full', !value && 'border-rx-warn/60')}
        value={open ? query : (value?.genericName ?? query)}
        placeholder="Search generics…"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-ink-700 bg-ink-800 shadow-xl overflow-hidden">
          {matches.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-ink-700/60 flex justify-between gap-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(d);
                  setOpen(false);
                }}
              >
                <span className="truncate">{d.genericName}</span>
                {!d.safetyReviewed && (
                  <span className="shrink-0 text-[10px] text-rx-warn">no safety data</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
