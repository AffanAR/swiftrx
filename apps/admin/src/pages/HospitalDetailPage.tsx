import * as React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSuspenseQueries } from '@tanstack/react-query';
import {
  Card,
  ProgressBar,
  Spinner,
  StatTile,
  TextField,
  HospitalBadge,
  cx,
  hospitalPortalUrl,
  hospitalSetPasswordUrl,
  queries,
  useInviteHospitalAdmin,
  type Hospital,
} from '@swiftrx/shared';
import { auditColor, auditTitle } from '../audit';

export function HospitalDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [{ data: hospital }, { data: doctors }, { data: patients }, { data: rx }, { data: audit }] =
    useSuspenseQueries({
      queries: [
        queries.hospital(slug),
        queries.doctors(slug),
        queries.patients(slug),
        queries.prescriptions(slug),
        queries.audit(slug),
      ],
    });

  if (!hospital) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rx-card p-6 text-center animate-fadeIn">
          <h1 className="text-lg font-semibold text-ink-100">Hospital not found</h1>
          <p className="mt-2 text-sm text-ink-400">
            The slug <code className="font-mono text-ink-200">{slug}</code> doesn't match any
            tenant.
          </p>
          <Link to="/hospitals" className="rx-btn-ghost mt-4 inline-flex">
            Back to hospitals
          </Link>
        </div>
      </div>
    );
  }

  const usagePct = hospital.monthlyRxCap > 0 ? hospital.monthlyRxUsed / hospital.monthlyRxCap : 0;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6 animate-fadeIn">
      <Link
        to="/hospitals"
        className="text-xs text-ink-400 hover:text-rx-accent transition-colors inline-flex items-center gap-1"
      >
        ← All hospitals
      </Link>

      <header className="flex items-start justify-between flex-wrap gap-3">
        <HospitalBadge hospital={hospital} />
        <div className="flex items-center gap-2">
          <Link to={`/hospitals/${hospital.slug}/features`} className="rx-btn-ghost">
            Features &amp; Rx design
          </Link>
          <button className="rx-btn-ghost">Suspend</button>
          <a
            className="rx-btn-primary"
            href={hospitalPortalUrl(hospital.slug)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open portal ↗
          </a>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Doctors"
          value={doctors.length}
          hint={`${doctors.filter((d) => d.status === 'active').length} active`}
        />
        <StatTile label="Patients" value={patients.length} hint="Total roster" />
        <StatTile label="Signed Rx" value={rx.length} hint="All-time" tone="focus" />
        <StatTile
          label="Monthly usage"
          value={`${Math.round(usagePct * 100)}%`}
          hint={`${hospital.monthlyRxUsed} / ${hospital.monthlyRxCap}`}
          tone={usagePct > 0.85 ? 'danger' : usagePct > 0.6 ? 'warn' : 'accent'}
        />
      </div>

      <Card title="Plan & limits" subtitle="Edit from settings (mock)">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Plan" value={<span className="capitalize">{hospital.plan}</span>} />
          <Field label="Status" value={<span className="capitalize">{hospital.status}</span>} />
          <Field
            label="Monthly cap"
            value={<span className="font-mono">{hospital.monthlyRxCap.toLocaleString()} Rx</span>}
          />
          <Field
            label="Contact"
            value={<span className="font-mono">{hospital.contactEmail}</span>}
          />
        </div>
        <div className="mt-4">
          <ProgressBar
            value={usagePct}
            tone={usagePct > 0.85 ? 'danger' : usagePct > 0.6 ? 'warn' : 'accent'}
          />
        </div>
      </Card>

      <InviteHospitalAdmin hospital={hospital} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Doctors" subtitle={`${doctors.length} on staff`}>
          {doctors.length === 0 && <Empty text="No doctors yet — invite one to get started." />}
          <ul className="space-y-2">
            {doctors.map((d, i) => (
              <li
                key={d.id}
                className="flex items-center justify-between bg-ink-800/60 border border-ink-700 rounded-md px-3 py-2 animate-fadeIn"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <div className="text-sm font-medium text-ink-100">{d.name}</div>
                  <div className="text-[11px] text-ink-400 font-mono">
                    {d.specialty} · {d.licenseNo}
                  </div>
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
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent patients" subtitle={`${patients.length} in roster`}>
          {patients.length === 0 && <Empty text="No patients yet." />}
          <ul className="space-y-2">
            {patients.slice(0, 6).map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-ink-800/60 border border-ink-700 rounded-md px-3 py-2 animate-fadeIn"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <div className="text-sm font-medium text-ink-100">{p.name}</div>
                  <div className="text-[11px] text-ink-400 font-mono">
                    {p.age}
                    {p.sex} · {p.contact}
                  </div>
                </div>
                {p.allergies.length > 0 && (
                  <span className="text-[10px] font-semibold text-rx-danger bg-rx-danger/15 border border-rx-danger/30 rounded px-1.5 py-0.5">
                    ⚠ {p.allergies[0]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent prescriptions" subtitle="Signed by doctors in this hospital">
        {rx.length === 0 && <Empty text="No signed prescriptions yet." />}
        <ul className="space-y-2">
          {rx.slice(0, 8).map((r, i) => (
            <li
              key={r.id}
              className="flex items-center justify-between bg-ink-800/60 border border-ink-700 rounded-md px-3 py-2 animate-fadeIn"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div>
                <div className="text-sm font-medium text-ink-100">
                  {r.patient.name} ·{' '}
                  <span className="font-mono text-ink-300">{r.diagnosis.code}</span>
                </div>
                <div className="text-[11px] text-ink-400">
                  {r.medications.length} med{r.medications.length === 1 ? '' : 's'} · {r.doctorName}
                </div>
              </div>
              <div className="text-[11px] text-ink-500 font-mono">
                {new Date(r.signedAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Audit log" subtitle="Recent activity for this hospital">
        <ul className="space-y-2">
          {audit.slice(0, 12).map((e, i) => (
            <li
              key={i}
              className="text-sm border-l-2 pl-3 py-1 animate-fadeIn"
              style={{ animationDelay: `${i * 25}ms`, borderColor: auditColor(e.kind) }}
            >
              <div className="text-ink-200">{auditTitle(e)}</div>
              <div className="text-[11px] text-ink-500 font-mono">
                {new Date(e.at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Invite an admin for the hospital: how a new hospital gets its first user,
 * who then invites its doctors from the portal. There's no email sender yet,
 * so the page shows the link, on the hospital's own portal, to pass on.
 */
function InviteHospitalAdmin({ hospital }: { hospital: Hospital }) {
  const invite = useInviteHospitalAdmin(hospital.slug);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [link, setLink] = React.useState<{ url: string; name: string; email: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setCopied(false);
    invite.mutate(
      { name, email },
      {
        onSuccess: (r) => {
          setLink({
            url: hospitalSetPasswordUrl(hospital.slug, r.token),
            name: r.user.name,
            email: r.user.email,
          });
          setName('');
          setEmail('');
        },
      },
    );
  };
  const copy = () =>
    link &&
    navigator.clipboard.writeText(link.url).then(
      () => setCopied(true),
      () => setCopied(false),
    );

  return (
    <Card
      title="Hospital admin"
      subtitle="Invite the person who runs this hospital on SwiftRx. They invite its doctors."
    >
      {link ? (
        <div className="space-y-3 text-sm">
          <p className="text-ink-400">
            Send this link to <span className="font-mono text-ink-200">{link.email}</span> yourself,
            and to no one else: it lets whoever opens it set {link.name}'s password. It works once,
            for 7 days, on {hospital.name}'s portal. Inviting the same email again makes a new link.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md bg-ink-800 border border-ink-600 px-2 py-1.5 font-mono text-xs text-ink-200"
            />
            <button className="rx-btn-primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="rx-btn-ghost" onClick={() => setLink(null)}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField label="Name" value={name} onChange={setName} required />
            <TextField label="Work email" type="email" value={email} onChange={setEmail} required />
          </div>
          {invite.error && (
            <div role="alert" className="text-sm text-rx-danger">
              {invite.error.message}
            </div>
          )}
          <button
            type="submit"
            className="rx-btn-primary"
            disabled={invite.isPending || !name.trim() || !email.trim()}
          >
            {invite.isPending ? (
              <>
                <Spinner /> Inviting…
              </>
            ) : (
              'Invite hospital admin'
            )}
          </button>
        </form>
      )}
    </Card>
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

function Empty({ text }: { text: string }) {
  return (
    <div className="text-sm text-ink-400 italic border border-dashed border-ink-700 rounded-md p-4 text-center">
      {text}
    </div>
  );
}
