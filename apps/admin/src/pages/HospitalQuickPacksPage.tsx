import { Link, useParams } from 'react-router-dom';
import { useSuspenseQueries } from '@tanstack/react-query';
import { HospitalBadge, QuickPacksEditor, queries } from '@swiftrx/shared';

/**
 * HospitalQuickPacksPage
 * ----------------------
 * The SwiftRx team's view of one hospital's quick packs (QuickPacksEditor in
 * @swiftrx/shared). The hospital's own admins edit the same packs from the
 * portal's Quick packs page.
 */
export function HospitalQuickPacksPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [{ data: hospital }, { data: catalog }, { data: own }] = useSuspenseQueries({
    queries: [queries.hospital(slug), queries.catalog(), queries.quickPacks(slug)],
  });

  if (!hospital) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rx-card p-6 text-center animate-fadeIn">
          <h1 className="text-lg font-semibold text-ink-100">Hospital not found</h1>
          <Link to="/hospitals" className="rx-btn-ghost mt-4 inline-flex">
            Back to hospitals
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-5 animate-fadeIn">
      <Link
        to={`/hospitals/${hospital.slug}`}
        className="text-xs text-ink-400 hover:text-rx-accent"
      >
        ← {hospital.name}
      </Link>
      <header>
        <HospitalBadge hospital={hospital} />
        <h1 className="mt-3 text-xl font-semibold text-ink-100">Quick packs</h1>
        <p className="text-sm text-ink-400 max-w-2xl">
          Each diagnosis has up to three packs on Alt+1, Alt+2 and Alt+3. A pack set here replaces
          the default in its slot for {hospital.name} only, and a hidden default shows no pack. The
          hospital's admins can change these too.
        </p>
      </header>

      {!hospital.features.enableQuickPacks && (
        <div role="status" className="rx-card p-3 text-sm text-rx-warn border-rx-warn/40">
          Quick packs are switched off for {hospital.name}, so its doctors see none of these. Switch
          them on under{' '}
          <Link to={`/hospitals/${hospital.slug}/features`} className="underline">
            Features &amp; Rx design
          </Link>
          .
        </div>
      )}

      <QuickPacksEditor slug={hospital.slug} catalog={catalog} own={own} />
    </div>
  );
}
