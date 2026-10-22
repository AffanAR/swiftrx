import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TextField,
  Select,
  Card,
  LiveDot,
  Spinner,
  normalizeSlug,
  appendAudit,
  DEFAULT_HOSPITAL_FEATURES,
  DEFAULT_RX_DESIGN,
} from '@swiftrx/shared';
import { MOCK_HOSPITALS } from '@swiftrx/shared';

export function NewHospitalPage() {
  const navigate = useNavigate();
  const [name, setName] = React.useState('');
  const [city, setCity] = React.useState('');
  const [country, setCountry] = React.useState('PK');
  const [plan, setPlan] = React.useState<'starter' | 'clinic' | 'enterprise'>('clinic');
  const [cap, setCap] = React.useState('1000');
  const [contact, setContact] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !city.trim() || !contact.trim()) {
      setError('Name, city, and contact email are required.');
      return;
    }
    const slug = normalizeSlug(name);
    if (MOCK_HOSPITALS.find((h) => h.slug === slug)) {
      setError('A hospital with a similar slug already exists.');
      return;
    }
    setBusy(true);
    setTimeout(() => {
      MOCK_HOSPITALS.push({
        slug,
        name: name.trim(),
        city: city.trim(),
        country,
        plan,
        status: 'trial',
        createdAt: new Date().toISOString(),
        contactEmail: contact.trim(),
        monthlyRxCap: parseInt(cap, 10) || 1000,
        monthlyRxUsed: 0,
        features: { ...DEFAULT_HOSPITAL_FEATURES },
        rxDesign: { ...DEFAULT_RX_DESIGN, headerTitle: name.trim() },
      });
      appendAudit({
        kind: 'create_hospital',
        userId: 'u_admin_001',
        userEmail: 'admin@swiftrx.com',
        at: new Date().toISOString(),
        hospitalSlug: slug,
        hospitalName: name.trim(),
      });
      setBusy(false);
      navigate(`/hospitals/${slug}`);
    }, 400);
  };

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6 animate-fadeIn">
      <div>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Hospitals / new</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Provision a new hospital</h1>
        <p className="text-sm text-ink-400">
          The hospital will get a fresh subdomain (e.g.{' '}
          <span className="font-mono text-ink-300">
            {normalizeSlug(name) || 'slug'}.swiftrx.com
          </span>
          ), a default plan, and a hospital admin invite.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <TextField
              label="Hospital name"
              value={name}
              onChange={setName}
              placeholder="e.g. Riverside Clinic"
              required
              autoFocus
              hint={`Subdomain: ${normalizeSlug(name) || '—'}.swiftrx.com`}
            />
          </div>
          <TextField label="City" value={city} onChange={setCity} placeholder="Karachi" required />
          <TextField
            label="Country (ISO)"
            value={country}
            onChange={setCountry}
            placeholder="PK"
            required
          />
          <Select
            label="Plan"
            value={plan}
            onChange={(v) => setPlan(v as any)}
            options={[
              { value: 'starter', label: 'Starter — 200 Rx / month' },
              { value: 'clinic', label: 'Clinic — 1,500 Rx / month' },
              { value: 'enterprise', label: 'Enterprise — 5,000+ Rx / month' },
            ]}
          />
          <TextField
            label="Monthly Rx cap"
            type="number"
            value={cap}
            onChange={setCap}
            placeholder="1000"
          />
          <div className="sm:col-span-2">
            <TextField
              label="Contact email"
              type="email"
              value={contact}
              onChange={setContact}
              placeholder="admin@hospital.com"
              required
            />
          </div>

          {error && (
            <div className="sm:col-span-2 rounded-md border border-rx-danger/40 bg-rx-danger/10 px-3 py-2 text-sm text-rx-danger animate-slideUpIn">
              {error}
            </div>
          )}

          <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
            <button type="button" className="rx-btn-ghost" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button type="submit" className="rx-shine rx-btn-primary" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Provisioning…
                </>
              ) : (
                'Create hospital'
              )}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
