// =============================================================================
//  SwiftRx Shared — Quick packs per hospital
// =============================================================================
//  The catalog carries the default packs every hospital starts with: up to
//  three per diagnosis, on Alt+1/2/3. A hospital can have its own pack in any
//  of those slots (GET /api/hospitals/:slug/quick-packs), and its own pack
//  replaces the default in that slot. Removing it brings the default back.
// =============================================================================

import type { QuickPack } from './types';

const slotOf = (p: QuickPack) => `${p.diagnosisCode}#${p.shortcutKey}`;

/** The packs a hospital's pad offers: its own, and the defaults in the slots it hasn't set. */
export function mergeQuickPacks(defaults: QuickPack[], own: QuickPack[]): QuickPack[] {
  const taken = new Set(own.map(slotOf));
  return [...own, ...defaults.filter((p) => !taken.has(slotOf(p)))].sort(
    (a, b) =>
      a.diagnosisCode.localeCompare(b.diagnosisCode) || a.shortcutKey.localeCompare(b.shortcutKey),
  );
}

/** A hospital pack's id: one per slot, so it is stable across edits. */
export const hospitalPackId = (diagnosisCode: string, shortcutKey: string) =>
  `hospital:${diagnosisCode}:${shortcutKey}`;

/** Whether a pack is the hospital's own rather than a default from the catalog. */
export const isHospitalPack = (p: QuickPack) => p.packId.startsWith('hospital:');
