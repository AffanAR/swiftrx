// =============================================================================
//  SwiftRx Shared — Quick packs per hospital
// =============================================================================
//  The catalog carries the default packs every hospital starts with: up to
//  three per diagnosis, on Alt+1/2/3. In any of those slots a hospital can
//  have its own pack, which replaces the default, or hide the default and
//  show nothing there (GET /api/hospitals/:slug/quick-packs). Removing
//  either brings the default back.
// =============================================================================

import type { HospitalQuickPacks, QuickPack, QuickPackSlot } from './types';

const slotOf = (p: QuickPackSlot) => `${p.diagnosisCode}#${p.shortcutKey}`;

/**
 * The packs a hospital's pad offers: its own, and the defaults in the slots
 * it has neither set nor hidden.
 */
export function mergeQuickPacks(defaults: QuickPack[], own: HospitalQuickPacks): QuickPack[] {
  const taken = new Set([...own.packs, ...own.hidden].map(slotOf));
  return [...own.packs, ...defaults.filter((p) => !taken.has(slotOf(p)))].sort(
    (a, b) =>
      a.diagnosisCode.localeCompare(b.diagnosisCode) || a.shortcutKey.localeCompare(b.shortcutKey),
  );
}

/** Whether the hospital hides the default pack in this slot. */
export const isHiddenSlot = (own: HospitalQuickPacks, slot: QuickPackSlot) =>
  own.hidden.some((h) => slotOf(h) === slotOf(slot));

/** A hospital pack's id: one per slot, so it is stable across edits. */
export const hospitalPackId = (diagnosisCode: string, shortcutKey: string) =>
  `hospital:${diagnosisCode}:${shortcutKey}`;

/** Whether a pack is the hospital's own rather than a default from the catalog. */
export const isHospitalPack = (p: QuickPack) => p.packId.startsWith('hospital:');
