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
import { useEffect, useState, useSyncExternalStore } from 'react';
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

/**
 * ХӨТЧИЙН КЭШ (`localStorage`) — ХУУЧИН ДҮНГ ШУУД, ШИНИЙГ АРААС НЬ (stale-while-revalidate).
 *
 * ⚠️ 2026-09-16 (хэрэглэгч «Инженерийн дэд бүтэц» хуудсыг хурдан болгохыг
 * хүссэн). Хэмжилт (амьд үйлчилгээ, 74 давхарга, 12 зэрэг): статистикийн
 * нэг хүсэлт ДУНДЖААР 497 мс, бүгд 3.2 секунд — энэ хугацаанд KPI ба багцын
 * жагсаалт «…» харагдана. Дүн нь session-ээс session-д бараг өөрчлөгдөхгүй
 * тул сүүлд БҮРЭН ирсэн дүнг хөтчид хадгалж, дараагийн нээлтэд тэр даруй
 * гаргана; амьд хүсэлтүүд араас нь ирж давхарга бүрээр ДАРЖ бичнэ.
 *
 * ⚠️ Түлхүүрт `epoch` ОРОХГҮЙ: засварын дараа `dropTotalsCache()` эринийг
 * өсгөдөг ч хөтчийн кэш нь «сүүлийн бүрэн дүн» хэвээр — тэр нь хамгийн
 * ихдээ нэг объектын зөрүүтэй, ~3 секундын дараа амьд дүнгээр солигдоно.
 * `LiveTotals.stale` нь энэ агшинд `true` — дуудагч хүсвэл тэмдэглэнэ.
 *
 * ⚠️ ЗӨВХӨН БҮРЭН (нэг ч давхарга унаагүй) дүнг хадгална — дутуу хадгалбал
 * унасан давхарга дараагийн нээлтэд ч «—» гэж гарна.
 *
 * ⚠️ `null ≠ 0` дүрэм: хадгалсан дүн нь БОДИТ хэмжилт (хуучин ч гэсэн), 0-ээр
 * орлуулсан «мэдэхгүй» биш. Мэдэхгүй давхарга (кэшид байхгүй) `map`-д
 * ОРОХГҮЙ хэвээр тул дуудагчийн `has()` шалгалт өмнөх шигээ ажиллана.
 *
 * Private горим, хаалттай storage → try/catch, чимээгүй алгасна.
 */
const PERSIST_PREFIX = 'selbe-totals:';
/** Богино, тогтвортой түлхүүр — 74 id-ийн 1 KB мөрийг storage-ийн нэр болгохгүй */
const hashKey = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const persistKey = (zone: string | null, ids: string[]) =>
  `${PERSIST_PREFIX}${hashKey(`${zone ?? ''}|${ids.join(',')}`)}`;

function loadPersisted(zone: string | null, ids: string[]): Map<string, Totals> | null {
  try {
    const raw = localStorage.getItem(persistKey(zone, ids));
    if (!raw) return null;
    const rows = JSON.parse(raw) as [string, number, number][];
    if (!Array.isArray(rows)) return null;
    const want = new Set(ids);
    const map = new Map<string, Totals>();
    for (const r of rows) {
      if (!Array.isArray(r) || !want.has(r[0])) continue;
      const n = Number(r[1]), q = Number(r[2]);
      if (Number.isFinite(n) && Number.isFinite(q)) map.set(r[0], { n, q });
    }
    return map.size ? map : null;
  } catch {
    return null;
  }
}

function savePersisted(zone: string | null, ids: string[], map: Map<string, Totals>): void {
  try {
    const rows = ids.filter((id) => map.has(id)).map((id) => {
      const t = map.get(id)!;
      return [id, t.n, t.q] as const;
    });
    localStorage.setItem(persistKey(zone, ids), JSON.stringify(rows));
  } catch {
    /* хаалттай storage — кэшгүй ажиллана */
  }
}

