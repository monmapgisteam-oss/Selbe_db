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
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): буцаахад урьд нь ҮРГЭЛЖ `PLAN_LAYER_IDS`
 *    (бүх давхарга) асдаг байв — хэрэглэгчийн өмнө сонгосон 3 давхарга 29 болж,
 *    сонголт нь алга болно. Одоо ДАНГААРЧЛАХЫН ӨМНӨХ олонлогийг санаж, яг түүнийг
 *    сэргээнэ.
 * ⚠️ Санасан нь ЗӨВХӨН зураг дангаарчилсан хэвээр (`visible` = `[iso.id]`) үед хүчинтэй —
 *    хэрэглэгч хооронд нь давхарга гараар асааж/унтраасан бол хуучирсан гэж үзнэ.
 * ⚠️ Дангаарчилсан байдлаас ӨӨР давхарга руу шууд шилжвэл (A → B) АНХНЫ олонлог
 *    хэвээр — эс бөгөөс буцаахад `[A]` л сэргэнэ.
 * ⚠️ Санасан олонлог хоосон/алга бол урьдын адил `fallback` (бүх давхарга).
 * ⚠️ `setVisible`-ийн функцэн шинэчлэгч ДОТОР дуудахгүй — StrictMode түүнийг хоёр удаа
 *    ажиллуулдаг тул ref-ийн мутац давхарлана. Дуудагч одоогийн `visible`-оор дуудна.
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
 *
 * ⚠️ 2026-10-01 (хэрэглэгч: бүгдийг зас): урьд нь үргэлж давхаргын БҮТЭН хүрээ рүү
 *    нисдэг байв — самбарын тоо бүсийнх атал зураг төслийн хэмжээнд үлдэнэ.
 * ⚠️ `whereFor` — давхаргын тогтмол шүүлт (`d.where`) + бүс; зурагтай ижил олонлог.
 * @returns `null` = бүсгүй (эсвэл `ZONE_ID`-гүй давхарга) — бүтэн давхарга руу
 */
export const zoomWhereFor = (d: LayerDef, zone: string | null): string | null =>
  (zone && zoneWhere(d, zone) ? whereFor(d, zone) : null);
