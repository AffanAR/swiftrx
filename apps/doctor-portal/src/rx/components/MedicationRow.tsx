import React from 'react';
import { useApp, actions } from '../store';
import {
  MOCK_DRUGS,
  cx,
  type DoseUnit,
  type Frequency,
  type RxMedication,
  type Severity,
} from '@swiftrx/shared';
import { evaluateMedication, findDrug, severityRank } from '../safety';

interface RowProps {
  med: RxMedication;
  index: number;
}

const UNITS: DoseUnit[] = ['mg', 'ml', 'g', 'mcg', 'tablets'];
const FREQS: Frequency[] = ['QD', 'BID', 'TID', 'QID', 'PRN', 'QHS'];

export function MedicationRow({ med, index }: RowProps) {
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);
  const active = useApp((s) => s.activeRowId === med.rowId);
  const setActive = actions.setActiveRow;
  const update = actions.updateMedication;
  const remove = actions.removeMedication;

  const alerts = React.useMemo(() => evaluateMedication(med, patient, MOCK_DRUGS), [med, patient]);
  const worstSeverity = alerts.reduce<Severity | null>((acc, a) => {
    const r = severityRank(a.severity);
    if (!acc || r > severityRank(acc)) return a.severity;
    return acc;
  }, null);

  // Signing refuses these (see store.sign); flag the row so the doctor sees why.
  const invalidAmount = !(med.dosage.value > 0) || !(med.durationDays > 0);

  const borderColor =
    worstSeverity === 'critical' || invalidAmount
      ? 'border-rx-danger/70 bg-rx-danger/5'
      : worstSeverity === 'moderate'
      ? 'border-rx-warn/60 bg-rx-warn/5'
      : 'border-ink-700';

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && (e.currentTarget as HTMLInputElement).value === '') {
      e.preventDefault();
      remove(med.rowId);
    }
  };

  return (
    <div
      className={cx(
        'rounded-md border px-3 py-2 transition-colors',
        borderColor,
        active && 'ring-2 ring-rx-focus/60',
      )}
      onFocus={() => setActive(med.rowId)}
      onMouseDown={() => setActive(med.rowId)}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-400 font-mono w-5 text-right">{index + 1}.</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 truncate">
            <span className="font-semibold text-sm">{med.genericName}</span>
            {med.brandName && (
              <span className="text-xs text-ink-400">← {med.brandName}</span>
            )}
          </div>
          <div className="text-[11px] text-ink-400 font-mono">{findDrug(med.drugId, MOCK_DRUGS)?.therapeuticClass}</div>
        </div>

        <NumberInput
          value={med.dosage.value}
          onChange={(v) => update(med.rowId, { dosage: { ...med.dosage, value: v } })}
          onKeyDown={onKey}
          className="w-16"
          ariaLabel="Dose"
        />
        <select
          className="bg-ink-800 border border-ink-700 rounded px-1.5 py-1 text-xs"
          value={med.dosage.unit}
          onChange={(e) => update(med.rowId, { dosage: { ...med.dosage, unit: e.target.value as DoseUnit } })}
        >
          {UNITS.map((u) => <option key={u}>{u}</option>)}
        </select>

        <select
          className="bg-ink-800 border border-ink-700 rounded px-1.5 py-1 text-xs"
          value={med.frequency}
          onChange={(e) => update(med.rowId, { frequency: e.target.value as Frequency })}
        >
          {FREQS.map((f) => <option key={f}>{f}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <NumberInput
            value={med.durationDays}
            onChange={(v) => update(med.rowId, { durationDays: v })}
            className="w-12"
            ariaLabel="Duration days"
          />
          <span className="text-[10px] text-ink-400">days</span>
        </div>

        <input
          type="text"
          placeholder="Sig / instructions"
          value={med.instructions}
          onChange={(e) => update(med.rowId, { instructions: e.target.value })}
          onKeyDown={onKey}
          className="w-40 bg-ink-800 border border-ink-700 rounded px-2 py-1 text-xs focus:border-rx-focus"
        />

        <button
          onClick={() => remove(med.rowId)}
          className="text-ink-400 hover:text-rx-danger text-sm px-1"
          title="Remove (Backspace on empty)"
        >
          ✕
        </button>
      </div>

      {(alerts.length > 0 || invalidAmount) && (
        <ul className="mt-1.5 space-y-0.5">
          {invalidAmount && (
            <li className="text-[11px] px-2 py-0.5 rounded bg-rx-danger/15 text-rx-danger">
              <span className="font-semibold uppercase tracking-wider mr-1">[required]</span>
              Dose and duration must be greater than 0.
            </li>
          )}
          {alerts.map((a, i) => (
            <li
              key={i}
              className={cx(
                'text-[11px] px-2 py-0.5 rounded',
                a.severity === 'critical' && 'bg-rx-danger/15 text-rx-danger',
                a.severity === 'moderate' && 'bg-rx-warn/15 text-rx-warn',
                a.severity === 'low' && 'bg-ink-700/60 text-ink-300',
              )}
            >
              <span className="font-semibold uppercase tracking-wider mr-1">[{a.severity}]</span>
              {a.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NumberInput({
  value, onChange, className, onKeyDown, ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      onKeyDown={onKeyDown}
      className={cx(
        'bg-ink-800 border border-ink-700 rounded px-1.5 py-1 text-xs font-mono focus:border-rx-focus',
        className,
      )}
    />
  );
}