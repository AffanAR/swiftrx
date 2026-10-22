import * as React from 'react';
import {
  LiveDot,
  Card,
  TextField,
  cx,
  listPatientsForHospital,
  MOCK_PATIENTS,
  appendAudit,
  type Hospital,
  type User,
  type Patient,
} from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

export function PatientsPage({ hospital, user }: Props) {
  const [patients, setPatients] = React.useState<Patient[]>(() =>
    listPatientsForHospital(hospital.slug),
  );
  const [query, setQuery] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    age: '',
    sex: 'M' as 'M' | 'F',
    weight: '',
    contact: '',
  });

  const filtered = patients.filter(
    (p) =>
      !query.trim() ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.contact.toLowerCase().includes(query.toLowerCase()) ||
      p.activeProblems.some((ap) => ap.toLowerCase().includes(query.toLowerCase())),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const age = parseInt(form.age, 10);
    const weight = parseFloat(form.weight);
    if (!name || !age || !weight) return;
    const id = 'p_' + Math.random().toString(36).slice(2, 9);
    const p: Patient = {
      id,
      hospitalSlug: hospital.slug,
      name,
      age,
      sex: form.sex,
      weightKg: weight,
      contact: form.contact.trim() || '—',
      allergies: [],
      activeProblems: [],
      activeMedications: [],
      recentVitals: [
        { label: 'BP', value: '—' },
        { label: 'Pulse', value: '—' },
        { label: 'SpO2', value: '—' },
      ],
      createdAt: new Date().toISOString(),
    };
    MOCK_PATIENTS.push(p);
    appendAudit({
      kind: 'create_patient',
      userId: user.id,
      userEmail: user.email,
      at: new Date().toISOString(),
      hospitalSlug: hospital.slug,
      patientId: id,
      patientName: name,
    });
    setPatients(listPatientsForHospital(hospital.slug));
    setForm({ name: '', age: '', sex: 'M', weight: '', contact: '' });
    setAdding(false);
  };

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-4 animate-fadeIn">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Patients</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Roster</h1>
          <p className="text-sm text-ink-400">
            {patients.length} patient{patients.length === 1 ? '' : 's'} on file
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="rx-shine rx-btn-primary">
          + Add patient
        </button>
      </header>

      <div className="max-w-md">
        <TextField
          label="Search"
          value={query}
          onChange={setQuery}
          placeholder="Name, contact, or condition…"
        />
      </div>

      <Card>
        <ul className="divide-y divide-ink-800">
          {filtered.map((p, i) => (
            <li
              key={p.id}
              className="py-3 flex items-center gap-3 animate-fadeIn"
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <div className="h-9 w-9 rounded-md bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center font-bold text-rx-accent">
                {p.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-100">{p.name}</div>
                <div className="text-[11px] text-ink-400 font-mono">
                  {p.age}
                  {p.sex} · {p.weightKg}kg · {p.contact}
                </div>
                {p.activeProblems.length > 0 && (
                  <div className="mt-1 text-[11px] text-ink-300">
                    {p.activeProblems.join(' · ')}
                  </div>
                )}
              </div>
              {p.allergies.length > 0 ? (
                <span className="text-[10px] font-semibold text-rx-danger bg-rx-danger/15 border border-rx-danger/30 rounded px-1.5 py-0.5">
                  ⚠ {p.allergies.join(', ')}
                </span>
              ) : (
                <span className="text-[10px] text-ink-500 border border-ink-700 rounded px-1.5 py-0.5">
                  no allergies
                </span>
              )}
            </li>
          ))}
          {!filtered.length && (
            <li className="py-6 text-center text-sm text-ink-400 italic">No patients match.</li>
          )}
        </ul>
      </Card>

      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAdding(false);
          }}
        >
          <form
            onSubmit={submit}
            className="w-[min(560px,92vw)] rounded-xl border border-ink-700 bg-ink-800 shadow-2xl animate-slideUpIn"
          >
            <div className="px-5 py-3 border-b border-ink-700">
              <h3 className="text-base font-semibold">Add patient</h3>
              <p className="text-xs text-ink-400">Saved to {hospital.name}'s roster.</p>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <TextField
                  label="Full name"
                  value={form.name}
                  onChange={(v: string) => setForm((f) => ({ ...f, name: v }))}
                  required
                  autoFocus
                />
              </div>
              <TextField
                label="Age"
                type="number"
                value={form.age}
                onChange={(v: string) => setForm((f) => ({ ...f, age: v }))}
                required
              />
              <div>
                <span className="rx-label">Sex</span>
                <div className="flex gap-1">
                  {(['M', 'F'] as const).map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setForm((f) => ({ ...f, sex: s }))}
                      className={cx(
                        'flex-1 h-9 rounded-md border text-sm font-medium transition-colors',
                        form.sex === s
                          ? 'bg-rx-accent text-ink-900 border-rx-accent'
                          : 'bg-ink-900/40 text-ink-200 border-ink-700 hover:bg-ink-700/40',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <TextField
                label="Weight (kg)"
                type="number"
                value={form.weight}
                onChange={(v: string) => setForm((f) => ({ ...f, weight: v }))}
                required
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Contact"
                  value={form.contact}
                  onChange={(v: string) => setForm((f) => ({ ...f, contact: v }))}
                  placeholder="Phone or MRN"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-700 bg-ink-900/40">
              <button type="button" className="rx-btn-ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" className="rx-shine rx-btn-primary">
                Create patient
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
