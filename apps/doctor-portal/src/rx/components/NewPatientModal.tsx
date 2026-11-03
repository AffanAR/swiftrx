import React from 'react';
import { useApp, actions } from '../store';
import {
  KIDNEY_LABELS,
  Kbd,
  PREGNANCY_LABELS,
  cx,
  dateOfBirthForAge,
  kidneyBand,
  pregnancyFor,
  type KidneyFunction,
  type PregnancyStatus,
} from '@swiftrx/shared';
import { ChipRow, KIDNEY_CHOICES, PREGNANCY_CHOICES, Row, inputCls } from './PatientFormParts';

type FieldKey = 'name' | 'age' | 'sex' | 'weightKg' | 'contact' | 'allergy' | 'problem';

export function NewPatientModal() {
  const open = useApp((s) => s.showNewPatient);
  const saving = useApp((s) => s.savingPatient);
  const [name, setName] = React.useState('');
  const [age, setAge] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [sex, setSex] = React.useState<'M' | 'F'>('M');
  const [pregnancy, setPregnancy] = React.useState<PregnancyStatus>('unknown');
  const [kidney, setKidney] = React.useState<KidneyFunction>('unknown');
  const [egfr, setEgfr] = React.useState('');
  const [weight, setWeight] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [allergies, setAllergies] = React.useState<string[]>([]);
  // With no allergies listed: did the patient say "none", or did nobody ask?
  const [noneKnown, setNoneKnown] = React.useState(false);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [activeField, setActiveField] = React.useState<FieldKey>('name');

  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Reset + focus name field next frame
      setName('');
      setAge('');
      setDateOfBirth('');
      setSex('M');
      setPregnancy('unknown');
      setKidney('unknown');
      setEgfr('');
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
  // A date of birth wins; an age alone gives an estimated one. 0 years is a
  // baby, so it's allowed.
  const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && Date.parse(dateOfBirth) <= Date.now();
  const ageOk = dobOk || (/^\d+$/.test(age.trim()) && ageNum >= 0 && ageNum < 130);
  const egfrNum = parseFloat(egfr);
  const egfrOk = egfr.trim() === '' || (egfrNum > 0 && egfrNum <= 200);
  const weightOk = !Number.isNaN(weightNum) && weightNum > 0 && weightNum < 400;
  const canSubmit = nameOk && ageOk && weightOk && egfrOk && !saving;

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
      actions.setBanner({
        kind: 'warn',
        text: 'Fill name, age or date of birth, and weight to continue.',
      });
      return;
    }
    const birth = dobOk
      ? { dateOfBirth }
      : { dateOfBirth: dateOfBirthForAge(ageNum), dateOfBirthEstimated: true as const };
    const id = await actions.createPatient({
      name: name.trim(),
      ...birth,
      sex,
      weightKg: weightNum,
      contact: contact.trim() || '—',
      pregnancy: pregnancyFor({ sex, dateOfBirth: birth.dateOfBirth }, pregnancy),
      // An eGFR result decides the band, unless the patient is on dialysis.
      ...(egfr.trim() !== ''
        ? { egfr: egfrNum, kidney: kidney === 'dialysis' ? 'dialysis' : kidneyBand(egfrNum) }
        : { kidney }),
      allergyStatus: allergies.length > 0 ? 'recorded' : noneKnown ? 'none_known' : 'not_recorded',
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
              Required: name · age or date of birth · weight &nbsp;·&nbsp; <Kbd>Esc</Kbd> to close,{' '}
              <Kbd>⌘↵</Kbd> to save
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

          <div className="grid grid-cols-4 gap-3">
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
            <Row label="or date of birth">
              <input
                type="date"
                value={dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={inputCls(false, dateOfBirth === '' || dobOk)}
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

          <div className="grid grid-cols-3 gap-3">
            <Row label="Pregnancy">
              <select
                value={sex === 'M' ? 'not_applicable' : pregnancy}
                disabled={sex === 'M'}
                onChange={(e) => setPregnancy(e.target.value as PregnancyStatus)}
                className={inputCls(false, true)}
              >
                {PREGNANCY_CHOICES.map((p) => (
                  <option key={p} value={p}>
                    {PREGNANCY_LABELS[p]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Kidney function">
              <select
                value={
                  egfr.trim() !== '' && egfrOk && kidney !== 'dialysis'
                    ? kidneyBand(egfrNum)
                    : kidney
                }
                onChange={(e) => setKidney(e.target.value as KidneyFunction)}
                className={inputCls(false, true)}
              >
                {KIDNEY_CHOICES.map((k) => (
                  <option key={k} value={k}>
                    {KIDNEY_LABELS[k]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="eGFR (if known)">
              <input
                inputMode="decimal"
                value={egfr}
                onChange={(e) => setEgfr(e.target.value)}
                placeholder="mL/min/1.73 m²"
                className={inputCls(false, egfrOk)}
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
          {allergies.length === 0 && (
            <label className="-mt-2 flex items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                checked={noneKnown}
                onChange={(e) => setNoneKnown(e.target.checked)}
              />
              No known allergies (asked the patient)
            </label>
          )}

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
              <span>Need name, age or date of birth, and weight</span>
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
