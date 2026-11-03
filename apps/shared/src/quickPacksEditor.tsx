// =============================================================================
//  SwiftRx Shared — The quick-pack editor
// =============================================================================
//  One hospital's quick packs, a diagnosis at a time: for each of its three
//  slots (Alt+1/2/3), the default pack from the catalog, the hospital's own
//  pack that replaces it, or nothing when the hospital hides the default.
//  The admin panel (the SwiftRx team) and the portal's Quick packs page (the
//  hospital's own admins) both use it; the server checks every change
//  (apps/api/src/quickPacks.ts) and audits it.
// =============================================================================

import * as React from 'react';
import { Card, Select, TextField } from './components';
import { isHiddenSlot } from './quickPacks';
import { useHideQuickPack, useRemoveQuickPack, useSetQuickPack } from './queries';
import type {
  Catalog,
  DoseUnit,
  Drug,
  Frequency,
  HospitalQuickPacks,
  QuickPack,
  QuickPackMed,
  QuickPackSlot,
} from './types';
import { cx } from './ui';

export function QuickPacksEditor({
  slug,
  catalog,
  own,
}: {
  slug: string;
  /** For the diagnoses, the default packs and the medicines to pick from. */
  catalog: Pick<Catalog, 'diagnoses' | 'drugs' | 'quickPacks'>;
  own: HospitalQuickPacks;
}) {
  const [code, setCode] = React.useState(() => catalog.diagnoses[0]?.code ?? '');
  const changedIn = (dx: string) =>
    [...own.packs, ...own.hidden].filter((p) => p.diagnosisCode === dx).length;

  return (
    <div className="space-y-5">
      <div className="max-w-sm">
        <Select
          label="Diagnosis"
          value={code}
          onChange={setCode}
          options={catalog.diagnoses.map((d) => ({
            value: d.code,
            label: `${d.code} · ${d.name}${changedIn(d.code) ? ` (${changedIn(d.code)} changed)` : ''}`,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['1', '2', '3'] as const).map((key) => {
          const slot = { diagnosisCode: code, shortcutKey: key };
          return (
            <SlotCard
              // Keyed by slot, so switching diagnosis starts each card afresh.
              key={`${code}#${key}`}
              slug={slug}
              slot={slot}
              own={own.packs.find((p) => p.diagnosisCode === code && p.shortcutKey === key)}
              hidden={isHiddenSlot(own, slot)}
              fallback={catalog.quickPacks.find(
                (p) => p.diagnosisCode === code && p.shortcutKey === key,
              )}
              drugs={catalog.drugs}
            />
          );
        })}
      </div>
    </div>
  );
}

function SlotCard({
  slug,
  slot,
  own,
  hidden,
  fallback,
  drugs,
}: {
  slug: string;
  slot: QuickPackSlot;
  /** The hospital's own pack in this slot, if it has one. */
  own?: QuickPack;
  /** Whether the hospital hides the default here. */
  hidden: boolean;
  /** The catalog's default pack in this slot, if there is one. */
  fallback?: QuickPack;
  drugs: Drug[];
}) {
  const [editing, setEditing] = React.useState(false);
  const remove = useRemoveQuickPack(slug);
  const hide = useHideQuickPack(slug);
  const shown = hidden ? undefined : (own ?? fallback);
  const failed = remove.error ?? hide.error;

  return (
    <Card
      subtitle={`Alt+${slot.shortcutKey}`}
      title={own ? 'Own pack' : hidden ? 'Hidden' : fallback ? 'Default pack' : 'Empty'}
      right={
        own || hidden ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rx-accent/15 text-rx-accent border border-rx-accent/30">
            this hospital
          </span>
        ) : null
      }
    >
      {editing ? (
        <PackEditor
          slug={slug}
          slot={slot}
          start={own ?? fallback}
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
          ) : hidden ? (
            <p className="text-sm text-ink-400 italic">
              The default pack is hidden; doctors see no pack here.
            </p>
          ) : (
            <p className="text-sm text-ink-400 italic">No pack in this slot.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="rx-btn-ghost" onClick={() => setEditing(true)}>
              {own ? 'Edit' : 'Set own pack'}
            </button>
            {fallback && !own && !hidden && (
              <button
                className="rx-btn-ghost"
                disabled={hide.isPending}
                onClick={() => hide.mutate(slot)}
              >
                Hide the default
              </button>
            )}
            {(own || hidden) && (
              <button
                className="rx-btn-ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(slot)}
              >
                {fallback ? 'Use the default' : 'Remove'}
              </button>
            )}
          </div>
          {failed && (
            <p role="alert" className="text-xs text-rx-danger">
              Couldn't change it: {failed.message}
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
  slot: QuickPackSlot;
  /** What the form starts from: the slot's own pack, or its default. */
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
