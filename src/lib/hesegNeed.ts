import { t as tr } from '@/lib/i18nCore';
import Query from '@arcgis/core/rest/support/Query';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryEngineAsync from '@arcgis/core/geometry/geometryEngineAsync';
import Polyline from '@arcgis/core/geometry/Polyline';
import Polygon from '@arcgis/core/geometry/Polygon';
import { LAYER_BY_ID, layerUrl, oidOf } from '@/lib/services';
import { loadInfra, queryPageSafe } from '@/lib/planOverlap';
import { register } from '@/lib/dataBus';
import { subscribeTotals } from '@/lib/totals';
import { NEED_TYPES, UNASSIGNED_ZONE, type NeedType } from '@/lib/hesegNeedSummary';
import { polygonCenterlinesAsync } from '@/lib/polygonCenterlineAsync';
import { buildRoutingGraph, routeUtilityNetwork, type RouteFailure, type RouteSegment } from '@/lib/utilityRouting';
export { NEED_TYPES, type NeedType } from '@/lib/hesegNeedSummary';

/**
 * 03 — зам/явган замын нийлсэн коридороор ижил төрлийн эх шугамд холбох урьдчилсан трасс.
 * Барилгын дотор тал саад болно; дундын магистраль, давхардсан хэсгийг нэг удаа тооцно.
 * Зайны босго анхдагчаар трассыг нуухгүй. Бүсийн хэмжээг шугамын физик огтлолцоор гаргана.
 * Хүчин чадал, даралт, диаметр, бохир усны хэвгий, эзэмшлийн эрхийн зураг төсөл биш.
 */

export type NeedLink = { type: NeedType; building: number; zone: string | null; lengthM: number; geometry: Polyline; segmentIds: string[] };
export type NeedSegment = {
  id: string; type: NeedType; lengthM: number; geometry: Polyline; buildings: number[];
  kind: RouteSegment['kind']; zoneLengths: Record<string, number>; zoneGeometries: Record<string, Polyline>;
};
export type NeedUnresolved = RouteFailure & { type: NeedType; zone: string | null };
/** Бүсийн төрөл бүрийн ОДОО БАЙГАА шугамын урт (м) ба зургийн шүүлтийн хүрээ */
export type NeedZone = {
  label: string; existingM: number; existingByType: Partial<Record<NeedType, number>>;
  buildings: number; geometry: __esri.GeometryUnion | null;
};
export type NeedResult = {
  buildings: number; buildingGeometries: Polygon[]; unassignedBuildings: number;
  links: NeedLink[]; segments: NeedSegment[]; unresolved: NeedUnresolved[];
  zones: NeedZone[]; existingOutsideGeometry: __esri.GeometryUnion | null;
  availableTypes: NeedType[]; failed: string[];
  routing: { resolutionM: number; spacingM: number; maxAccessM: number; maxTieM: number; warnings: string[] };
};

const WKID = 3857;
const BUILD_ID = 'rd:1';
/** Шинэчлэгдсэн бүс — `zone` талбартай (бүсээр нэгтгэлд) */
const ZONE_ID = 'rd:2';
type Geom = __esri.GeometryUnion;

async function fetchPolys(id: string, field?: string): Promise<Polygon[]> {
  const def = LAYER_BY_ID[id];
  if (!def) throw new Error(`«${id}» давхарга бүртгэлгүй`);
  const u = layerUrl(def);
  const out: Polygon[] = [];
  for (let start = 0; ; ) {
    const q = new Query({
      where: '1=1', outFields: field ? [field] : [], returnGeometry: true, outSpatialReference: { wkid: WKID },
      orderByFields: [`${oidOf(def)} ASC`], start, num: 2000,
    });
    /* ⚠️ 2026-10-19 (аудит): хугацаатай, нэвтрэх цонхгүй PBF → JSON (`planOverlap.queryPageSafe`-ийн ⚠️) */
    const res = await queryPageSafe(u, q);
    for (const f of res.features) {
      if (f.geometry?.type !== 'polygon') continue;
      const p = f.geometry as Polygon;
      /* Аттрибутыг геометр дээр «наана» — тусдаа бүтэц үүсгэхгүй (зөвхөн бүсийн `zone`) */
      if (field) (p as unknown as { __zone?: string }).__zone = String(f.attributes?.[field] ?? '').trim();
      out.push(p);
    }
    if (!res.features.length) break;
    if (res.features.length < 2000 && !res.exceededTransferLimit) break;
    start += res.features.length;
  }
  return out;
}

const yieldBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * ⚠️ Модулийн кэш (статик өгөгдөл) — алдаа гарвал устгана.
 * ⚠️ 2026-10-19 (аудит): ХЭСЭГЧИЛСЭН үр дүнг (`failed`) КЭШЛЭХГҮЙ (`hesegChange`-ийн ⚠️-тэй ижил) — урьд нь түр уналт
 *    сешн дуустал «өгөгдөл дутуу» хэвээр үлддэг байв; толгойн «Шинэчлэх» (`invalidateAll`) ч хаяна.
 */
let needCache: Promise<NeedResult> | null = null;
register(() => { needCache = null; }, []);
/* ⚠️ 2026-10-21 (кэшийн аудит): инженерийн шугамын засвар (`DedButets` → `dropTotalsCache`) — `planOverlap.loadInfra`-тай
   ХАМТ хаягдана, эс бөгөөс хэрэгцээний тооцоо засварын өмнөх геометрээр үлдэнэ (`planOverlap.ts`-ийн ижил ⚠️). */
subscribeTotals(() => { needCache = null; });

/**
 * ЯВЦЫН ТЕКСТ — тооцоог хүлээж буй БҮХ дуудагчид (самбар · зургийн давхарга), `planOverlap.onOverlapStep`-ийн загвар.
 * ⚠️ 2026-10-19 (аудит): урьд нь `onStep` нь ЗӨВХӨН тооцоог ЭХЛҮҮЛСЭН дуудагчид очдог байв — 03-ийн самбар
 *    (зургийн давхарга түрүүлж эхлүүлдэг) явцын текстгүй «Тооцоолж байна…» дээр зогсдог байлаа.
 */
/*
 * ⚠️ 2026-10-19 (review): ЯВЦ НЬ ТООЦООНЫ ҮЕ (generation)-ЭЭР ТУСГААРЛАГДСАН — урьд нь нэг глобал жагсаалт байсан тул
 *    «Шинэчлэх»-ийн дараа ХУУЧИН (хаягдсан) тооцоо үргэлжилсээр шинэ тооцооны хүлээгчдэд өөрийн явцыг илгээдэг байв.
 *    Одоо тооцоо бүр өөрийн `gen`-тэй; захиалагч тодорхой амлалтын (эсвэл явагдаж буй) үед л холбогдоно.
 */
type StepGen = { subs: Set<(msg: string) => void>; last: string };
const needGens = new Map<number, StepGen>();
const needGenOf = new WeakMap<Promise<NeedResult>, number>();
let needGenSeq = 0;
/** Одоо явагдаж буй (хамгийн сүүлд эхэлсэн) тооцооны үе; 0 = алга */
let needRunGen = 0;
/**
 * Явцын текстийг захиална — буцаасан функцээр цуцална (unmount). `p` өгвөл ЗӨВХӨН тэр тооцооны явц (`computeNeed`-ийн
 * буцаасан амлалт); өгөөгүй бол одоо явагдаж буйнх. Тооцоо дууссан/явагдаагүй бол юу ч хийхгүй.
 */
export function onNeedStep(fn: (msg: string) => void, p?: Promise<NeedResult>): () => void {
  const gen = p ? needGenOf.get(p) ?? 0 : needRunGen;
  const g = needGens.get(gen);
  if (!g) return () => {};
  g.subs.add(fn);
  if (g.last) fn(g.last);
  return () => { g.subs.delete(fn); };
}

/**
 * ⚠️ 2026-10-19 (review): БҮХ ТООЦООНЫ ДЭЭД ХУГАЦАА (`hesegChange.CHANGE_TIMEOUT_MS`-тэй ижил) — геометрийн worker гацвал
 *    самбар үүрд эргэлдэхгүй, алдаа харуулж кэш хаягдана (дараагийн нээлтэд дахин оролдоно).
 */
const NEED_TIMEOUT_MS = 4 * 60_000;

