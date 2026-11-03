import React from 'react';
import { useApp, shownAlerts } from '../store';
import {
  LiveDot,
  ProgressBar,
  cx,
  isHospitalPack,
  type QuickPack,
  type SignedRx,
} from '@swiftrx/shared';
import { evaluateMedication, severityRank } from '@swiftrx/shared';
import { PreviousRx } from './PreviousRx';

interface Props {
  onApply: (pack: QuickPack) => void;
  onRepeat: (rx: SignedRx) => void;
}

export function RightColumn({ onApply, onRepeat }: Props) {
  const diagnosis = useApp((s) => s.diagnosis);
  const patient = useApp((s) => s.patients.find((p) => p.id === s.patientId)!);
  const { drugs, quickPacks } = useApp((s) => s.catalog);
  const hideMinor = useApp((s) => s.hideMinorAlerts);

  const packs = React.useMemo(() => {
    if (!diagnosis) return [];
    return quickPacks
      .filter((p) => p.diagnosisCode === diagnosis.code)
      .sort((a, b) => a.shortcutKey.localeCompare(b.shortcutKey))
      .slice(0, 3);
  }, [diagnosis, quickPacks]);

  // A hospital with quick packs switched off gets none from the server.
  if (quickPacks.length === 0) {
    return (
      <aside className="w-1/4 min-w-[320px] border-l border-ink-700 bg-ink-900/60 p-3 overflow-y-auto rx-bg-radial-focus">
        <PreviousRx onRepeat={onRepeat} />
      </aside>
    );
  }

  return (
    <aside className="w-1/4 min-w-[320px] border-l border-ink-700 bg-ink-900/60 p-3 overflow-y-auto rx-bg-radial-focus">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
          <LiveDot color="bg-rx-accent" />
          <span>ML Quick Packs</span>
        </div>
        <div className="text-[10px] text-ink-500">Alt+1 / Alt+2 / Alt+3</div>
      </div>

      {!diagnosis && (
        <div className="text-xs text-ink-400 bg-ink-800/50 border border-dashed border-ink-700 rounded-md p-3 animate-fadeIn">
          <div className="flex items-center gap-2 mb-1 text-ink-300">
            <span className="rx-typing-dot" />
            <span className="rx-typing-dot" />
            <span className="rx-typing-dot" />
            <span className="ml-1">Waiting for diagnosis…</span>
          </div>
          <p>Select a diagnosis to surface AI-curated prescription packs.</p>
        </div>
      )}

      <div className="space-y-2">
        {packs.map((pack, i) => {
          // Evaluate each med in the pack for safety indicators
          const alertsByMed = pack.medications.map((m) =>
            shownAlerts(
              evaluateMedication(
                {
                  rowId: 'q',
                  drugId: m.drugId,
                  genericName: m.genericName,
                  dosage: m.dosage,
                  frequency: m.frequency,
                  durationDays: m.durationDays,
                  instructions: m.instructions,
                },
                patient,
                drugs,
              ),
              hideMinor,
            ),
          );
          const worst = alertsByMed.reduce<number>(
            (acc, arr) => arr.reduce((m, a) => Math.max(m, severityRank(a.severity)), acc),
            0,
          );

          const border =
            worst >= 3
              ? 'border-rx-danger/70 bg-rx-danger/5'
              : worst === 2
                ? 'border-rx-warn/60 bg-rx-warn/5'
                : 'border-ink-700 hover:border-rx-accent/50';

          return (
            <button
              key={pack.packId}
              onClick={() => onApply(pack)}
              className={cx(
                'group relative w-full text-left rounded-md border p-3 rx-hover-lift animate-slideUpIn',
                'transition-all duration-200 will-change-transform',
                border,
                // Subtle aura on the safest packs so the eye knows "this one is clean"
                worst === 0 && 'animate-aura',
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-400 mb-0.5 flex items-center gap-1.5">
                    <span>Pack #{pack.shortcutKey}</span>
                    <span className="text-ink-600">·</span>
                    {isHospitalPack(pack) ? (
                      <span className="text-rx-accent">Your hospital's pack</span>
                    ) : (
                      <span className="font-mono">score {pack.rankScore.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-ink-100">
                    {pack.medications.map((m) => m.genericName).join(' + ')}
                  </div>
                </div>
                <div className="shrink-0 px-2 py-0.5 rounded bg-rx-accent/15 text-rx-accent font-mono text-xs border border-rx-accent/30 flex items-center gap-1">
                  <span>Alt</span>
                  <span>{pack.shortcutKey}</span>
                </div>
              </div>

              <ProgressBar
                value={pack.rankScore}
                tone={worst >= 3 ? 'danger' : worst === 2 ? 'warn' : 'accent'}
                className="mt-2"
              />

              <div className="mt-2 text-[11px] text-ink-300 leading-snug">
                {pack.recommendationReason}
              </div>

              <ul className="mt-2 space-y-0.5">
                {pack.medications.map((m, mi) => (
                  <li key={mi} className="text-[11px] font-mono text-ink-300 flex justify-between">
                    <span>· {m.genericName}</span>
                    <span className="text-ink-400">
                      {m.dosage.value}
                      {m.dosage.unit} · {m.frequency} · {m.durationDays}d
                    </span>
                  </li>
                ))}
              </ul>

              {alertsByMed.flat().length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {alertsByMed.flat().map((a, ai) => (
                    <li
                      key={ai}
                      className={cx(
                        'text-[10.5px] px-1.5 py-0.5 rounded animate-fadeIn',
                        a.severity === 'critical' && 'bg-rx-danger/15 text-rx-danger',
                        a.severity === 'moderate' && 'bg-rx-warn/15 text-rx-warn',
                        a.severity === 'low' && 'bg-ink-700/60 text-ink-300',
                      )}
                      style={{ animationDelay: `${ai * 30}ms` }}
                    >
                      ⚠ {a.message}
                    </li>
                  ))}
                </ul>
              )}

              {/* The ⌘N glyph "presses itself" subtly on hover. */}
              <span
                className="pointer-events-none absolute right-3 bottom-3 h-1 w-8 rounded-full bg-rx-accent/0
                           group-hover:bg-rx-accent/40 group-hover:animate-ripple"
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {diagnosis && packs.length === 0 && (
        <div className="mt-3 text-xs text-ink-400 bg-ink-800/50 border border-dashed border-ink-700 rounded-md p-3 animate-fadeIn">
          No curated packs for {diagnosis.code}. Build the prescription manually.
        </div>
      )}

      <PreviousRx onRepeat={onRepeat} />
    </aside>
  );
}
