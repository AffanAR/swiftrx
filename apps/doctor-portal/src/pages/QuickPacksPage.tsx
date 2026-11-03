import { useSuspenseQueries } from '@tanstack/react-query';
import { LiveDot, QuickPacksEditor, queries, type Hospital } from '@swiftrx/shared';

type Props = { hospital: Hospital };

/**
 * The hospital admin's quick packs: the defaults every hospital gets, and
 * this hospital's own packs and hidden defaults (QuickPacksEditor). Doctors
 * see the result on the Rx pad.
 */
export function QuickPacksPage({ hospital }: Props) {
  const [{ data: catalog }, { data: own }] = useSuspenseQueries({
    queries: [queries.catalog(), queries.quickPacks(hospital.slug)],
  });

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-5 animate-fadeIn">
      <header>
        <div className="text-xs text-ink-400 uppercase tracking-wider flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>Quick packs</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">Packs on the Rx pad</h1>
        <p className="text-sm text-ink-400 max-w-2xl">
          Doctors add a pack's medicines with Alt+1, Alt+2 or Alt+3 once they pick a diagnosis. Set
          your own pack in a slot to replace the default there, or hide a default your doctors
          shouldn't use. Every change is recorded in the audit log.
        </p>
      </header>

      {hospital.features.enableQuickPacks ? (
        <QuickPacksEditor slug={hospital.slug} catalog={catalog} own={own} />
      ) : (
        <div role="status" className="rx-card p-4 text-sm text-ink-300">
          Quick packs are switched off for {hospital.name}. Ask the SwiftRx team to switch them on.
        </div>
      )}
    </div>
  );
}
