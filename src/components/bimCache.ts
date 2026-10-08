/**
 * BIM (BuildingSceneLayer) ДАВХАРГЫН КЭШ — Map бүрд НЭГ УДАА үүсгэнэ (⚠️ 2026-10-04, BIM гүйцэтгэл).
 *
 * ⚠️ ЯАГААД: урьд нь BIM-ээс гарах бүрд (2D/3D солих) 58 давхарга `destroy()` болж, буцаж
 *    орох бүрд ШИНЭЭР үүсдэг байв — давхарга бүр service · layer · sublayer (~8) · statistics
 *    метадатаа ДАХИН татаж задлана: нэг орох тутам ~712 хүсэлт (хэмжсэн: 116 service + 58
 *    layer + 480 sublayer + 58 statistics). Одоо давхаргыг зөвхөн Map-аас ХАСНА (MapView-д
 *    «Failed to create layerview» гаргахгүйн тулд — MapCanvas-ийн ⚠️ хэвээр), инстанц нь
 *    ЭНД үлдэж дахин нэмэгдэнэ: метадата, `summaryStatistics`, дэд давхаргын харагдац хэвээр.
 * ⚠️ Map-аар ТҮЛХҮҮРЛЭНЭ (`WeakMap`): нэг давхарга нэгэн зэрэг ХОЁР Map-д байж болохгүй
 *    (`uniform` ба `themed` кэш, SuitMap-ийн өөрийн Map) — Map бүр өөрийн инстанцтай.
 *    Map устахад (SuitMap unmount) `dropBimCache` дуудаж кэшлэгдсэнийг устгана.
 * ⚠️ React/ArcGIS-ийн импортгүй — үүсгэгчийг дуудагч өгнө (SceneView-ийн модуль lazy).
 */

export type Destroyable = { destroyed: boolean; destroy: () => void; loadStatus?: string };

const cache = new WeakMap<object, Record<string, Destroyable>>();

/** `map`-ийн `key` давхаргыг кэшээс буцаана; байхгүй/устсан/ачаалал УНАСАН бол `make()`-ээр үүсгэж хадгална */
export function bimLayerFor<L extends Destroyable>(map: object, key: string, make: () => L): L {
  let rec = cache.get(map);
  if (!rec) { rec = {}; cache.set(map, rec); }
  const hit = rec[key];
  /* ⚠️ 2026-10-09: ачаалал УНАСАН (`loadStatus === 'failed'`) инстанцыг кэшийн ОНОО гэж үзэхгүй.
     ArcGIS-ийн давхарга нэг удаа унавал `load()` нь ҮРГЭЛЖ татгалзана (дахин оролдохгүй) тул
     сүлжээний түр тасалдал тэр барилгыг СЕШН ДУУСТАЛ нуудаг байв (`manageBim` Map-аас хасна).
     Хуучныг Map-аас хасаж устгаад шинээр үүсгэнэ — дараагийн `bimAll` дуудалт (эффект) дахин оролдоно. */
  if (hit && !hit.destroyed && hit.loadStatus !== 'failed') return hit as L;
  if (hit && !hit.destroyed) {
    (map as { remove?: (l: unknown) => void }).remove?.(hit);
    hit.destroy();
  }
  const l = make();
  rec[key] = l;
  return l;
}

/** Map бүрмөсөн устах үед — кэшлэгдсэн (Map-д БАЙХГҮЙ үед ч) давхаргуудыг устгана */
export function dropBimCache(map: object): void {
  const rec = cache.get(map);
  if (!rec) return;
  cache.delete(map);
  for (const l of Object.values(rec)) if (!l.destroyed) l.destroy();
}
