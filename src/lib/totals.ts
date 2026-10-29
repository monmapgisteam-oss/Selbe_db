'use client';

/**
 * Давхаргын ТОО ба ХЭМЖЭЭНИЙ тооцоо.
 */

import { queryStats, count, sum, arcgisPost, type Aoi } from './query';
import { t as tr } from '@/lib/i18nCore';
import { layerUrl, OID, oidOf, CATALOG_LAYER_IDS, LAYER_BY_ID, ZONE_LAYER, zoneWhere, type LayerDef } from './services';
import { num, ha, km } from './format';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAsync, type Async } from './useAsync';
import { register } from './dataBus';

export type Totals = {
  n: number;
  q: number | null;
  /**
   * ХЭМЖЭЭНИЙ ТАЛБАР БӨГЛӨГДСӨН объектын тоо — `COUNT(qty.field)` (null-ыг тоолдоггүй).
   */
  nq?: number | null;
};

/**
 * ДАВХАРГЫН ТОГТМОЛ ШҮҮЛТ (`d.where`) + дуудагчийн шүүлт — AND-аар.
 */
export const withLayerWhere = (d: LayerDef, where: string | null | undefined): string => {
  const w = where && where.trim() && where.trim() !== '1=1' ? where : null;
  if (!d.where) return w ?? '1=1';
  const fixed = `(${d.where})`;
  if (!w) return fixed;
  if (w === fixed || w.startsWith(`${fixed} AND `)) return w;
  return `${fixed} AND (${w})`;
};

/**
 * Давхаргад тохирох бүсийн шүүлт.
 */
export const whereFor = (d: LayerDef, zone: string | null) =>
  withLayerWhere(d, zone ? zoneWhere(d, zone) : null);

/** Давхаргын статистикийн хүсэлт — тоо ба (байвал) хэмжээ */
export const layerStats = (d: LayerDef) =>
  [count(d.oid ?? OID, 'n'), ...(d.qty ? [sum(d.qty.field, 'q'), count(d.qty.field, 'nq')] : [])];

/**
 * НЭГ ОБЪЕКТЫН ДУНДАЖ ХЭМЖЭЭ — хэмжээ БӨГЛӨГДСӨН объектоор хуваана (`nq`).
 */
export const avgQty = (t: Totals | undefined | null): number | null =>
  (t && t.q != null && t.nq != null && t.nq > 0 ? t.q / t.nq : null);

/**
 * ХЭМЖЭЭГҮЙ объектын тоо (`n - nq`) — «N объект уртгүй».
 */
export const missingQty = (t: Totals | undefined | null): number | null =>
  (t && t.nq != null ? Math.max(0, t.n - t.nq) : null);

/**
 * ТАТАГДААГҮЙ давхаргууд — `ids`-ээс `map`-д БАЙХГҮЙ нь (`usePlanTotals`-ын дутуу Map).
 */
export const failedTotals = (map: ReadonlyMap<string, Totals>, ids: readonly string[]): string[] =>
  ids.filter((id) => !map.has(id));

/**
 * `usePlanTotals`-ын буцаасан Map-ын УНАСАН id-ууд — хүссэн `ids` нь дуудагчид үл мэдэгдэх
 * үед (каталог — `LayerCatalog`). 2026-10-06: Map-ыг өөрийг нь түлхүүр болгосон WeakMap —
 * Map-ын төрөл/дуудагчдын гэрээ ӨӨРЧЛӨГДӨХГҮЙ; бүрэн Map-д хоосон жагсаалт.
 */
const PARTIAL = new WeakMap<ReadonlyMap<string, Totals>, readonly string[]>();
export const totalsFailedOf = (map: ReadonlyMap<string, Totals>): readonly string[] => PARTIAL.get(map) ?? [];

/**
 * БҮРЭН НИЙЛБЭР — `ids`-ийн БҮГД татагдсан бөгөөд утгатай үед л тоо, эс бөгөөс `null` («—»).
 */