/**
 * КЭШИЙГ ХҮЧИНГҮЙ БОЛГОХ ЗАМ — атрибут засварын дараа.
 *
 * ⚠️ ЯАГААД `dataBus.invalidate`-ЭЭР БОЛОХГҮЙ ВЭ: дээрх кэш нь `cached()`
 * слот БИШ, энэ модулийн өөрийн `Map` бөгөөд `useAsync` нь `key` мөрөөр
 * л дахин татдаг. Кэшийг цэвэрлэхэд `key` өөрчлөгддөггүй тул хуучин утга
 * ХЭВЭЭР харагдана — тиймээс эрин (`epoch`) тоолуурыг key-д оруулж,
 * захиалагчдыг сэрээнэ.
 *
 * ⚠️ Засвар ҮЙЛЧИЛГЭЭНД амжилттай бичигдсэний ДАРАА л дуудна: амжилтгүй
 * бичилтийн дараа хаявал сайн өгөгдлийг дэмий 119 хүсэлтээр дахин татна.
 */
let totalsEpochN = 0;
const totalsSubs = new Set<() => void>();

export function dropTotalsCache(): void {
  totalsCache.clear();
  totalsEpochN += 1;
  for (const fn of totalsSubs) fn();
}

/** `useSyncExternalStore`-д — ЗААВАЛ модулийн түвшний тогтмол лавлагаа байна */
export function subscribeTotals(fn: () => void): () => void {
  totalsSubs.add(fn);
  return () => { totalsSubs.delete(fn); };
}

export function totalsEpoch(): number {
  return totalsEpochN;
}

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
  /* ⚠️ `epoch` нь key-д ОРНО — засварын дараа `dropTotalsCache()` дуудахад
     энэ утга өсөж, `useAsync` дүнг шинээр татна (дээрх тайлбарыг үзнэ үү). */
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const key = `${enabled ? 'on' : 'off'}|${zone ?? ''}|${epoch}|${ids.join(',')}`;
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

/**
 * ДЭВШИЛТТЭЙ НИЙЛБЭР — үр дүн ирэх бүрд шинэчлэгдэнэ.
 *
 * ⚠️ ЯАГААД `usePlanTotals`-ААС ТУСДАА ВЭ. Тэр нь БҮХ давхаргын дүн
 * ирэх хүртэл `loading` төлөвтэй байдаг. «Инженерийн дэд бүтэц» хуудсанд
 * энэ нь 74 давхарга × (зэрэг 6) = хэмжсэнээр 4.2 секундын ХООСОН хүлээлт
 * болж байв (2026-09-14-нд амьд үйлчилгээ дээр хэмжсэн: нэг хүсэлт дунджаар
 * 318 мс, медиан 264, хамгийн удаан 801). Тэр хугацаанд дэлгэц дээр ердөө
 * «Тооцоолж байна…» гэсэн нэг мөр байв.
 *
 * Энэ хувилбар нь ирсэн бүрийг нь ТЭР ДАРУЙ гаргана: эхний тоо ~300 мс-д
 * гарч, бүлгүүд дүүрсээр байна.
 *
 * ⚠️ ДУТУУ НИЙЛБЭР ГАРГАХГҮЙ. Дуудагч тал `have()`-ээр шалгаж, багцынхаа
 * БҮХ давхарга ирсэн үед л тоог үзүүлнэ. Дутуу олонлогийн нийлбэрийг
 * шууд бичвэл «146 км» гэх ёстой тоо эхлээд «31 км» гэж гарч, хэрэглэгч
 * түүнийг БОДИТ утга гэж уншина (`null ≠ 0`-ийн ижил сургамж).
 *
 * ⚠️ `usePlanTotals`-ийн session кэшийг ХУВААЛЦАНА: нэг хуудсанд хоёулаа
 * ажиллавал (каталог + KPI) хоёр дахь нь татахгүй, шууд бэлэн авна.
 */
export type LiveTotals = {
  map: Map<string, Totals>;
  /** Хэдэн давхаргын дүн ирсэн (амжилтгүй нь ч тоологдоно — хүлээлт дуусна) */
  done: number;
  total: number;
  /** БҮГД унасан — жинхэнэ алдаа (нэг нэгээр унах нь `map`-д дутуугаар илэрнэ) */
  error: Error | null;
  /**
   * `map`-ын зарим утга ХӨТЧИЙН КЭШЭЭС (өмнөх session) — амьд дүн хараахан
   * бүгд ирээгүй. Бүгд ирмэгц `false`. Дуудагч заавал хэрэглэх албагүй.
   */
  stale: boolean;
};

