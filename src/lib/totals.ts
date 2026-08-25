'use client';

/**
 * Давхаргын ТОО ба ХЭМЖЭЭНИЙ тооцоо.
 *
 * ⚠️ Каталогийн багана ба самбарын дашбоард ХОЁУЛАА эндээс уншина. Хоёр газарт
 * хуулбарлавал каталог дээрх дүн самбар дээрхээс зөрөх өдөр ирнэ.
 */

import { queryStats, count, sum } from './query';
import { t as tr } from '@/lib/i18nCore';
import { layerUrl, OID, CATALOG_LAYER_IDS, LAYER_BY_ID, zoneWhere, type LayerDef } from './services';
import { num, ha, km } from './format';
import { useAsync, type Async } from './useAsync';

export type Totals = { n: number; q: number };

/**
 * Давхаргад тохирох бүсийн шүүлт.
 * ⚠️ Талбарын нэр ба утга давхаргаас хамаарна: бүсийн давхарга өөрөө `RefName_1`
 * («Багц -1») гэж бичдэг бол бусад нь `ZONE_ID` («Багц-1»). `zoneWhere` хөрвүүлнэ.
 */
export const whereFor = (d: LayerDef, zone: string | null) =>
  (zone ? zoneWhere(d, zone) : null) ?? '1=1';

/** Давхаргын статистикийн хүсэлт — тоо ба (байвал) хэмжээ */
export const layerStats = (d: LayerDef) =>
  // ⚠️ OID нь давхарга бүрт ижил БИШ (хуучин үйлчилгээнүүд `FID`, `objectid`)
  [count(d.oid ?? OID, 'n'), ...(d.qty ? [sum(d.qty.field, 'q')] : [])];


/**
 * Давхаргын ТОО ба ХЭМЖЭЭГ нэг хүсэлтээр (`outStatistics`).
 *
 * ⚠️ 2026-08-24: ӨРТГИЙН тооцоо ХАСАГДАВ. `negj_une` нь зохиомол дата байсан
 * тул давхаргын нийлбэрт зөвхөн ТОО ба ХЭМЖЭЭ үлдэв — үүнээс `Totals` нь
 * `{ n, q }` хос болов. Урьд нь энэ хүсэлт нэгж үнээр БҮЛЭГЛЭЖ (`GROUP BY`)
 * явдаг байсан бөгөөд одоо бүлэглэлгүй, ганц мөр буцаана.
 */
export async function layerTotals(d: LayerDef, where: string): Promise<Totals> {
  const r = await queryStats(layerUrl(d), layerStats(d), where);
  return { n: Number(r.n ?? 0), q: Number(r.q ?? 0) };
}

/**
 * Хэмжээг УХААЛАГ нэгжээр — жижиг утга том нэгжид «0.0» болж бөөрөнхийлөгддөг
 * байсныг зассан (жишээ нь дугуйн замын бүс тус бүрийн 300–2000 м² талбай
 * «0.0 га» гэж гарч байв). 1 га-аас бага → м², 1 км-ээс богино → м.
 */
export const qtyText = (d: LayerDef, q: number): string | null => {
  if (!d.qty || q <= 0) return null;
  if (d.qty.unit === 'км') return q < 1 ? tr('{0} м', num(q * 1000)) : tr('{0} км', num(q, 1));
  if (d.qty.unit === 'м') return q < 1000 ? tr('{0} м', num(q)) : tr('{0} км', km(q, 1));
  return q < 10_000 ? tr('{0} м²', num(q)) : tr('{0} га', ha(q, 1));
};

/** Геометрийн төрөл — дашбоардын толгойд */
export const geomText = (d: LayerDef): string =>
  d.geom === 'area' ? tr('Талбай') : d.geom === 'line' ? tr('Шугам') : tr('Цэг');