export function completeSum(
  map: ReadonlyMap<string, Totals>,
  ids: readonly string[],
  pick: (t: Totals) => number | null = (t) => t.q,
): number | null {
  let s = 0;
  for (const id of ids) {
    const t = map.get(id);
    const v = t ? pick(t) : null;
    if (v == null || !Number.isFinite(v)) return null;
    s += v;
  }
  return s;
}


/**
 * Давхаргын ТОО ба ХЭМЖЭЭГ нэг хүсэлтээр (`outStatistics`).
 */
export async function layerTotals(d: LayerDef, where: string, aoi?: Aoi): Promise<Totals> {
  const r = await queryStats(layerUrl(d), layerStats(d), withLayerWhere(d, where), aoi);
  return {
    n: Number(r.n ?? 0),
    q: r.q == null ? null : Number(r.q),
    nq: d.qty ? (r.nq == null ? null : Number(r.nq)) : null,
  };
}

/* ══════════ Бүсийн полигон — орон зайн шүүлт (2026-10-01) ══════════ */

/**
 * БҮСИЙН ПОЛИГОН — `ZONE_ID` талбаргүй (`noZone`) давхаргыг бүсээр шүүхэд.
 */
const zoneAoiCache = new Map<string, Promise<Aoi | null>>();
export function loadZoneAoi(zone: string): Promise<Aoi | null> {
  const hit = zoneAoiCache.get(zone);
  if (hit) return hit;
  const where = zoneWhere(ZONE_LAYER, zone);
  const p: Promise<Aoi | null> = where == null ? Promise.resolve(null) : arcgisPost<{
    spatialReference?: { wkid?: number; latestWkid?: number };
    features?: { geometry?: { rings?: number[][][] } }[];
  }>(`${layerUrl(ZONE_LAYER)}/query`, {
    where,
    outFields: oidOf(ZONE_LAYER),
    returnGeometry: 'true',
  }).then((j) => {
    const rings = (j.features ?? []).flatMap((f) => f.geometry?.rings ?? []);
    const wkid = j.spatialReference?.latestWkid ?? j.spatialReference?.wkid;
    if (!rings.length || !wkid) return null;
    const aoi: Aoi = { geometry: { rings, spatialReference: { wkid } }, wkid, type: 'polygon', rel: 'intersects' };
    return aoi;
  });
  p.catch(() => zoneAoiCache.delete(zone));
  zoneAoiCache.set(zone, p);
  return p;
}

/**
 * Хэмжээг УХААЛАГ нэгжээр — жижиг утга том нэгжид «0.0» болж бөөрөнхийлөгддөг
 * байсныг зассан (жишээ нь дугуйн замын бүс тус бүрийн 300–2000 м² талбай
 * «0.0 га» гэж гарч байв). 1 га-аас бага → м², 1 км-ээс богино → м.
 */
export const qtyText = (d: LayerDef, q: number | null): string | null => {
  if (!d.qty || q == null || !Number.isFinite(q) || q < 0) return null;
  if (d.qty.unit === 'км') return q < 1 ? tr('{0} м', num(q * 1000)) : tr('{0} км', num(q, 1));
  if (d.qty.unit === 'м') return q < 1000 ? tr('{0} м', num(q)) : tr('{0} км', km(q, 1));
  return q < 10_000 ? tr('{0} м²', num(q)) : tr('{0} га', ha(q, 1));
};

/** Геометрийн төрөл — дашбоардын толгойд */
export const geomText = (d: LayerDef): string =>
  d.geom === 'area' ? tr('Талбай') : d.geom === 'line' ? tr('Шугам') : tr('Цэг');

/**
 * Ерөнхий мэдээллийн БҮХ давхаргын тоо ба хэмжээ — НЭГ УДАА.
 */
/**
 * SESSION КЭШ — нэг удаа татсан (бүс, давхаргын багц)-ын дүнг санана.
 */
const totalsCache = new Map<string, Map<string, Totals>>();