export function usePlanTotalsLive(
  zone: string | null,
  enabled = true,
  ids: string[] = CATALOG_LAYER_IDS,
): LiveTotals {
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const key = `${enabled ? 'on' : 'off'}|${zone ?? ''}|${epoch}|${ids.join(",")}`;
  const [st, setSt] = useState<LiveTotals>(() => ({
    map: new Map(), done: 0, total: ids.length, error: null, stale: false,
  }));

  useEffect(() => {
    if (!enabled) {
      setSt({ map: new Map(), done: 0, total: 0, error: null, stale: false });
      return undefined;
    }
    const hit = totalsCache.get(key);
    if (hit) {
      setSt({ map: hit, done: hit.size, total: ids.length, error: null, stale: false });
      return undefined;
    }
    let alive = true;
    /* ⚠️ ШИНЭ Map — өмнөх бүс/багцын дүнг ҮРГЭЛЖЛҮҮЛЖ БОЛОХГҮЙ: хуучин
       давхаргын тоо шинэ олонлогийнх мэт харагдана. */
    const map = new Map<string, Totals>();
    let done = 0;
    let failed = 0;
    /**
     * ХӨТЧИЙН КЭШ — өмнөх session-ийн бүрэн дүн. Байвал ТЭР ДАРУЙ гаргана,
     * амьд дүн ирэх бүрд давхарга бүрээр дарж бичнэ (`view()`). Байхгүй бол
     * урьдын адил «…»-ээс эхэлнэ. (`totalsCache`-ийн тайлбарыг үз.)
     */
    const seed = loadPersisted(zone, ids);
    /* Дэлгэцэнд өгөх Map: кэш доор, амьд дүн дээр. Амьд дүн бүгд ирмэгц
       кэш хэрэггүй — зөвхөн амьд Map үлдэнэ. */
    const view = () => (seed ? new Map([...seed, ...map]) : new Map(map));
    setSt({ map: view(), done: 0, total: ids.length, error: null, stale: !!seed });

    /**
     * ⚠️ ХЭСЭГЧИЛСЭН ШИНЭЧЛЭЛ. Хүсэлт бүрд `setSt` дуудвал 74 рендер болно;
     * тэдгээрийн бүр нь 74 элементийн нийлбэрийг дахин бодно. Тиймээс
     * хуримтлуулаад ~120 мс тутамд НЭГ УДАА нийтэлнэ — нүд ялгахгүй
     * хугацаа боловч рендерийн ачаалал 10 дахин буурна.
     */
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (!alive) return;
      /* ⚠️ Map-ыг ХУУЛЖ өгнө — React нь лавлагааны адилтгалаар шалгадаг тул
         нэг Map-ыг мутацлаад дамжуулбал дахин рендер ОГТ болохгүй. */
      setSt({ map: view(), done, total: ids.length, error: null, stale: !!seed });
    };
    const bump = () => { if (timer == null) timer = setTimeout(flush, 120); };

    void (async () => {
      let firstErr: Error | null = null;
      await Promise.all(ids.map(async (id) => {
        const d = LAYER_BY_ID[id];
        try {
          const r = await layerTotals(d, whereFor(d, zone));
          if (!alive) return;
          map.set(id, r);
        } catch (e) {
          failed += 1;
          firstErr ??= e as Error;
        } finally {
          done += 1;
          bump();
        }
      }));
      if (!alive) return;
      if (timer != null) { clearTimeout(timer); timer = null; }
      if (failed) {
        console.warn(`[selbe] usePlanTotalsLive: ${failed} давхаргын тоо татагдсангүй`);
      }
      /* ⚠️ ЗӨВХӨН БҮРЭН дүнг кэшлэнэ — дутуу Map кэшлэгдвэл унасан давхарга
         session дуустал «—» хэвээр үлдэж, өөрөө эдгэрэхгүй. */
      if (!failed) {
        totalsCache.set(key, map);
        savePersisted(zone, ids, map);
      }
      /* ⚠️ Дууссаны дараа ЗӨВХӨН амьд Map: унасан давхарга кэшийн хуучин
         дүнгээр «эдгэрч» харагдах ёсгүй — тэр нь «—» гэж ил гарна. */
      setSt({
        map: new Map(map),
        done: ids.length,
        total: ids.length,
        error: failed === ids.length ? (firstErr ?? new Error("no data")) : null,
        stale: false,
      });
    })();

    return () => {
      alive = false;
      if (timer != null) clearTimeout(timer);
    };
    /* ⚠️ `ids` нь дуудагч талд `useMemo`-гүй байж болох тул `key`-ээр л
       хамаарна — тэр нь id-уудыг өөрсдийг нь агуулна. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return st;
}
