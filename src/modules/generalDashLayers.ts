/**
 * «ЕРӨНХИЙ ДАШБОАРД» → «Багц 74» ажлын ДАВХАРГЫН АСААЛТ/УНТРААЛТЫН ДҮРЭМ — цэвэр функцүүд (2026-10-22, аудит).
 *
 * ⚠️ ЯАГААД ТУСДАА `.ts`: `GeneralDash.tsx` нь React + ArcGIS тул Node-д ажиллахгүй — `generalDashLayers.check.mjs`
 *    урьд нь дүрмийн ГАР ХУУЛБАР (`dropOf`)-ыг шалгадаг байсан тул бүтээгдэхүүний (`PkgWorkList.onClick`) дүрэм огт
 *    шалгагддаггүй байв (хуулбар нь зөв атал жинхэнэ код алдаатай байж болно). Одоо `PkgWorkList` эндээс дуудаж,
 *    шалгуур ЯГ ЭНЭ функцүүдийг дуудна.
 */

/** Ажил — oid ба түүний багцын давхаргууд (`PKG_BY_BAGTS[key]`; нэг багцын ажлууд ИЖИЛ жагсаалт хуваалцаж болно) */
export type PkgWork<K> = { oid: K; ids: readonly string[] };

/** Ажил зурагт БҮРЭН асаалттай эсэх (давхаргатай бөгөөд бүгд харагдаж байна) — мөрийн тэмдэг ба «N/74» тоолуур */
export const pkgWorkOn = (w: PkgWork<unknown>, visible: readonly string[]): boolean =>
  w.ids.length > 0 && w.ids.every((id) => visible.includes(id));

/** Ажлыг АСААХАД бүртгэх давхаргууд — одоо харагдахгүй, энэ ажил ШИНЭЭР нэмэх (`addedRef`) */
export const pkgWorkAdded = (w: PkgWork<unknown>, visible: readonly string[]): string[] =>
  w.ids.filter((id) => !visible.includes(id));

/**
 * Ажлыг УНТРААХАД хасах давхаргууд.
 * ⚠️ 2026-10-21 (аудит): ЗӨВХӨН энэ ажил асаахад НЭМЭГДСЭН давхаргыг (`added`) хасна — хэрэглэгчийн өмнө нь асаасан
 *    давхарга үлдэнэ; бүртгэлгүй (анхнаасаа асаалттай) бол `w.ids`. Өөр идэвхтэй ажлын давхаргыг үлдээнэ.
 * ⚠️ 2026-10-22 (аудит): «өөр идэвхтэй ажил» = хэрэглэгч ИЛ асаасан (`added`-д бүртгэлтэй) ажил — ХАРАГДАЖ БУЙ (`visible`)
 *    биш. Урьд `visible`-ээс бодож байсан тул нэг багцын ИЖИЛ давхаргатай хоёр ажлыг ХЭЗЭЭ Ч унтрааж чаддаггүй байв:
 *    A-г асаахад B ч «асаалттай» харагдаж, A-г унтраахад B-ийн давхарга (= A-гийнх) «бусдынх» гэж үлдэнэ; B-д мөн адил.
 *    Одоо A ил асаалттай үед B-г дарахад A-д хэрэгтэй давхарга үлдэнэ (A-г унтраахад хоёулаа унтарна).
 */
export function pkgWorkDrop<K>(
  works: readonly PkgWork<K>[],
  w: PkgWork<K>,
  added: ReadonlyMap<K, readonly string[]>,
): string[] {
  const others = new Set(works
    .filter((o) => o.oid !== w.oid && added.has(o.oid))
    .flatMap((o) => o.ids));
  return (added.get(w.oid) ?? w.ids).filter((id) => !others.has(id));
}
