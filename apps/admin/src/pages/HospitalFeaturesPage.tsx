import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DEFAULT_HOSPITAL_FEATURES,
  DEFAULT_RX_DESIGN,
  LiveDot,
  Toggle,
  TextField,
  Select,
  Card,
  HospitalBadge,
  getHospital,
  updateHospitalFeatures,
  updateHospitalRxDesign,
  type HospitalFeatures,
  type RxDesign,
  type RxPageSize,
  type RxWatermarkMode,
  cx,
} from '@swiftrx/shared';

/**
 * HospitalFeaturesPage
 * --------------------
 * The platform admin's editor for everything a tenant can customize:
 *   1. Feature flags and usage limits (HospitalFeatures)
 *   2. Custom Rx prescription design (RxDesign) — header, accent, footer,
 *      watermark, page size, signature line, etc.
 *
 * Includes a live preview that uses the same print template the Rx pad
 * itself uses (see preview styles below). Changes are written through to
 * the shared mock store so they immediately reflect in the hospital
 * portal and the Rx pad.
 */
export function HospitalFeaturesPage() {
  const { slug } = useParams<{ slug: string }>();
  const initial = getHospital(slug);

  const [features, setFeatures] = useState<HospitalFeatures>(
    () => initial?.features ?? DEFAULT_HOSPITAL_FEATURES,
  );
  const [design, setDesign] = useState<RxDesign>(
    () => initial?.rxDesign ?? DEFAULT_RX_DESIGN,
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // If the admin navigates to a different hospital, reset.
  useEffect(() => {
    if (initial) {
      setFeatures(initial.features);
      setDesign(initial.rxDesign);
    }
  }, [initial?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initial) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rx-card p-6 text-center animate-fadeIn">
          <h1 className="text-lg font-semibold text-ink-100">Hospital not found</h1>
          <p className="mt-2 text-sm text-ink-400">
            The slug <code className="font-mono text-ink-200">{slug}</code> doesn't match any tenant.
          </p>
          <Link to="/hospitals" className="rx-btn-ghost mt-4 inline-flex">Back to hospitals</Link>
        </div>
      </div>
    );
  }

  const dirty =
    JSON.stringify(features) !== JSON.stringify(initial.features) ||
    JSON.stringify(design) !== JSON.stringify(initial.rxDesign);

  const onSave = () => {
    updateHospitalFeatures(initial.slug, features);
    updateHospitalRxDesign(initial.slug, design);
    setSavedAt(Date.now());
  };

  const onReset = () => {
    setFeatures(initial.features);
    setDesign(initial.rxDesign);
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      <Link
        to={`/hospitals/${initial.slug}`}
        className="text-xs text-ink-400 hover:text-rx-accent transition-colors inline-flex items-center gap-1"
      >
        ← {initial.name}
      </Link>

      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Tenant configuration</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Features &amp; Rx design</h1>
          <p className="text-sm text-ink-400">
            Toggle features and customize the printed prescription for{' '}
            <span className="text-ink-200 font-medium">{initial.name}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rx-btn-ghost disabled:opacity-50"
            onClick={onReset}
            disabled={!dirty}
          >
            Reset
          </button>
          <button
            className={cx('rx-btn-primary', !dirty && 'opacity-60')}
            onClick={onSave}
            disabled={!dirty}
            data-test="save-features"
          >
            Save changes
          </button>
        </div>
      </header>

      <div className="flex items-center gap-3">
        <HospitalBadge hospital={initial} />
        {savedAt && (
          <span className="text-[11px] text-rx-accent font-mono animate-fadeIn">
            Saved · {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {dirty && (
          <span className="text-[11px] text-amber-300 font-mono animate-fadeIn">
            ● Unsaved changes
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
        {/* Left — the editors */}
        <div className="space-y-6 min-w-0">
          <Card title="Feature flags" subtitle="What the doctors on this hospital can use.">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              <FeatureToggle
                label="Brand-name search"
                hint="Doctors can type brand names (Panadol) in addition to generics."
                checked={features.enableBrandSearch}
                onChange={(v) => setFeatures({ ...features, enableBrandSearch: v })}
              />
              <FeatureToggle
                label="ML quick packs"
                hint="Show AI-suggested prescription packs on the right column."
                checked={features.enableQuickPacks}
                onChange={(v) => setFeatures({ ...features, enableQuickPacks: v })}
              />
              <FeatureToggle
                label="Safety alerts"
                hint="Live allergy / interaction checks as the doctor types."
                checked={features.enableSafetyAlerts}
                onChange={(v) => setFeatures({ ...features, enableSafetyAlerts: v })}
              />
              <FeatureToggle
                label="Investigations"
                hint="Allow attaching labs / imaging to the Rx."
                checked={features.enableInvestigations}
                onChange={(v) => setFeatures({ ...features, enableInvestigations: v })}
              />
              <FeatureToggle
                label="PDF export"
                hint="Allow downloading the signed Rx as a PDF."
                checked={features.allowPdfExport}
                onChange={(v) => setFeatures({ ...features, allowPdfExport: v })}
              />
              <FeatureToggle
                label="Letterhead footer"
                hint="Show hospital contact info in the printed footer."
                checked={features.showLetterheadFooter}
                onChange={(v) => setFeatures({ ...features, showLetterheadFooter: v })}
              />
            </div>
          </Card>

          <Card title="Usage limits" subtitle="Caps for this hospital.">
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField
                label="Max medications per Rx"
                type="number"
                value={String(features.maxMedicationsPerRx)}
                onChange={(v) => setFeatures({ ...features, maxMedicationsPerRx: clampInt(v, 1, 20) })}
                hint="Hard cap on rows the doctor can add before signing."
              />
              <TextField
                label="Max patients"
                type="number"
                value={String(features.maxPatients)}
                onChange={(v) => setFeatures({ ...features, maxPatients: clampInt(v, 1, 100_000) })}
                hint="Total active patient roster."
              />
              <TextField
                label="Usage warning at %"
                type="number"
                value={String(features.usageWarnAtPercent)}
                onChange={(v) => setFeatures({ ...features, usageWarnAtPercent: clampInt(v, 50, 100) })}
                hint="Show a warning banner above this utilization."
              />
              <Select
                label="Default language"
                value={features.defaultLanguage}
                onChange={(v) => setFeatures({ ...features, defaultLanguage: v as HospitalFeatures['defaultLanguage'] })}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Español' },
                  { value: 'fr', label: 'Français' },
                  { value: 'de', label: 'Deutsch' },
                  { value: 'ar', label: 'العربية' },
                  { value: 'hi', label: 'हिन्दी' },
                ]}
              />
            </div>
          </Card>

          <Card title="Printed Rx — header" subtitle="What appears at the top of the printed prescription.">
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField
                label="Header title"
                value={design.headerTitle}
                onChange={(v) => setDesign({ ...design, headerTitle: v })}
                hint="e.g. 'City Hospital' or 'Northstar Medical Center'."
              />
              <TextField
                label="Header subtitle"
                value={design.headerSubtitle}
                onChange={(v) => setDesign({ ...design, headerSubtitle: v })}
                hint="Small grey line under the title."
              />
              <TextField
                label="Header right"
                value={design.headerRight}
                onChange={(v) => setDesign({ ...design, headerRight: v })}
                hint="Address / contact block. Use ⏎ to break lines."
              />
              <div className="flex items-end gap-3">
                <ColorField
                  label="Accent color"
                  value={design.accentColor}
                  onChange={(v) => setDesign({ ...design, accentColor: v })}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
              <FeatureToggle
                label="Show 'Rx' badge"
                hint="A pill on the left of the header."
                checked={design.showRxBadge}
                onChange={(v) => setDesign({ ...design, showRxBadge: v })}
              />
              <FeatureToggle
                label="Accent band under header"
                hint="A colored stripe under the title row."
                checked={design.showAccentBand}
                onChange={(v) => setDesign({ ...design, showAccentBand: v })}
              />
              <FeatureToggle
                label="Allergy banner"
                hint="Highlight patient allergies prominently at the top."
                checked={design.showAllergyBanner}
                onChange={(v) => setDesign({ ...design, showAllergyBanner: v })}
              />
              <FeatureToggle
                label="Doctor signature line"
                hint="A line at the bottom for the doctor's signature."
                checked={design.showSignatureLine}
                onChange={(v) => setDesign({ ...design, showSignatureLine: v })}
              />
              <FeatureToggle
                label="'Valid until' line"
                hint="Show an expiry date under the prescription."
                checked={design.showValidUntil}
                onChange={(v) => setDesign({ ...design, showValidUntil: v })}
              />
              <FeatureToggle
                label="Refill line"
                hint="Show how many refills are allowed."
                checked={design.showRefillLine}
                onChange={(v) => setDesign({ ...design, showRefillLine: v })}
              />
            </div>
          </Card>

          <Card title="Printed Rx — layout" subtitle="Page format and decorative elements.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Select
                label="Page size"
                value={design.pageSize}
                onChange={(v) => setDesign({ ...design, pageSize: v as RxPageSize })}
                options={[
                  { value: 'A4', label: 'A4 (210 × 297 mm)' },
                  { value: 'A5', label: 'A5 (148 × 210 mm)' },
                  { value: 'Letter', label: 'US Letter (8.5 × 11 in)' },
                ]}
              />
              <Select
                label="Watermark"
                value={design.watermark}
                onChange={(v) => setDesign({ ...design, watermark: v as RxWatermarkMode })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'hospital', label: 'Hospital name' },
                  { value: 'doctor', label: "Doctor's name" },
                  { value: 'confidential', label: "'CONFIDENTIAL'" },
                ]}
              />
              <TextField
                label="Default refills"
                type="number"
                value={String(design.defaultRefills)}
                onChange={(v) => setDesign({ ...design, defaultRefills: clampInt(v, 0, 12) })}
                hint="Used when 'Refill line' is enabled."
              />
              <FeatureToggle
                label="Landscape orientation"
                hint="Rotate the page 90°. Useful for very long medication lists."
                checked={design.landscape}
                onChange={(v) => setDesign({ ...design, landscape: v })}
              />
            </div>
            <div className="mt-4">
              <TextField
                label="Footer text"
                value={design.footerText}
                onChange={(v) => setDesign({ ...design, footerText: v })}
                hint="Free-form text shown at the bottom of every printed Rx."
              />
            </div>
          </Card>
        </div>

        {/* Right — the live preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card
            title="Live preview"
            subtitle="What the printed Rx will look like for this hospital."
          >
            <RxPreview design={design} hospital={initial} />
          </Card>

          <div className="mt-4 text-[11px] text-ink-500 leading-relaxed px-1">
            The preview uses the same <code className="text-ink-300">RxDesign</code> object
            the print pipeline uses. Saving here updates the design that all doctors on{' '}
            <span className="text-ink-300">{initial.name}</span> see when they print.
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Sub-components
// -----------------------------------------------------------------------------

function FeatureToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="py-1.5 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm text-ink-100">{label}</div>
        {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={checked ? 'On' : 'Off'} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-ink-300 w-full">
      <span>{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-9 w-9 rounded-md border border-ink-600"
          style={{ background: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rx-input flex-1 font-mono text-sm"
          placeholder="#10b981"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded-md border border-ink-600 bg-transparent cursor-pointer"
          aria-label={`${label} color picker`}
        />
      </div>
    </label>
  );
}

function clampInt(v: string, lo: number, hi: number) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// -----------------------------------------------------------------------------
//  Live preview
//  ---------------------------------------------------------------------------
//  Kept intentionally inline here so changes to RxDesign are immediately
//  reflected without a round-trip. The exact same field-by-field logic
//  lives in apps/swiftrx/src/print.ts (step 4).
// -----------------------------------------------------------------------------

function RxPreview({
  design,
  hospital,
}: {
  design: RxDesign;
  hospital: { name: string; city: string };
}) {
  // Stable, fake patient for the preview so it always renders the same way.
  const patient = useMemo(
    () => ({
      name: 'Bilal Ahmed',
      age: 42,
      sex: 'M' as const,
      weightKg: 78,
      allergies: ['Penicillin'],
    }),
    [],
  );
  const meds = useMemo(
    () => [
      { name: 'Lisinopril', dose: '10 mg', freq: 'QD', days: 90, instr: 'Same time daily' },
      { name: 'Amlodipine', dose: '5 mg', freq: 'QD', days: 90, instr: 'Morning' },
      { name: 'Atorvastatin', dose: '20 mg', freq: 'QHS', days: 90, instr: 'At bedtime' },
    ],
    [],
  );

  const validUntil = new Date(Date.now() + 90 * 86_400_000).toLocaleDateString();

  return (
    <div
      className="mx-auto rounded-md border border-ink-600 bg-white text-slate-900 shadow-xl overflow-hidden transition-all"
      style={{
        aspectRatio: design.pageSize === 'A5'
          ? (design.landscape ? '210 / 148' : '148 / 210')
          : design.pageSize === 'Letter'
            ? (design.landscape ? '11 / 8.5' : '8.5 / 11')
            : (design.landscape ? '297 / 210' : '210 / 297'),
        maxWidth: '100%',
      }}
    >
      <div className="relative h-full flex flex-col">
        {/* Watermark */}
        {design.watermark !== 'none' && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
            aria-hidden
          >
            <div
              className="text-3xl sm:text-5xl font-extrabold tracking-widest opacity-10"
              style={{ transform: 'rotate(-22deg)', color: design.accentColor }}
            >
              {design.watermark === 'confidential'
                ? 'CONFIDENTIAL'
                : design.watermark === 'hospital'
                  ? hospital.name.toUpperCase()
                  : 'DR. SAMPLE'}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="relative px-4 py-3 flex items-start gap-3">
          {design.showRxBadge && (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center font-extrabold text-white shrink-0"
              style={{ background: design.accentColor }}
            >
              ℞
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-slate-900 leading-tight">{design.headerTitle}</div>
            {design.headerSubtitle && (
              <div className="text-[10px] text-slate-500 mt-0.5">{design.headerSubtitle}</div>
            )}
          </div>
          {design.headerRight && (
            <div className="text-[10px] text-slate-500 text-right whitespace-pre-line max-w-[40%]">
              {design.headerRight}
            </div>
          )}
        </div>
        {design.showAccentBand && (
          <div className="h-1" style={{ background: design.accentColor }} />
        )}

        {/* Patient */}
        <div className="px-4 pt-3 text-[11px] text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
          <div><span className="text-slate-400">Patient:</span> <span className="font-semibold text-slate-900">{patient.name}</span></div>
          <div><span className="text-slate-400">Age/Sex:</span> {patient.age}{patient.sex}</div>
          <div><span className="text-slate-400">Weight:</span> {patient.weightKg} kg</div>
          <div><span className="text-slate-400">Date:</span> {new Date().toLocaleDateString()}</div>
        </div>

        {design.showAllergyBanner && patient.allergies.length > 0 && (
          <div className="mx-4 mt-2 rounded border border-rose-300 bg-rose-50 text-rose-700 text-[10px] font-semibold px-2 py-1">
            ⚠ ALLERGIES: {patient.allergies.join(', ')}
          </div>
        )}

        {/* Diagnosis */}
        <div className="px-4 mt-3">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">Diagnosis</div>
          <div className="text-[12px] text-slate-900 font-semibold mt-0.5">
            <span className="font-mono mr-1">I10</span> Essential (primary) hypertension
          </div>
        </div>

        {/* Medications */}
        <div className="px-4 mt-3 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">Rx</div>
          <div className="space-y-1.5">
            {meds.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: design.accentColor }}
                />
                <div>
                  <span className="font-bold text-slate-900">{m.name}</span>{' '}
                  <span className="text-slate-600">{m.dose} · {m.freq} · {m.days}d</span>
                  {m.instr && <div className="text-slate-500 text-[10px]">{m.instr}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-3 mt-2">
          {design.showRefillLine && (
            <div className="text-[10px] text-slate-600 mb-1">
              Refills: <span className="font-semibold text-slate-900">{design.defaultRefills}</span>
            </div>
          )}
          {design.showValidUntil && (
            <div className="text-[10px] text-slate-600 mb-1">Valid until: <span className="font-semibold text-slate-900">{validUntil}</span></div>
          )}
          {design.showSignatureLine && (
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-end justify-between">
              <div>
                <div className="text-[10px] text-slate-500">Doctor</div>
                <div className="text-[11px] font-semibold text-slate-900">Dr. Ayesha Khan</div>
                <div className="text-[9px] text-slate-500 font-mono">PMDC-12345</div>
              </div>
              <div className="flex-1 ml-4 border-b border-slate-400 h-6" />
            </div>
          )}
          {design.footerText && (
            <div className="mt-2 text-[9px] text-slate-500 text-center border-t border-slate-100 pt-1">
              {design.footerText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