/**
 * Ерөнхий мэдээллийн БҮХ давхаргын тоо ба хэмжээ — НЭГ УДАА.
 *
 * ⚠️ Каталогийн багана, багцын тойм, давхаргын дашбоард гурав ижил тоо
 * хэрэглэдэг. Тус тусад нь татвал (а) 29 хүсэлт хэд дахин явж, (б) гурван
 * газарт өөр өөр агшны дүн харагдах эрсдэлтэй. Тиймээс `Portal` дээр нэг удаа
 * дуудаж доош дамжуулна.
 *
 * ⚠️ `enabled` нь «Барилгын хяналт» харагдацад хэрэгтэй: тэнд ЕТ-ийн давхарга
 * огт үзүүлэхгүй тул 29 хүсэлт явуулах нь дэмий.
 */
/**
 * SESSION КЭШ — нэг удаа татсан (бүс, давхаргын багц)-ын дүнг санана.
 *
 * ⚠️ Урьд нь бүс солих БҮРД 29 хүсэлт шинээр явдаг байв: «Багц-1» сонгоод
 * буцаад «бүгд» рүү шилжихэд өмнө нь татсан яг тэр дүн дахин татагдана
 * (`MAX_CONCURRENT=6` тул ~5 багц болж цувна). Эх өгөгдөл session дотор
 * өөрчлөгдөх нь ховор тул түлхүүр бүрийн ЭХНИЙ амжилттай үр дүнг модулийн
 * санах ойд хадгална — бүс хооронд шилжих нь агшин зуурын болно.
 * Алдаатай үр дүн кэшлэгдэхгүй (throw нь Map-д хүрэхгүй) — retry цэвэр явна.
 */
const totalsCache = new Map<string, Map<string, Totals>>();

export function usePlanTotals(
  zone: string | null,
  enabled = true,
  /**
   * ⚠️ 2026-08-20: Анхдагч нь `PLAN_LAYER_IDS`-ЭЭС `CATALOG_LAYER_IDS` болов.
   * Каталог одоо БҮХ давхаргыг харуулдаг тул явцуу нийлбэрийн жагсаалтаар
   * татвал шинээр нээгдсэн 32 мөр тоогоо олохгүй, мөнхөд «…» гэж хүлээнэ.
   */
  ids: string[] = CATALOG_LAYER_IDS,
): Async<Map<string, Totals>> {
  const key = `${enabled ? 'on' : 'off'}|${zone ?? ''}|${ids.join(',')}`;
  return useAsync(async () => {
    if (!enabled) return new Map<string, Totals>();
    const hit = totalsCache.get(key);
    if (hit) return hit;
    // ⚠️ allSettled — Promise.all байхад ~119 хүсэлтийн ГАНЦ нь унахад (нэг
    //    давхаргын HTTP 500 — rate-limit биш тул query.ts retry хийхгүй) бүхэл
    //    Map алдаа болж, каталог/дашбоардын БҮХ тоо «татагдсангүй» болдог байв.
    //    Унасан давхаргыг Map-д оруулахгүй — каталогийн мөр «—» гэж гарна
    //    (LayerCatalog-ийн «алдвал “—”» тохиролцоо), бусад нь хэвийн үзэгдэнэ.
    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const d = LAYER_BY_ID[id];
        return [id, await layerTotals(d, whereFor(d, zone))] as const;
      }),
    );
    const map = new Map<string, Totals>();
    const failed: string[] = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') map.set(s.value[0], s.value[1]);
      else failed.push(ids[i]);
    });
    if (failed.length) {
      // Алдааг ЧИМЭЭГҮЙ залгихгүй (query.ts-ийн дүрэм) — ядаж лог үлдээнэ
      console.warn(`[selbe] usePlanTotals: ${failed.length} давхаргын тоо татагдсангүй: ${failed.join(', ')}`);
      // БҮГД унасан бол сервер бүхэлдээ унасан гэсэн үг — жинхэнэ алдаа
      // болгож error UI + «дахин оролдох» товч гаргана
      if (failed.length === ids.length) throw (settled[0] as PromiseRejectedResult).reason;
      // ⚠️ Дутуу Map-ыг КЭШЛЭХГҮЙ — дараагийн mount/бүс солиход унасан
      //    давхаргууд дахин татагдаж, өөрөө эдгэрнэ
      return map;
    }
    totalsCache.set(key, map);
    return map;
  }, [key]);
}
