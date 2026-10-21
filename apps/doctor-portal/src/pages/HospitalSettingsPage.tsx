import { LiveDot, Card, Toggle, type Hospital, type User } from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

export function HospitalSettingsPage({ hospital, user }: Props) {
  const isAdmin = user.role === 'hospital_admin';
  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-4 animate-fadeIn">
      <div>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Settings</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">{hospital.name}</h1>
        <p className="text-sm text-ink-400">
          {isAdmin ? 'You can edit these details. They sync to SwiftRx platform.' : 'Read-only — only hospital admins can change these.'}
        </p>
      </div>

      <Card title="Hospital profile" subtitle="Public-facing">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" value={hospital.name} />
          <Field label="Slug" value={<code className="font-mono">{hospital.slug}</code>} />
          <Field label="City" value={`${hospital.city}, ${hospital.country}`} />
          <Field label="Contact" value={<code className="font-mono">{hospital.contactEmail}</code>} />
        </div>
      </Card>

      <Card title="Plan & limits" subtitle="Managed by SwiftRx platform">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Plan" value={<span className="capitalize">{hospital.plan}</span>} />
          <Field label="Status" value={<span className="capitalize">{hospital.status}</span>} />
          <Field label="Monthly cap" value={<span className="font-mono">{hospital.monthlyRxCap.toLocaleString()} Rx</span>} />
          <Field label="Used this month" value={<span className="font-mono">{hospital.monthlyRxUsed.toLocaleString()}</span>} />
        </div>
      </Card>

      <Card title="Security" subtitle="Hospital-scoped">
        <div className="space-y-3">
          <Toggle checked={true} onChange={() => {}} label="Require strong passwords" />
          <Toggle checked={true} onChange={() => {}} label="Auto-expire sessions after 12h" />
          <Toggle checked={isAdmin} onChange={() => {}} label="Allow doctors to invite other doctors" />
          <Toggle checked={true} onChange={() => {}} label="Audit every signed prescription" />
        </div>
      </Card>

      <Card title="Your account" subtitle="Signed in">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" value={user.name} />
          <Field label="Email" value={<code className="font-mono">{user.email}</code>} />
          <Field label="Role" value={<span className="capitalize">{user.role.replace('_', ' ')}</span>} />
          <Field label="Specialty" value={user.specialty ?? '—'} />
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-0.5 text-sm text-ink-100">{value}</div>
    </div>
  );
}
