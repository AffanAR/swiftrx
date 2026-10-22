import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  RX_PAGE_MARGIN_MM,
  getHospital,
  listDoctorsForHospital,
  renderRxHtml,
  rxPageSizeMm,
  updateHospitalFeatures,
  updateHospitalRxDesign,
  type HospitalFeatures,
  type RxDesign,
  type RxPageSize,
  type RxWatermarkMode,
  type SignedRx,
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
            <RxPreview design={design} hospitalSlug={initial.slug} />
          </Card>

          <div className="mt-4 text-[11px] text-ink-500 leading-relaxed px-1">
            The preview is drawn by the same template the Rx pad prints with
            (<code className="text-ink-300">renderRxHtml</code>), using a sample prescription.
            Saving here updates the design that all doctors on{' '}
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
//  Renders the shared print template (renderRxHtml), the same HTML the Rx pad
//  prints, at true paper size, then scales the page down to fit the column.
// -----------------------------------------------------------------------------

// CSS defines 96px per inch.
const PX_PER_MM = 96 / 25.4;

/** A fixed sample prescription, so the preview always shows the same content. */
function sampleRx(hospitalSlug: string): SignedRx {
  const doctor = listDoctorsForHospital(hospitalSlug)[0];
  const now = new Date().toISOString();
  return {
    id: 'rx_preview',
    signedAt: now,
    hospitalSlug,
    patient: {
      id: 'p_preview',
      hospitalSlug,
      name: 'Bilal Ahmed',
      age: 42,
      sex: 'M',
      weightKg: 78,
      contact: '+92-300-1234567',
      allergies: ['Penicillin'],
      activeProblems: [],
      activeMedications: [],
      recentVitals: [],
      createdAt: now,
    },
    diagnosis: { code: 'I10', name: 'Essential (primary) hypertension', category: 'Cardiovascular' },
    medications: [
      { rowId: 'r1', drugId: 'lisinopril', genericName: 'Lisinopril', dosage: { value: 10, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Same time daily' },
      { rowId: 'r2', drugId: 'amlo', genericName: 'Amlodipine', brandName: 'Norvasc', dosage: { value: 5, unit: 'mg' }, frequency: 'QD', durationDays: 90, instructions: 'Morning' },
      { rowId: 'r3', drugId: 'atorva', genericName: 'Atorvastatin', dosage: { value: 20, unit: 'mg' }, frequency: 'QHS', durationDays: 90, instructions: 'At bedtime' },
    ],
    investigations: [
      { code: 'BMP', name: 'Basic Metabolic Panel', type: 'lab' },
      { code: 'Lipid', name: 'Lipid Profile', type: 'lab' },
    ],
    doctorId: doctor?.id ?? 'd_preview',
    doctorName: doctor?.name ?? 'Dr. Sample Doctor',
    doctorLicense: doctor?.licenseNo ?? 'PMDC-00000',
  };
}

function RxPreview({ design, hospitalSlug }: { design: RxDesign; hospitalSlug: string }) {
  const sample = useMemo(() => sampleRx(hospitalSlug), [hospitalSlug]);
  const html = useMemo(() => renderRxHtml(sample, design), [sample, design]);
  const { widthMm, heightMm } = rxPageSizeMm(design);
  const paperW = widthMm * PX_PER_MM;
  const paperH = heightMm * PX_PER_MM;

  // Track the column width so the full-size page can be scaled to fit it.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [actualSize, setActualSize] = useState(false);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = actualSize || !boxWidth ? 1 : Math.min(1, boxWidth / paperW);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-ink-400">
        <span>
          {design.pageSize}
          {design.landscape ? ' landscape' : ''} · first page · {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setActualSize((v) => !v)}
          className="rx-btn-ghost px-2 py-0.5 text-[11px]"
        >
          {actualSize ? 'Fit to width' : 'Actual size'}
        </button>
      </div>
      <div ref={boxRef} className={cx(actualSize && 'overflow-auto max-h-[75vh] rounded-md')}>
        {/* Reserves the scaled page's footprint; the page itself is scaled with a transform. */}
        <div className="mx-auto" style={{ width: paperW * scale, height: paperH * scale }}>
          <div
            className="bg-white shadow-xl overflow-hidden"
            style={{
              width: paperW,
              height: paperH,
              padding: `${RX_PAGE_MARGIN_MM}mm`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            // renderRxHtml escapes every value it inserts.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
