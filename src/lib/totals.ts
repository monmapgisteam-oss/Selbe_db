'use client';

/**
 * Давхаргын тоо, хэмжээ, ӨРТГИЙН тооцоо.
 *
 * ⚠️ Каталогийн багана ба самбарын дашбоард ХОЁУЛАА эндээс уншина. Хоёр газарт
 * хуулбарлавал каталог дээрх дүн самбар дээрхээс зөрөх өдөр ирнэ.
 */

import { queryGroup, queryStats, count, sum } from './query';
import { layerUrl, OID, CATALOG_LAYER_IDS, LAYER_BY_ID, zoneWhere, type LayerDef, type Cost } from './services';
import { num, ha, km } from './format';
import { useAsync, type Async } from './useAsync';

export type Totals = { n: number; q: number; cost: number };

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
 * НЭГ бүлгийн өртөг: нэгж үнийг тоо/хэмжээнд хэрхэн үржүүлэх.
 *
 * ⚠️ Ганц газарт бичнэ: нийт дүн, ангилал бүрийн дүн, нэгж үнийн шатлал гурав
 * бүгд эндээс тооцоно — эс бөгөөс задаргааны нийлбэр нийт дүнтэйгээ зөрнө.
 */
/**
 * ⚠️ 2026-08-19: Параметр нь `LayerDef` БАЙСАН. `loadCosts` нь одоо миграциас
 * ӨМНӨХ өртгийн тодорхойлолтоор (`costSrc`) ажилладаг тул давхаргын ОДООГИЙН
 * `d.cost` (устсан байж болно) БИШ, шийдэгдсэн `Cost`-ыг шууд авна — эс бөгөөс
 * сэргээсэн давхаргууд бүгд 0 өртөгтэй хэвээр үлдэнэ.
 */
export function costOf(c: Cost | undefined, n: number, q: number, price: number): number {
  if (!c || !Number.isFinite(price)) return 0;
  return c.basis === 'sh' ? n * price
    : c.basis === 'm100' ? (q / 100) * price
      : q * price; // 'km' ба 'm2' — хэмжээ шууд үржигдэнэ
}

/**
 * Давхаргын тоо, хэмжээ, ӨРТГИЙГ нэг хүсэлтээр.
 *
 * ⚠️ Нэгж үнээр БҮЛЭГЛЭЖ асуудаг нь санаатай. Ихэнх давхаргад нэгж үнэ тогтмол
 * боловч зарим давхаргад ангилал бүрт өөр байдаг (жишээ нь «Инженерийн бэлтгэл
 * арга хэмжээ» 18–250 сая). Нэг ижил хэлбэрээр бүлэглэвэл тэр онцгой тохиолдол
 * өөрөө шийдэгдэнэ — `MAX(үнэ)` авбал тэр давхаргын өртөг 9 дахин хэтэрдэг байв.
 */
export async function layerTotals(d: LayerDef, where: string): Promise<Totals> {
  const url = layerUrl(d);
  const stats = layerStats(d);

  if (!d.cost) {
    const r = await queryStats(url, stats, where);
    return { n: Number(r.n ?? 0), q: Number(r.q ?? 0), cost: 0 };
  }

  const rows = await queryGroup(url, d.cost.field, stats, where);
  let n = 0, q = 0, cost = 0;
  for (const r of rows) {
    const rn = Number(r.n ?? 0);
    const rq = Number(r.q ?? 0);
    n += rn;
    q += rq;
    cost += costOf(d.cost, rn, rq, Number(r[d.cost.field] ?? 0));
  }
  return { n, q, cost };
}

/** Хэмжээг уншихад ойлгомжтой нэгжээр — метрийг км, м²-ыг га болгоно */
/**
 * Хэмжээг УХААЛАГ нэгжээр — жижиг утга том нэгжид «0.0» болж бөөрөнхийлөгддөг
 * байсныг зассан (жишээ нь дугуйн замын бүс тус бүрийн 300–2000 м² талбай
 * «0.0 га» гэж гарч байв). 1 га-аас бага → м², 1 км-ээс богино → м.
 */
export const qtyText = (d: LayerDef, q: number): string | null => {
  if (!d.qty || q <= 0) return null;
  if (d.qty.unit === 'км') return q < 1 ? `${num(q * 1000)} м` : `${num(q, 1)} км`;
  if (d.qty.unit === 'м') return q < 1000 ? `${num(q)} м` : `${km(q, 1)} км`;
  return q < 10_000 ? `${num(q)} м²` : `${ha(q, 1)} га`;
};

/** Нэгж үнэ юунд ногдохыг үгээр */
export const costNote = (d: LayerDef): string => {
  if (!d.cost) return '—';
  return d.cost.basis === 'sh' ? '1 ш тутамд'
    : d.cost.basis === 'm100' ? '100 м тутамд'
      : d.cost.basis === 'km' ? '1 км тутамд' : '1 м² тутамд';
};

/** Геометрийн төрөл — дашбоардын толгойд */
export const geomText = (d: LayerDef): string =>
  d.geom === 'area' ? 'Талбай' : d.geom === 'line' ? 'Шугам' : 'Цэг';

/**
 * БАГЦЫН нийлбэр хэмжээ — «65.3 км · 26.7 га».
 *
 * ⚠️ Урт ба талбайг ТУСАД нь нийлүүлнэ. Багц дотор шугаман (м/км) ба талбайн
 * (м²) давхарга хольцтой байдаг — «Зам, тээвэр»-т замын тэнхлэг (км) ба явган
 * хүний зам (м²) хоёул орно. Тэдгээрийг нэг тоо болгон нэмбэл утгагүй дүн гарна.
 *
 * ⚠️ Цэгэн давхарга (`qty` талбаргүй) энд ОРОХГҮЙ — тэдгээрийн «хэмжээ» нь
 * ширхэгийн тоо бөгөөд мөрөнд аль хэдийн бичигдсэн байдаг.
 */
export function groupQty(ids: string[], map: ReadonlyMap<string, Totals>): string | null {
  let km = 0, ha = 0;
  for (const id of ids) {
    const d = LAYER_BY_ID[id];
    const t = map.get(id);
    if (!d?.qty || !t || t.q <= 0) continue;
    if (d.qty.unit === 'км') km += t.q;
    else if (d.qty.unit === 'м') km += t.q / 1_000;
    else ha += t.q / 10_000;
  }
  const parts: string[] = [];
  if (km > 0) parts.push(`${num(km, 1)} км`);
  if (ha > 0) parts.push(`${num(ha, 1)} га`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Ерөнхий мэдээллийн БҮХ давхаргын тоо, хэмжээ, өртөг — НЭГ УДАА.
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
    const entries = await Promise.all(
      ids.map(async (id) => {
        const d = LAYER_BY_ID[id];
        return [id, await layerTotals(d, whereFor(d, zone))] as const;
      }),
    );
    const map = new Map<string, Totals>(entries);
    totalsCache.set(key, map);
    return map;
  }, [key]);
}
