import React from 'react';
import { useApp, actions } from '../store';
import { Kbd, cx } from '@swiftrx/shared';

type FieldKey = 'name' | 'age' | 'sex' | 'weightKg' | 'contact' | 'allergy' | 'problem';

export function NewPatientModal() {
  const open = useApp((s) => s.showNewPatient);
  const saving = useApp((s) => s.savingPatient);
  const [name, setName] = React.useState('');
  const [age, setAge] = React.useState('');
  const [sex, setSex] = React.useState<'M' | 'F'>('M');
  const [weight, setWeight] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [allergies, setAllergies] = React.useState<string[]>([]);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [activeField, setActiveField] = React.useState<FieldKey>('name');

  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Reset + focus name field next frame
      setName('');
      setAge('');
      setSex('M');
      setWeight('');
      setContact('');
      setAllergies([]);
      setProblems([]);
      setActiveField('name');
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open]);

  // Latest submit handler, so the window listener below never sees stale form state.
  const submitRef = React.useRef<() => void>(() => {});

  // Esc closes the modal; Cmd/Ctrl+Enter saves it. Capture phase + stopPropagation
  // keeps these keys away from the workspace hotkeys (e.g. Cmd+Enter = Sign & Print).
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        actions.closeNewPatient();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  if (!open) return null;

  const nameOk = name.trim().length >= 2;
  const ageNum = parseInt(age, 10);
  const weightNum = parseFloat(weight);
  const ageOk = !Number.isNaN(ageNum) && ageNum > 0 && ageNum < 130;
  const weightOk = !Number.isNaN(weightNum) && weightNum > 0 && weightNum < 400;
  const canSubmit = nameOk && ageOk && weightOk && !saving;

  const addChip = (kind: 'allergy' | 'problem', value: string) => {
    const v = value.trim();
    if (!v) return;
    if (kind === 'allergy') {
      if (allergies.some((a) => a.toLowerCase() === v.toLowerCase())) return;
      setAllergies((a) => [...a, v]);
    } else {
      if (problems.some((p) => p.toLowerCase() === v.toLowerCase())) return;
      setProblems((p) => [...p, v]);
    }
  };

  const removeChip = (kind: 'allergy' | 'problem', value: string) => {
    if (kind === 'allergy') {
      setAllergies((a) => a.filter((x) => x !== value));
    } else {
      setProblems((p) => p.filter((x) => x !== value));
    }
  };

  const submit = async () => {
    if (saving) return;
    if (!canSubmit) {
      actions.setBanner({ kind: 'warn', text: 'Fill name, age, and weight to continue.' });
      return;
    }
    const id = await actions.createPatient({
      name: name.trim(),
      age: ageNum,
      sex,
      weightKg: weightNum,
      contact: contact.trim() || '—',
      allergies,
      activeProblems: problems,
    });
    // Once saved, createPatient closes the modal; continue the keyboard flow at
    // diagnosis. If saving failed the modal stays open and a banner says why.
    if (!id) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-zone="diagnosis"]')?.focus();
    });
  };
  submitRef.current = submit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Click-outside-to-close as a real button, so it is announced and
         reachable instead of being a mouse-only affordance on the overlay. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close new patient"
        className="absolute inset-0 cursor-default"
        onClick={actions.closeNewPatient}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-title"
        className="relative w-[min(640px,92vw)] rounded-xl border border-ink-700 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
          <div>
            <h3 id="new-patient-title" className="text-base font-semibold tracking-tight">
              New Patient
            </h3>
            <p className="text-xs text-ink-400">
              Required: name · age · weight &nbsp;·&nbsp; <Kbd>Esc</Kbd> to close, <Kbd>⌘↵</Kbd> to
              save
            </p>
          </div>
          <button
            onClick={() => actions.closeNewPatient()}
            className="text-ink-400 hover:text-ink-100 text-sm px-2 py-1 rounded hover:bg-ink-700/40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Row label="Full name">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bilal Ahmed"
              className={inputCls(activeField === 'name', name.length === 0 || nameOk)}
              onFocus={() => setActiveField('name')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (nameOk) setActiveField('age');
                }
              }}
            />
          </Row>

          <div className="grid grid-cols-3 gap-3">
            <Row label="Age">
              <input
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="yrs"
                className={inputCls(activeField === 'age', age === '' || ageOk)}
                onFocus={() => setActiveField('age')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ageOk) setActiveField('weightKg');
                }}
              />
            </Row>
            <Row label="Sex">
              <div className="flex gap-1">
                {(['M', 'F'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSex(s)}
                    className={cx(
                      'flex-1 h-9 rounded-md border text-sm font-medium transition-colors',
                      sex === s
                        ? 'bg-rx-accent text-ink-900 border-rx-accent'
                        : 'bg-ink-900/40 text-ink-200 border-ink-700 hover:bg-ink-700/40',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Weight (kg)">
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="kg"
                className={inputCls(activeField === 'weightKg', weight === '' || weightOk)}
                onFocus={() => setActiveField('weightKg')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && weightOk) setActiveField('contact');
                }}
              />
            </Row>
          </div>

          <Row label="Contact">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="phone or MRN"
              className={inputCls(activeField === 'contact', true)}
              onFocus={() => setActiveField('contact')}
            />
          </Row>

          <ChipRow
            label="Allergies"
            chips={allergies}
            placeholder="e.g. Penicillin, Sulfa"
            accent="danger"
            onAdd={(v) => addChip('allergy', v)}
            onRemove={(v) => removeChip('allergy', v)}
          />

          <ChipRow
            label="Active problems"
            chips={problems}
            placeholder="e.g. Hypertension, DM"
            accent="accent"
            onAdd={(v) => addChip('problem', v)}
            onRemove={(v) => removeChip('problem', v)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ink-700 bg-ink-900/40">
          <div className="text-xs text-ink-400">
            {canSubmit ? (
              <span className="text-rx-accent">Ready to create</span>
            ) : (
              <span>Need name, age, and weight</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => actions.closeNewPatient()}
              className="px-3 py-2 rounded-md border border-ink-700 text-ink-200 hover:bg-ink-700/40 text-sm"
            >
              Cancel <Kbd>Esc</Kbd>
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className={cx(
                'px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-colors',
                canSubmit
                  ? 'bg-rx-accent text-ink-900 hover:bg-rx-accentDark hover:text-white'
                  : 'bg-ink-700 text-ink-400 cursor-not-allowed',
              )}
            >
              {saving ? 'Saving…' : 'Create patient'} <Kbd dark>⌘↵</Kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-ink-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ChipRow({
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
          placeholder={chips.length ? '' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder-ink-500"
        />
      </div>
    </div>
  );
}

function inputCls(active: boolean, valid: boolean) {
  return cx(
    'w-full h-9 rounded-md border bg-ink-900/40 px-3 text-sm text-ink-100 outline-none transition-colors',
    active ? 'border-rx-focus ring-1 ring-rx-focus/40' : 'border-ink-700',
    valid ? '' : 'border-rx-warn/60',
  );
}