/**
 * ХӨТЧИЙН КЭШ (`localStorage`) — ХУУЧИН ДҮНГ ШУУД, ШИНИЙГ АРААС НЬ (stale-while-revalidate).
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
    const rows = JSON.parse(raw) as [string, number, number | null, (number | null)?][];
    if (!Array.isArray(rows)) return null;
    const want = new Set(ids);
    const map = new Map<string, Totals>();
    for (const r of rows) {
      if (!Array.isArray(r) || !want.has(r[0])) continue;
      const n = Number(r[1]);
      const q = r[2] == null ? null : Number(r[2]);
      const nq = r[3] == null ? null : Number(r[3]);
      if (Number.isFinite(n) && (q == null || Number.isFinite(q)) && (nq == null || Number.isFinite(nq))) {
        map.set(r[0], { n, q, nq });
      }
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
      return [id, t.n, t.q, t.nq ?? null] as const;
    });
    localStorage.setItem(persistKey(zone, ids), JSON.stringify(rows));
  } catch {
    /* хаалттай storage — кэшгүй ажиллана */
  }
}

/**
 * КЭШИЙГ ХҮЧИНГҮЙ БОЛГОХ ЗАМ — атрибут засварын дараа.
 */
let totalsEpochN = 0;
const totalsSubs = new Set<() => void>();

export function dropTotalsCache(): void {
  totalsCache.clear();
  layerCache.clear();
  layerDone.clear();
  layerFail.clear();
  totalsEpochN += 1;
  for (const fn of totalsSubs) fn();
  bumpLayers();
}

/* ══════════ ДАВХАРГА ТУС БҮРИЙН КЭШ (2026-10-22, гүйцэтгэлийн аудит) ══════════ */

/**
 * ДАВХАРГА ТУС БҮРИЙН АМЛАЛТ — `эрин|бүс|id` → `layerTotals`.
 */
const layerCache = new Map<string, Promise<Totals>>();
/** Шийдэгдсэн утга — `useLazyTotals` зурах үедээ синхрон уншина */
const layerDone = new Map<string, Totals>();
/** Сүүлийн оролдлого нь унасан түлхүүрүүд (дахин оролдоход арилна) */
const layerFail = new Set<string>();
const layerKey = (epoch: number, zone: string | null, id: string): string => `${epoch}|${zone ?? ''}|${id}`;

/** Давхаргын кэшийн өөрчлөлтийн дохио — ~100 мс-д НЭГ удаа (`usePlanTotalsLive`-ийн хэсэгчилсэн шинэчлэлийн зарчим) */
let layersVer = 0;
const layerSubs = new Set<() => void>();
let layerTimer: ReturnType<typeof setTimeout> | null = null;
function bumpLayers(): void {
  if (layerTimer != null) return;
  layerTimer = setTimeout(() => {
    layerTimer = null;
    layersVer += 1;
    for (const fn of layerSubs) fn();
  }, 100);
}
const subscribeLayers = (fn: () => void): (() => void) => {
  layerSubs.add(fn);
  return () => { layerSubs.delete(fn); };
};
const layersVersion = (): number => layersVer;
/** Хүсэлтгүй (хаалттай каталог) дуудагч — бусдын татлагаар 100 мс тутам дэмий зурагдахгүй */
const subscribeNone = (): (() => void) => () => {};
const versionNone = (): number => 0;

/**
 * НЭГ ДАВХАРГЫН тоо/хэмжээ — эрин ба бүсээр ХУВААЛЦСАН амлалт (дээрх). Шүүлт нь урьдын адил `whereFor`.
 */
export function layerTotalsShared(zone: string | null, id: string): Promise<Totals> {
  const k = layerKey(totalsEpochN, zone, id);
  const hit = layerCache.get(k);
  if (hit) return hit;
  layerFail.delete(k);
  const d = LAYER_BY_ID[id];
  const p = d ? layerTotals(d, whereFor(d, zone)) : Promise.reject(new Error(`unknown layer: ${id}`));
  layerCache.set(k, p);
  p.then(
    (t) => { if (layerCache.get(k) === p) { layerDone.set(k, t); bumpLayers(); } },
    () => { if (layerCache.get(k) === p) { layerCache.delete(k); layerFail.add(k); bumpLayers(); } },
  );
  return p;
}

