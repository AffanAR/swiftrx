// Pieces the patient forms share (NewPatientModal, EditPatientModal): a
// labelled row, a chip list for allergies and problems, the input style, and
// the pregnancy and kidney choices in the order the forms offer them.
import React from 'react';
import { cx, type KidneyFunction, type PregnancyStatus } from '@swiftrx/shared';

export const PREGNANCY_CHOICES: PregnancyStatus[] = [
  'unknown',
  'not_pregnant',
  'pregnant',
  'breastfeeding',
  'not_applicable',
];
export const KIDNEY_CHOICES: KidneyFunction[] = [
  'unknown',
  'normal',
  'moderate',
  'severe',
  'failure',
  'dialysis',
];

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function ChipRow({
  label,
  chips,
  placeholder,
  accent,
  onAdd,
  onRemove,
}: {
  label: string;
  chips: string[];
  placeholder: string;
  accent: 'danger' | 'accent';
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [v, setV] = React.useState('');
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wider text-ink-400 mb-1">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900/40 p-1.5 min-h-9 transition-colors focus-within:border-rx-focus">
        {chips.map((c) => (
          <span
            key={c}
            className={cx(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border',
              accent === 'danger'
                ? 'bg-rx-danger/15 text-rx-danger border-rx-danger/30'
                : 'bg-rx-accent/15 text-rx-accent border-rx-accent/30',
            )}
          >
            {c}
            <button
              onClick={() => onRemove(c)}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove ${c}`}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              onAdd(v);
              setV('');
            } else if (e.key === 'Backspace' && !v && chips.length) {
              onRemove(chips[chips.length - 1]);
            }
          }}
          aria-label={label}
          placeholder={chips.length ? '' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder-ink-500"
        />
      </div>
    </div>
  );
}

export function inputCls(active: boolean, valid: boolean) {
  return cx(
    'w-full h-9 rounded-md border bg-ink-900/40 px-3 text-sm text-ink-100 outline-none transition-colors',
    active ? 'border-rx-focus ring-1 ring-rx-focus/40' : 'border-ink-700',
    valid ? '' : 'border-rx-warn/60',
  );
}