export function computeNeed(onStep?: (msg: string) => void): Promise<NeedResult> {
  if (needCache) {
    if (onStep) { const off = onNeedStep(onStep, needCache); void needCache.then(off, off); }
    return needCache;
  }
  const gen = ++needGenSeq;
  const sg: StepGen = { subs: new Set(), last: '' };
  needGens.set(gen, sg);
  needRunGen = gen;
  /* ⚠️ Зөвхөн ӨӨРИЙН үеийн захиалагчид — хаягдсан тооцоо шинийхэд явц илгээхгүй */
  const needStep = (msg: string) => {
    if (!needGens.has(gen)) return;
    sg.last = msg;
    for (const fn of sg.subs) fn(msg);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(tr('Тооцоо хэт удаж байна ({0} мин) — дахин нээж оролдоно уу.', NEED_TIMEOUT_MS / 60_000))), NEED_TIMEOUT_MS);
  });
  const work = (async (): Promise<NeedResult> => {
    needStep(tr('Инженерийн шугам татаж байна…'));
    const failed: string[] = [];
    const [{ feats, failed: infraFailed }, builds, zonePolys, corridorPolys] = await Promise.all([
      loadInfra(),
      fetchPolys(BUILD_ID).catch((e) => {
        console.warn('[selbe] нэмэлт хэрэгцээ: барилга татагдсангүй:', e);
        failed.push(LAYER_BY_ID[BUILD_ID]?.title ?? BUILD_ID);
        return [] as Polygon[];
      }),
      fetchPolys(ZONE_ID, 'zone').catch((e) => {
        console.warn('[selbe] нэмэлт хэрэгцээ: бүс татагдсангүй:', e);
        failed.push(LAYER_BY_ID[ZONE_ID]?.title ?? ZONE_ID);
        return [] as Polygon[];
      }),
      Promise.all(['rd:0', 'rd:11'].map((id) => fetchPolys(id).catch(() => {
        failed.push(LAYER_BY_ID[id]?.title ?? id);
        return [] as Polygon[];
      }))).then((parts) => parts.flat()),
    ]);
    const zoneOf = (p: Polygon) => (p as unknown as { __zone?: string }).__zone || null;
    /* Бүсийн ТӨРӨЛ бүрийн нэгтгэсэн хүрээ */
    const byType = new Map<string, Geom[]>();
    for (const z of zonePolys) {
      const k = zoneOf(z);
      if (k) (byType.get(k) ?? byType.set(k, []).get(k)!).push(z);
    }
    const typeGeom = new Map<string, Geom | null>();
    await Promise.all([...byType].map(async ([k, gs]) => {
      typeGeom.set(k, gs.length === 1 ? gs[0] : ((await geometryEngineAsync.union(gs)) as Geom | null));
    }));
    /**
     * Барилгын бүс — төв цэг нь аль төрлийн бүсэд байна (эхний таарсан, бүсийн дарааллаар).
     * ⚠️ 2026-10-19 (аудит): урьд нь барилга × бүс БҮРД синхрон `geometryEngine.contains` — хэдэн мянган барилгад
     *    үндсэн урсгалыг секундээр түгжиж, зураг/самбар хөлддөг байв. Одоо бүсийн ХҮРЭЭ (extent)-ээр урьдчилан шүүж
     *    (цэг хүрээнээс гадуур бол `contains` дуудахгүй) 200 барилга тутамд хөтөчид амсхийлгэнэ.
     */
    const zoneBoxes = zonePolys.map((z) => ({ z, label: zoneOf(z), e: z.extent }));
    const buildZone: (string | null)[] = [];
    for (let i = 0; i < builds.length; i += 1) {
      if (i % 200 === 199) await yieldBrowser();
      const c = builds[i].centroid;
      let hit: string | null = null;
      if (c) {
        for (const { z, label, e } of zoneBoxes) {
          if (!label) continue;
          if (e && (c.x < e.xmin || c.x > e.xmax || c.y < e.ymin || c.y > e.ymax)) continue;
          if (geometryEngine.contains(z, c)) { hit = label; break; }
        }
      }
      buildZone.push(hit);
    }
    failed.push(...infraFailed);
    needStep(tr('Тооцоолж байна…'));
    const buildAll = builds.length
      ? ((await geometryEngineAsync.union(builds as Geom[])) as Geom | null)
      : null;

    /* Төрөл бүрийн ХОЛБОГДОЖ БОЛОХ шугам = бүх шугам − шинэ барилгын доорх хэсэг */
    const usable = new Map<NeedType, Geom>();
    const existingNetworks = new Map<NeedType, Geom>();
    await Promise.all(NEED_TYPES.map(async (t) => {
      const ls = feats.filter((f) => f.type === t && f.geom.type === 'polyline').map((f) => f.geom);
      if (!ls.length) return;
      let u = (ls.length === 1 ? ls[0] : await geometryEngineAsync.union(ls)) as Geom | null;
      if (u) existingNetworks.set(t, u);
      if (u && buildAll) u = (await geometryEngineAsync.difference(u, buildAll)) as Geom | null;
      if (u?.type === 'polyline' && u.paths.some((path) => path.length > 1)) usable.set(t, u);
    }));

    needStep(tr('Замын коридороор инженерийн трасс тооцоолж байна…'));
    const y = builds[0]?.centroid?.y ?? corridorPolys[0]?.centroid?.y ?? 0;
    const metersPerUnit = 1 / Math.cosh(y / 6378137);
    const routing = { resolutionM: 1.5, spacingM: 8, maxAccessM: 80, maxTieM: 60, warnings: [] as string[] };
    const corridorPaths: number[][][] = [];
    const combinedCorridor = corridorPolys.length ? await geometryEngineAsync.union(corridorPolys) as Polygon | null : null;
    // Төв шугамыг бүтэн полигонд бодно; бүсээр шүүх нь дараагийн шат.
    for (const polygon of combinedCorridor ? [combinedCorridor] : []) {
      const centerline = await polygonCenterlinesAsync(polygon.rings, { resolution: 1.5 / metersPerUnit, maxCells: 1_500_000 });
      corridorPaths.push(...centerline.paths);
      routing.resolutionM = Math.max(routing.resolutionM, centerline.resolution * metersPerUnit);
      routing.warnings.push(...centerline.warnings);
      await yieldBrowser();
    }
    const routeBuildings = builds.map((building, id) => ({ id, rings: building.rings }));
    const graph = buildRoutingGraph({
      corridors: corridorPaths, buildings: routeBuildings, corridorPolygons: corridorPolys.map((polygon) => polygon.rings),
      metersPerUnit, spacingM: routing.spacingM, maxAccessM: routing.maxAccessM, maxTieM: routing.maxTieM,
    });
    const links: NeedLink[] = [], segments: NeedSegment[] = [], unresolved: NeedUnresolved[] = [];
    for (const type of NEED_TYPES) {
      await yieldBrowser();
      const network = usable.get(type);
      const routed = routeUtilityNetwork(graph, network?.type === 'polyline' ? network.paths : [], routeBuildings);
      for (const route of routed.routes) {
        const geometry = new Polyline({ paths: [route.path.length > 1 ? route.path : [route.path[0], route.path[0]]], spatialReference: { wkid: WKID } });
        links.push({ type, building: route.building, zone: buildZone[route.building], geometry,
          lengthM: route.path.length > 1 ? Math.max(0, geometryEngine.geodesicLength(geometry, 'meters')) : 0,
          segmentIds: route.segmentIds.map((id) => `${type}:${id}`) });
      }
      for (const segment of routed.segments) {
        const geometry = new Polyline({ paths: [segment.path], spatialReference: { wkid: WKID } });
        segments.push({ ...segment, id: `${type}:${segment.id}`, type, geometry,
          lengthM: Math.max(0, geometryEngine.geodesicLength(geometry, 'meters')), zoneLengths: {}, zoneGeometries: {} });
      }
      unresolved.push(...routed.unresolved.map((item) => ({ ...item, type, zone: buildZone[item.building] })));
    }
    routing.warnings = [...new Set(routing.warnings)];

    /* Бүсийн төрөл бүрийн ОДОО байгаа шугамын урт — тэр төрлийн бүсүүдээр тайрсан */
    const allLines = [...existingNetworks].map(([type, geometry]) => ({ type, geometry }));
    const zones: NeedZone[] = [];
    for (const [label, zg] of typeGeom) {
      if (!zg) continue;
      const e = zg.extent;
      const cand = e ? allLines.filter((f) => f.geometry.extent?.intersects(e)) : allLines;
      const parts = cand.length ? ((await geometryEngineAsync.intersect(cand.map((f) => f.geometry), zg)) as unknown as (Geom | null)[]) : [];
      const existingByType: Partial<Record<NeedType, number>> = {};
      parts.forEach((p, i) => {
        if (p?.type !== 'polyline') return;
        const type = cand[i].type;
        existingByType[type] = (existingByType[type] ?? 0) + Math.max(0, geometryEngine.geodesicLength(p, 'meters'));
      });
      const existingM = Object.values(existingByType).reduce((sum, value) => sum + value, 0);
      zones.push({ label, existingM, existingByType, buildings: buildZone.filter((z) => z === label).length, geometry: zg });
      // Нэг ерөнхий шугамыг барилгын тоогоор үржүүлэхгүй; бүсийн хилээр физик уртыг тайрна.
      const proposed = e ? segments.filter((segment) => segment.geometry.extent?.intersects(e)) : segments;
      const clipped = proposed.length ? await geometryEngineAsync.intersect(proposed.map((segment) => segment.geometry), zg) as unknown as (Geom | null)[] : [];
      clipped.forEach((geometry, i) => {
        if (geometry?.type === 'polyline') {
          proposed[i].zoneLengths[label] = Math.max(0, geometryEngine.geodesicLength(geometry, 'meters'));
          proposed[i].zoneGeometries[label] = geometry;
        }
      });
    }
    const zoneUnion = zonePolys.length ? await geometryEngineAsync.union(zonePolys) as Geom | null : null;
    const outside = zoneUnion && segments.length
      ? await geometryEngineAsync.difference(segments.map((segment) => segment.geometry), zoneUnion) as unknown as (Geom | null)[]
      : segments.map((segment) => segment.geometry);
    outside.forEach((geometry, i) => {
      if (geometry?.type !== 'polyline') return;
      segments[i].zoneLengths[UNASSIGNED_ZONE] = Math.max(0, geometryEngine.geodesicLength(geometry, 'meters'));
      segments[i].zoneGeometries[UNASSIGNED_ZONE] = geometry;
    });
    // Суурь инженерийн бүсээс гадуурх шүүлт: зөвхөн дотоод төлөвлөгөөний хүрээ, CAD алсын утга орохгүй.
    const localExtent = [...builds, ...corridorPolys, ...zonePolys, ...segments.map((segment) => segment.geometry)]
      .reduce<__esri.Extent | null>((extent, geometry) => geometry.extent ? extent ? extent.union(geometry.extent) : geometry.extent.clone() : extent, null);
    let existingOutsideGeometry: Geom | null = null;
    if (localExtent) {
      const margin = routing.maxTieM / metersPerUnit;
      localExtent.xmin -= margin; localExtent.ymin -= margin;
      localExtent.xmax += margin; localExtent.ymax += margin;
      const scope = Polygon.fromExtent(localExtent);
      existingOutsideGeometry = zoneUnion ? await geometryEngineAsync.difference(scope, zoneUnion) as Geom | null : scope;
    }
    return {
      buildings: builds.length, buildingGeometries: builds,
      unassignedBuildings: buildZone.filter((z) => z == null).length,
      links, segments, unresolved, zones, existingOutsideGeometry, availableTypes: [...usable.keys()], failed, routing,
    };
  })();
  const p = Promise.race([work, late]).finally(() => clearTimeout(timer));
  needGenOf.set(p, gen);
  needCache = p;
  if (onStep) { const off = onNeedStep(onStep, p); void p.then(off, off); }
  /* ⚠️ Зөвхөн ӨӨРИЙН үе — «Шинэчлэх»-ийн дараа эхэлсэн шинэ тооцооны бүртгэлийг хуучин нь арилгахгүй */
  const end = () => { needGens.delete(gen); if (needRunGen === gen) needRunGen = 0; };
  p.then((r) => { end(); if (r.failed.length && needCache === p) needCache = null; },
    () => { end(); if (needCache === p) needCache = null; });
  return p;
}
