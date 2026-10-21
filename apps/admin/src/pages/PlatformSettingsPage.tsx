import { Toggle, Card, LiveDot } from '@swiftrx/shared';

export function PlatformSettingsPage() {
  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-4 animate-fadeIn">
      <div>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Settings</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Platform settings</h1>
        <p className="text-sm text-ink-400">Network-wide defaults and integrations.</p>
      </div>

      <Card title="Sign-in & security" subtitle="Affect every tenant by default">
        <div className="space-y-3">
          <Toggle checked={true} onChange={() => {}} label="Require strong passwords (8+ chars, mixed)" />
          <Toggle checked={true} onChange={() => {}} label="Auto-expire sessions after 12h of inactivity" />
          <Toggle checked={false} onChange={() => {}} label="Allow doctors to self-register" />
          <Toggle checked={true} onChange={() => {}} label="Audit every signed prescription" />
        </div>
      </Card>

      <Card title="Billing" subtitle="Mock — wired up when Stripe is connected">
        <div className="space-y-2 text-sm">
          <Row label="Default starter price" value="$0 / mo (trial, 200 Rx)" />
          <Row label="Default clinic price" value="$99 / mo (1,500 Rx)" />
          <Row label="Default enterprise price" value="$499 / mo (5,000 Rx)" />
          <Row label="Overage" value="$0.05 per extra Rx" />
        </div>
      </Card>

      <Card title="Integrations" subtitle="Disabled — these are placeholders">
        <div className="space-y-2 text-sm text-ink-300">
          <Row label="Pharmacy network" value="Not connected" />
          <Row label="PMDC license verification" value="Not connected" />
          <Row label="HL7 / FHIR bridge" value="Not connected" />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 last:border-0 py-2">
      <span className="text-ink-300">{label}</span>
      <span className="font-mono text-ink-100 text-xs">{value}</span>
    </div>
  );
}