/** `useLazyTotals`-ийн үр дүн */
export type LazyTotals = {
  /** Ирсэн давхаргууд (хүссэн `ids`-ээс) */
  map: ReadonlyMap<string, Totals>;
  /** Хүлээгдэж буй давхаргын тоо — 0 бол бүгд шийдэгдсэн («· тоолж байна…») */
  pending: number;
  /** Унасан id-ууд — «N давхарга татагдсангүй · дахин оролдох» (`retryTotals`); мөрөнд «—» */
  failed: readonly string[];
};

/**
 * Хүссэн давхаргын үр дүнг кэшээс ялгана (цэвэр — `totals.check`): ирсэн → `map`, унасан (дахин оролдоогүй) → `failed`,
 * бусад нь хүлээгдэж буй. Унасан ч явж буй (дахин оролдож буй) бол хүлээгдэж буй.
 */
export function lazyView(
  ids: readonly string[],
  keyOf: (id: string) => string,
  done: ReadonlyMap<string, Totals>,
  fail: ReadonlySet<string>,
  inflight: { has(k: string): boolean },
): LazyTotals {
  const map = new Map<string, Totals>();
  const failed: string[] = [];
  let pending = 0;
  for (const id of new Set(ids)) {
    const k = keyOf(id);
    const v = done.get(k);
    if (v) map.set(id, v);
    else if (fail.has(k) && !inflight.has(k)) failed.push(id);
    else pending += 1;
  }
  return { map, pending, failed };
}

/**
 * ХАРАГДАЖ БУЙ давхаргуудын тоо — давхарга тус бүрээр, ирсэн бүрийг шууд (2026-10-22).
 */
