import * as React from 'react';
import {
  LiveDot,
  Card,
  Spinner,
  TextField,
  cx,
  setPasswordUrl,
  useDoctors,
  useInviteDoctor,
  usePasswordLink,
  type Hospital,
  type PasswordLink,
  type User,
} from '@swiftrx/shared';

type Props = { hospital: Hospital; user: User };

/** A link to hand on, and whom it's for. */
type Shared = PasswordLink & { name: string; email: string };

export function DoctorsPage({ hospital, user }: Props) {
  const doctors = useDoctors(hospital.slug);
  const isAdmin = user.role === 'hospital_admin';
  const [inviting, setInviting] = React.useState(false);
  const [shared, setShared] = React.useState<Shared | null>(null);
  const passwordLink = usePasswordLink();

  const newLink = (d: User) =>
    passwordLink.mutate(d.id, {
      onSuccess: (link) => setShared({ ...link, name: d.name, email: d.email }),
    });

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-4 animate-fadeIn">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
            <LiveDot color="bg-rx-accent" />
            <span>Doctors</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">On-call roster</h1>
          <p className="text-sm text-ink-400">
            {doctors.length} doctor{doctors.length === 1 ? '' : 's'} registered to {hospital.name}
          </p>
        </div>
        {isAdmin && !inviting && (
          <button
            className="rx-shine rx-btn-primary"
            onClick={() => {
              setShared(null);
              setInviting(true);
            }}
          >
            + Invite doctor
          </button>
        )}
      </header>

      {inviting && (
        <InviteForm
          hospital={hospital}
          onDone={(link) => {
            setInviting(false);
            if (link) setShared(link);
          }}
        />
      )}
      {shared && <SharedLink link={shared} onClose={() => setShared(null)} />}
      {passwordLink.error && (
        <div role="alert" className="text-sm text-rx-danger">
          {passwordLink.error.message}
        </div>
      )}

      {doctors.length === 0 ? (
        <Card>
          <div className="text-sm text-ink-400 italic text-center py-8">
            No doctors on staff yet.
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {doctors.map((d, i) => (
            <div
              key={d.id}
              className="rx-card rx-hover-lift p-4 animate-fadeIn"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center text-rx-accent font-bold">
                  {d.name.replace(/^Dr\.\s*/i, '').slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-100">{d.name}</div>
                  <div className="text-[11px] text-ink-400 font-mono">
                    {[d.specialty, d.licenseNo].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-500">{d.email}</div>
                </div>
                <span
                  className={cx(
                    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border',
                    d.status === 'active'
                      ? 'bg-rx-accent/15 text-rx-accent border-rx-accent/30'
                      : 'bg-ink-700 text-ink-300 border-ink-600',
                  )}
                >
                  {d.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-500">
                <span className="font-mono">
                  {d.lastLoginAt
                    ? `Last sign-in: ${new Date(d.lastLoginAt).toLocaleString()}`
                    : d.status === 'invited'
                      ? 'Invited, not signed in yet'
                      : ''}
                </span>
                {isAdmin && d.status !== 'disabled' && (
                  <button
                    className="text-rx-accent hover:underline disabled:opacity-50"
                    disabled={passwordLink.isPending}
                    onClick={() => newLink(d)}
                  >
                    {d.status === 'invited' ? 'New invitation link' : 'New password link'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InviteForm({
  hospital,
  onDone,
}: {
  hospital: Hospital;
  onDone: (link: Shared | null) => void;
}) {
  const invite = useInviteDoctor(hospital.slug);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [licenseNo, setLicenseNo] = React.useState('');
  const [specialty, setSpecialty] = React.useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    invite.mutate(
      { name, email, licenseNo, specialty: specialty || undefined },
      { onSuccess: (r) => onDone({ token: r.token, purpose: r.purpose, name, email }) },
    );
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm font-semibold text-ink-100">Invite a doctor to {hospital.name}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Name" value={name} onChange={setName} autoFocus required />
          <TextField label="Work email" type="email" value={email} onChange={setEmail} required />
          <TextField
            label="License number"
            value={licenseNo}
            onChange={setLicenseNo}
            placeholder="BMDC A-12345"
            required
          />
          <TextField label="Specialty" value={specialty} onChange={setSpecialty} />
        </div>
        {invite.error && (
          <div role="alert" className="text-sm text-rx-danger">
            {invite.error.message}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rx-btn-primary"
            disabled={invite.isPending || !name || !email || !licenseNo}
          >
            {invite.isPending ? (
              <>
                <Spinner /> Inviting…
              </>
            ) : (
              'Create invitation'
            )}
          </button>
          <button type="button" className="rx-btn-ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

/**
 * The link to hand on. There's no email sender yet, so the admin copies it
 * and sends it themselves, to the person it's for and nobody else.
 */
function SharedLink({ link, onClose }: { link: Shared; onClose: () => void }) {
  const url = setPasswordUrl(link.token);
  const [copied, setCopied] = React.useState(false);
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );

  return (
    <Card>
      <div className="space-y-3 text-sm">
        <div className="font-semibold text-ink-100">
          {link.purpose === 'invite' ? 'Invitation' : 'Password link'} for {link.name}
        </div>
        <p className="text-ink-400">
          Send this link to <span className="font-mono">{link.email}</span> yourself, and to no one
          else: it lets whoever opens it set the password.{' '}
          {link.purpose === 'invite'
            ? 'It works once, for 7 days.'
            : 'It works once, for 24 hours.'}
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            aria-label="Link"
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 rounded-md bg-ink-800 border border-ink-600 px-2 py-1.5 font-mono text-xs text-ink-200"
          />
          <button className="rx-btn-primary" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="rx-btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Card>
  );
}
