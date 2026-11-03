import React from 'react';
import { useApp, actions } from '../store';
import {
  KIDNEY_LABELS,
  Kbd,
  PREGNANCY_LABELS,
  ageSexLabel,
  kidneyBand,
  pregnancyFor,
  type KidneyFunction,
  type Patient,
  type PregnancyStatus,
} from '@swiftrx/shared';
import { ChipRow, KIDNEY_CHOICES, PREGNANCY_CHOICES, Row, inputCls } from './PatientFormParts';

/**
 * Edits the selected patient's facts that change and that the safety checks
 * use: weight, allergies, pregnancy, kidney function, and their current
 * medicines and problems. Name, sex and date of birth stay as added.
 */
export function EditPatientModal() {
  const open = useApp((s) => s.showEditPatient);
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId));
  if (!open || !patient) return null;
  // Keyed by patient, so the form starts again from the stored facts each time.
  return <EditPatientForm key={patient.id} patient={patient} />;
}

function EditPatientForm({ patient }: { patient: Patient }) {
  const saving = useApp((s) => s.savingPatient);
  const [weight, setWeight] = React.useState(String(patient.weightKg));
  const [allergies, setAllergies] = React.useState(patient.allergies);
  const [noneKnown, setNoneKnown] = React.useState(patient.allergyStatus === 'none_known');
  const [pregnancy, setPregnancy] = React.useState<PregnancyStatus>(patient.pregnancy);
  const [kidney, setKidney] = React.useState<KidneyFunction>(patient.kidney);
  const [egfr, setEgfr] = React.useState(patient.egfr === undefined ? '' : String(patient.egfr));
  const [problems, setProblems] = React.useState(patient.activeProblems);
  const [meds, setMeds] = React.useState(patient.activeMedications);
  const weightRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    requestAnimationFrame(() => weightRef.current?.focus());
  }, []);

  const weightNum = parseFloat(weight);
  const weightOk = weightNum > 0 && weightNum < 400;
  const egfrNum = parseFloat(egfr);
  const egfrOk = egfr.trim() === '' || (egfrNum > 0 && egfrNum <= 200);
  const medsOk = meds.every((m) => m.name.trim());
  // Pregnancy doesn't apply to a man or a young child; the server agrees.
  const pregnancyApplies = pregnancyFor(patient, 'unknown') !== 'not_applicable';
  const canSave = weightOk && egfrOk && medsOk && !saving;

  const save = async () => {
    if (!canSave) {
      actions.setBanner({ kind: 'warn', text: 'Fix the weight, eGFR or medicine names to save.' });
      return;
    }
    const kept = meds.map((m) => ({ name: m.name.trim(), dose: m.dose.trim() }));
    await actions.updatePatient({
      weightKg: weightNum,
      pregnancy: pregnancyApplies ? pregnancy : 'not_applicable',
      // An eGFR result decides the band, unless the patient is on dialysis.
      ...(egfr.trim() !== ''
        ? { egfr: egfrNum, kidney: kidney === 'dialysis' ? 'dialysis' : kidneyBand(egfrNum) }
        : { kidney }),
      allergyStatus: allergies.length > 0 ? 'recorded' : noneKnown ? 'none_known' : 'not_recorded',
      allergies,
      activeProblems: problems,
      activeMedications: kept,
    });
  };
  const saveRef = React.useRef(save);
  saveRef.current = save;

  // Esc closes, Cmd/Ctrl+Enter saves; captured so the pad's own keys don't fire.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        actions.closeEditPatient();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const addChip = (list: string[], set: (l: string[]) => void, value: string) => {
    const v = value.trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) set([...list, v]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close patient details"
        className="absolute inset-0 cursor-default"
        onClick={actions.closeEditPatient}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-patient-title"
        className="relative w-[min(640px,92vw)] max-h-[92vh] overflow-y-auto rounded-xl border border-ink-700 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
          <div>
            <h3 id="edit-patient-title" className="text-base font-semibold tracking-tight">
              {patient.name} · {ageSexLabel(patient)}
            </h3>
            <p className="text-xs text-ink-400">
              What the safety checks use. <Kbd>Esc</Kbd> to close, <Kbd>⌘↵</Kbd> to save
            </p>
          </div>
          <button
            onClick={actions.closeEditPatient}
            className="text-ink-400 hover:text-ink-100 text-sm px-2 py-1 rounded hover:bg-ink-700/40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Row label="Weight (kg)">
              <input
                ref={weightRef}
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputCls(false, weightOk)}
              />
            </Row>
            <Row label="Pregnancy">
              <select
                value={pregnancyApplies ? pregnancy : 'not_applicable'}
                disabled={!pregnancyApplies}
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
            <Row label="eGFR">
              <input
                inputMode="decimal"
                value={egfr}
                onChange={(e) => setEgfr(e.target.value)}
                placeholder="mL/min/1.73 m²"
                className={inputCls(false, egfrOk)}
              />
            </Row>
          </div>

          <ChipRow
            label="Allergies"
            chips={allergies}
            placeholder="e.g. Penicillin, Sulfa"
            accent="danger"
            onAdd={(v) => addChip(allergies, setAllergies, v)}
            onRemove={(v) => setAllergies(allergies.filter((a) => a !== v))}
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
            onAdd={(v) => addChip(problems, setProblems, v)}
            onRemove={(v) => setProblems(problems.filter((p) => p !== v))}
          />

          <div>
            <span className="block text-[11px] uppercase tracking-wider text-ink-400 mb-1">
              Current medicines (checked for interactions)
            </span>
            <div className="space-y-1.5">
              {meds.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={`Medicine ${i + 1}`}
                    value={m.name}
                    onChange={(e) =>
                      setMeds(meds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                    placeholder="e.g. Warfarin"
                    className={inputCls(false, m.name.trim() !== '')}
                  />
                  <input
                    aria-label={`Dose of medicine ${i + 1}`}
                    value={m.dose}
                    onChange={(e) =>
                      setMeds(meds.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))
                    }
                    placeholder="e.g. 5mg QD"
                    className={inputCls(false, true)}
                  />
                  <button
                    onClick={() => setMeds(meds.filter((_, j) => j !== i))}
                    className="px-2 text-ink-400 hover:text-rx-danger"
                    aria-label={`Remove ${m.name || `medicine ${i + 1}`}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setMeds([...meds, { name: '', dose: '' }])}
                className="text-xs text-rx-accent hover:underline"
              >
                + Add a medicine
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-700 bg-ink-900/40">
          <button
            onClick={actions.closeEditPatient}
            className="px-3 py-2 rounded-md border border-ink-700 text-ink-200 hover:bg-ink-700/40 text-sm"
          >
            Cancel <Kbd>Esc</Kbd>
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="px-3 py-2 rounded-md bg-rx-accent text-ink-900 font-medium text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save details'} <Kbd>⌘↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