export function useLazyTotals(zone: string | null, ids: readonly string[], enabled = true): LazyTotals {
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const idsKey = ids.join(',');
  /* Кэш өөрчлөгдөхөд дахин зурагдана — үр дүнг доор модулийн кэшээс шууд уншина */
  const live = enabled && idsKey !== '';
  useSyncExternalStore(live ? subscribeLayers : subscribeNone, live ? layersVersion : versionNone, live ? layersVersion : versionNone);
  const base = `${epoch}|${zone ?? ''}`;
  /** Энэ mount-д (бүс · эрин) аль хэдийн асуусан id — унасныг давтан асуухгүй */
  const tried = useRef<{ base: string; ids: Set<string> }>({ base: '', ids: new Set() });
  useEffect(() => {
    if (!enabled) return;
    if (tried.current.base !== base) tried.current = { base, ids: new Set() };
    const seen = tried.current.ids;
    for (const id of idsKey ? idsKey.split(',') : []) {
      const k = layerKey(totalsEpochN, zone, id);
      if (layerDone.has(k) || layerCache.has(k) || seen.has(id)) continue;
      seen.add(id);
      layerTotalsShared(zone, id).catch(() => { /* `layerFail`-д — `lazyView` «—» болгоно */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, idsKey, enabled]);
  if (!enabled) return { map: new Map(), pending: 0, failed: [] };
  return lazyView(ids, (id) => layerKey(epoch, zone, id), layerDone, layerFail, layerCache);
}

register(() => dropTotalsCache(), []);

/** `useSyncExternalStore`-д — ЗААВАЛ модулийн түвшний тогтмол лавлагаа байна */
export function subscribeTotals(fn: () => void): () => void {
  totalsSubs.add(fn);
  return () => { totalsSubs.delete(fn); };
}

export function totalsEpoch(): number {
  return totalsEpochN;
}

/**
 * ДАХИН ТАТАХ — унасан давхаргын дүнг хэрэглэгч ӨӨРӨӨ дахин оролдуулна.
 */
export function retryTotals(): void {
  dropTotalsCache();
}

export function usePlanTotals(
  zone: string | null,
  enabled = true,
  ids: string[] = CATALOG_LAYER_IDS,
): Async<Map<string, Totals>> {
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const key = `${enabled ? 'on' : 'off'}|${zone ?? ''}|${epoch}|${ids.join(',')}`;
  return useAsync(async () => {
    if (!enabled) return new Map<string, Totals>();
    const hit = totalsCache.get(key);
    if (hit) return hit;
    const settled = await Promise.allSettled(
      ids.map(async (id) => [id, await layerTotalsShared(zone, id)] as const),
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
      PARTIAL.set(map, failed);
      return map;
    }
    totalsCache.set(key, map);
    return map;
  }, [key]);
}

/**
 * ДЭВШИЛТТЭЙ НИЙЛБЭР — үр дүн ирэх бүрд шинэчлэгдэнэ.
 *
 * Энэ хувилбар нь ирсэн бүрийг нь ТЭР ДАРУЙ гаргана: эхний тоо ~300 мс-д
 * гарч, бүлгүүд дүүрсээр байна.
 */
export type LiveTotals = {
  map: Map<string, Totals>;
  /** Хэдэн давхаргын дүн ирсэн (амжилтгүй нь ч тоологдоно — хүлээлт дуусна) */
  done: number;
  total: number;
  /** БҮГД унасан — жинхэнэ алдаа (нэг нэгээр унах нь `map`-д дутуугаар илэрнэ) */
  error: Error | null;
  /**
   * ХЭДЭН давхарга унасан — дуудагч «N давхарга татагдсангүй» гэж ил хэлж,
   * `retryTotals`-оор дахин оролдуулна. Урьд нь зөвхөн console-д гардаг байв.
   */
  failed: number;
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
  opts?: { spatialZone?: boolean },
): LiveTotals {
  const epoch = useSyncExternalStore(subscribeTotals, totalsEpoch, totalsEpoch);
  const sp = Boolean(opts?.spatialZone && zone);
  const key = `${enabled ? 'on' : 'off'}|${zone ?? ''}${sp ? '|sp' : ''}|${epoch}|${ids.join(",")}`;
  const pzone = sp ? `${zone}|sp` : zone;
  const [st, setSt] = useState<LiveTotals>(() => ({
    map: new Map(), done: 0, total: ids.length, error: null, failed: 0, stale: false,
  }));

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSt({ map: new Map(), done: 0, total: 0, error: null, failed: 0, stale: false });
      return undefined;
    }
    const hit = totalsCache.get(key);
    if (hit) {
      setSt({ map: hit, done: hit.size, total: ids.length, error: null, failed: 0, stale: false });
      return undefined;
    }
    let alive = true;
    const map = new Map<string, Totals>();
    let done = 0;
    let failed = 0;
    /**
     * ХӨТЧИЙН КЭШ — өмнөх session-ийн бүрэн дүн. Байвал ТЭР ДАРУЙ гаргана,
     * амьд дүн ирэх бүрд давхарга бүрээр дарж бичнэ (`view()`). Байхгүй бол
     * урьдын адил «…»-ээс эхэлнэ. (`totalsCache`-ийн тайлбарыг үз.)
     */
    const seed = loadPersisted(pzone, ids);
    /* Дэлгэцэнд өгөх Map: кэш доор, амьд дүн дээр. Амьд дүн бүгд ирмэгц
       кэш хэрэггүй — зөвхөн амьд Map үлдэнэ. */
    const view = () => (seed ? new Map([...seed, ...map]) : new Map(map));
    setSt({ map: view(), done: 0, total: ids.length, error: null, failed: 0, stale: !!seed });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (!alive) return;
      setSt({ map: view(), done, total: ids.length, error: null, failed, stale: !!seed });
    };
    const bump = () => { if (timer == null) timer = setTimeout(flush, 120); };

    void (async () => {
      let firstErr: Error | null = null;
      const aoi = sp && zone ? await loadZoneAoi(zone).catch(() => null) : null;
      if (!alive) return;
      await Promise.all(ids.map(async (id) => {
        const d = LAYER_BY_ID[id];
        try {
          const r = aoi && d.noZone
            ? await layerTotals(d, withLayerWhere(d, null), aoi)
            : await layerTotals(d, whereFor(d, zone));
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
      if (!failed) {
        totalsCache.set(key, map);
        savePersisted(pzone, ids, map);
      }
      setSt({
        map: new Map(map),
        done: ids.length,
        total: ids.length,
        error: ids.length > 0 && failed === ids.length ? (firstErr ?? new Error("no data")) : null,
        failed,
        stale: false,
      });
    })();

    return () => {
      alive = false;
      if (timer != null) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return st;
}
