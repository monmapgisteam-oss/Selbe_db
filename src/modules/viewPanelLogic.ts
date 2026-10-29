/**
 * «ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ» САМБАРЫН (`ViewPanel`) ЦЭВЭР ЛОГИК — React-гүй, `viewPanel.check.mjs`
 * шууд шалгана.
 */

import { zoneWhere, type LayerDef } from '@/lib/services';
import { whereFor } from '@/lib/totals';

/**
 * Дангаарчлахын ӨМНӨХ давхаргын олонлог — `id` нь дангаар үлдсэн давхарга.
 * `null` = дангаарчлаагүй (эсвэл санасан нь хуучирсан).
 */
export type Iso = { id: string; before: string[] } | null;

/**
 * НЭГ ДАВХАРГЫГ ДАНГААР НЬ ҮЛДЭЭХ / БУЦААХ.
 */
export function toggleIsolate(
  visible: readonly string[],
  id: string,
  iso: Iso,
  fallback: readonly string[],
): { next: string[]; iso: Iso } {
  const live = iso && visible.length === 1 && visible[0] === iso.id ? iso : null;
  if (visible.length === 1 && visible[0] === id) {
    return { next: live?.before.length ? live.before.slice() : fallback.slice(), iso: null };
  }
  return { next: [id], iso: { id, before: live ? live.before : visible.slice() } };
}

/**
 * «Зурагт төвлөрөх»-ийн WHERE — бүс сонгосон үед БҮСИЙН ДОТОРХ объектууд.
 */
export const zoomWhereFor = (d: LayerDef, zone: string | null): string | null =>
  (zone && zoneWhere(d, zone) ? whereFor(d, zone) : null);
