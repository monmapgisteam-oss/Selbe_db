/**
 * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — орон зайн огтлолцол.
 *
 * «Үлдсэн нэгж талбар» гэдэг нь чөлөөлөгдөөгүй, БАРИЛГА ЭХЛҮҮЛЭХЭД СААД болж буй
 * газар. Багцын мөрөн дээр ийм талбар байвал тэр ажил эхлэх боломжгүй тул багц
 * сонгоход ЭНЭ ТОО хамгийн эхэнд хэрэгтэй.
 */

import { PARCEL_LEFT, LAYER_BY_ID, parcelLeftWhere } from './services';
import { arcgisPost } from './query';
import { register } from './dataBus';
import { subscribeTotals } from './totals';
import { t as tr } from '@/lib/i18nCore';
import { isClearedStatus } from './land';

/**
 * Барилга эхлүүлэхэд саад болж буй нэгж талбарын SQL нөхцөл.
 */

/** Огтлолцуулах эх сурвалж — давхарга + (сонголтоор) түүний шүүлт. */
export type Src = { layerId: string; where?: string | null };

export type Overlap = {
  /** Давхцаж буй ҮЛДСЭН нэгж талбарын ObjectID-ууд */
  oids: number[];
  /**
   * ТАТАГДААГҮЙ эх сурвалжуудын `layerId` — хоосон бол бүрэн тоологдсон.
   */
  failed?: string[];
};

const post = (url: string, params: Record<string, string>) =>
  arcgisPost<{ features?: unknown[]; exceededTransferLimit?: boolean; objectIds?: number[] }>(`${url}/query`, params);

/** Парселийн давхаргын проекц — нэг л удаа асууж кэшлэнэ. */
let srCache: Promise<number> | null = null;
function parcelSR(): Promise<number> {
  if (!srCache)
    srCache = arcgisPost<{ extent?: { spatialReference?: { wkid?: number; latestWkid?: number } } }>(PARCEL_LEFT.url, {})
      .then((m) => {
        const sr = m?.extent?.spatialReference;
        return Number(sr?.wkid ?? sr?.latestWkid) || 32648;
      })
      .catch(() => {
        srCache = null;
        return 32648;
      });
  return srCache;
}

/**
 * НЭГ ОБЪЕКТЫН геометр (2026-10-01). Урьд нь давхаргын геометр шууд `Geoms` болж
 * хавтгайрдаг байв; одоо объект бүр тусдаа — (1) OID-оор дэд олонлог гаргах, (2) клиент
 * талын хамаарлыг объектын бүх цагиргаар (нүхтэй полигон) зөв шалгахад.
 * `oid` нь зөвхөн OID-той татсан үед (`withOid`), бусад үед `null`.
 */
type Feat = { oid: number | null; rings?: number[][][]; paths?: number[][][]; pt?: number[] };

type LayerMeta = { oid: string; paging: boolean };
const oidCache = new Map<string, Promise<LayerMeta>>();
function oidFieldOf(url: string): Promise<LayerMeta> {
  let p = oidCache.get(url);
  if (!p) {
    p = arcgisPost<{
      objectIdField?: string;
      fields?: { name: string; type: string }[];
      advancedQueryCapabilities?: { supportsPagination?: boolean };
    }>(url, {})
      .then((m) => ({
        oid: m?.objectIdField || m?.fields?.find((f) => f.type === 'esriFieldTypeOID')?.name || 'objectid',
        paging: m?.advancedQueryCapabilities?.supportsPagination !== false,
      }))
      .catch(() => {
        if (oidCache.get(url) === p) oidCache.delete(url);
        return { oid: 'objectid', paging: true };
      });
    oidCache.set(url, p);
  }
  return p;
}

/** Нэг давхаргаас татах хуудасны дээд тоо — хамгаалалт (хязгааргүй давталтаас) */
const MAX_PAGES = 200;

/**
 * ЭХ ГЕОМЕТРИЙН ЕРӨНХИЙЛӨЛТ (м) — `maxAllowableOffset`. 2026-10-22 (аудит): 1 → 0.1 м. 1 м-ийн ерөнхийлөлт ирмэгийг
 * 1 м хүртэл шилжүүлж хөрш нэгж талбарыг «огтлолцсон» болгодог байв (БАГЦ164 · БАГЦ174: 6 саадын 3 нь бүтэн нарийвчлалд
 * огт огтлолцдоггүй). Мөн энэ нь «зөвхөн хүрэлцсэн»-ийг ялгах хүлцэл (`TOUCH_TOL`) — үүнээс нимгэн давхцал нь шуугиан.
 */
const GEN_M = 0.1;

const geomCache = new Map<string, Promise<Feat[]>>();

const srcWhere = (src: Src): string => src.where ?? LAYER_BY_ID[src.layerId]?.where ?? '1=1';
const geomKey = (layerId: string, where: string, wkid: number) => `${layerId}|${where}|${wkid}`;

/**
 * Нэг давхаргын геометрийг ХУУДАСЛАН татна.
 */
async function fetchFeats(url: string, where: string, wkid: number, layerId: string, withOid: boolean): Promise<Feat[]> {
  let meta: LayerMeta | null = withOid ? await oidFieldOf(url) : null;
  let out: Feat[] = [];
  let off = 0;
  type G = { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) throw new Error(tr('ArcGIS: {0} давхаргын хуудаслалт хэт урт', layerId));
    const params: Record<string, string> = {
      where,
      returnGeometry: 'true',
      outSR: String(wkid),
      maxAllowableOffset: String(GEN_M),
    };
    if (meta) {
      params.outFields = meta.oid;
      params.orderByFields = `${meta.oid} ASC`;
      params.resultOffset = String(off);
    }
    const j = await post(url, params);
    const fs = (j.features ?? []) as { geometry?: G; attributes?: Record<string, unknown> }[];
    for (const f of fs) {
      const g = f.geometry;
      if (!g) continue;
      const raw = meta ? Number(f.attributes?.[meta.oid]) : NaN;
      const oid = Number.isFinite(raw) ? raw : null;
      if (g.rings) out.push({ oid, rings: g.rings });
      else if (g.paths) out.push({ oid, paths: g.paths });
      else if (typeof g.x === 'number' && typeof g.y === 'number') out.push({ oid, pt: [g.x, g.y] });
    }
    if (!j.exceededTransferLimit) break;
    if (!meta) {
      /* эрэмбэгүй эхний хуудас хязгаарт хүрэв — эрэмбэтэйгээр ЭХНЭЭС нь */
      meta = await oidFieldOf(url);
      out = [];
      off = 0;
      continue;
    }
    if (!fs.length || !meta.paging) throw new Error(tr('ArcGIS: {0} давхарга бүрэн татагдсангүй', layerId));
    off += fs.length;
  }
  return out;
}

function layerFeats(src: Src, wkid: number): Promise<Feat[]> {
  const d = LAYER_BY_ID[src.layerId];
  if (!d) return Promise.resolve([]);
  const where = srcWhere(src);
  const key = geomKey(src.layerId, where, wkid);
  let p = geomCache.get(key);
  if (!p) {
    p = fetchFeats(d.url as string, where, wkid, src.layerId, false);
    p.catch(() => geomCache.delete(key));
    geomCache.set(key, p);
  }
  return p;
}

/** `<талбар> IN (1,2,3)` хэлбэрийн OID шүүлт (`execTriage`-ийн барилгын багцууд) */
const OID_IN = /^\s*\(?\s*([A-Za-z_]\w*)\s+IN\s*\(([\d\s,]+)\)\s*\)?\s*$/i;

/**
 * НЭГ давхаргын ОЛОН `OID IN (…)` шүүлтийг НЭГ татлагаас задална (2026-10-01).
 */
async function prefetchOidSubsets(asks: readonly Ask[], wkid: number): Promise<void> {
  const byLayer = new Map<string, Set<string>>();
  for (const a of asks) {
    for (const s of a.sources) {
      const d = LAYER_BY_ID[s.layerId];
      if (!d || (d.where && d.where !== '1=1') || !s.where || !OID_IN.test(s.where)) continue;
      if (geomCache.has(geomKey(s.layerId, s.where, wkid))) continue;
      const set = byLayer.get(s.layerId) ?? new Set<string>();
      set.add(s.where);
      byLayer.set(s.layerId, set);
    }
  }
  await Promise.all([...byLayer].map(async ([layerId, wheres]) => {
    if (wheres.size < 2) return;
    const url = LAYER_BY_ID[layerId].url as string;
    try {
      const meta = await oidFieldOf(url);
      const fullKey = geomKey(layerId, '1=1', wkid);
      const full = fetchFeats(url, '1=1', wkid, layerId, true);
      const feats = await full;
      if (feats.some((f) => f.oid == null)) return;
      geomCache.set(fullKey, full);
      for (const w of wheres) {
        const m = OID_IN.exec(w);
        if (!m || m[1].toLowerCase() !== meta.oid.toLowerCase()) continue;
        const ids = new Set(m[2].split(',').map((x) => Number(x.trim())).filter(Number.isFinite));
        geomCache.set(geomKey(layerId, w, wkid), Promise.resolve(feats.filter((f) => f.oid != null && ids.has(f.oid))));
      }
    } catch {
      /* ердийн замаар (тус бүрд) — алдааг энд залгина, давхарга бүр өөрөө `failed` болно */
    }
  }));
}

/**
 * Өгсөн эх сурвалжуудтай ДАВХЦАЖ буй үлдсэн нэгж талбарууд.
 *
 * @param sources Багцын давхарга(ууд) ба тэдгээрийн шүүлт.
 */
export async function overlapLeftParcels(sources: Src[]): Promise<Overlap> {
  if (!sources.length) return { oids: [] };
  /* ҮР ДҮНГИЙН КЭШ — ижил эх сурвалжийн олонлогоор дахин дуудахад (харагдац
     сэлгэх, багц дахин сонгох) сүлжээ огт хөндөхгүй. Түлхүүр нь ЭРЭМБЭЛСЭН
     жагсаалт — дарааллын ялгаа нэг ажил гэж тоологдоно. */
  const rKey = sources.map((s) => `${s.layerId}|${s.where ?? ''}`).sort().join(';');
  const hit = resultCache.get(rKey);
  if (hit) return hit;
  const run = overlapUncached(sources);
  run.catch(() => resultCache.delete(rKey));
  void run.then((r) => {
    if (r.failed?.length) resultCache.delete(rKey);
  }).catch(() => {});
  resultCache.set(rKey, run);
  return run;
}

const resultCache = new Map<string, Promise<Overlap>>();

register(() => { resultCache.clear(); }, ['PARCEL_LEFT']);
subscribeTotals(() => { geomCache.clear(); resultCache.clear(); });

/* ══════════════════════ БАГЦЛАЛТ (2026-10-01) ══════════════════════ */

type Ask = { sources: Src[]; resolve: (o: Overlap) => void; reject: (e: unknown) => void };
let queue: Ask[] = [];

function overlapUncached(sources: Src[]): Promise<Overlap> {
  return new Promise<Overlap>((resolve, reject) => {
    queue.push({ sources, resolve, reject });
    if (queue.length === 1) {
      setTimeout(() => {
        const b = queue;
        queue = [];
        void runBatch(b);
      }, 0);
    }
  });
}

async function runBatch(b: Ask[]): Promise<void> {
  if (b.length === 1) {
    overlapSingle(b[0].sources).then(b[0].resolve, b[0].reject);
    return;
  }
  let out: Array<{ ok: Overlap } | { err: unknown }>;
  try {
    out = await overlapBatch(b);
  } catch {
    for (const a of b) overlapSingle(a.sources).then(a.resolve, a.reject);
    return;
  }
  out.forEach((r, i) => ('ok' in r ? b[i].resolve(r.ok) : b[i].reject(r.err)));
}

const withFailed = (oids: number[], failed: string[]): Overlap =>
  (failed.length ? { oids, failed } : { oids });

const allFailed = (n: number) => new Error(tr('ArcGIS: {0} эх сурвалж бүгд татагдсангүй', n));

/** Эх сурвалжуудын геометр — `parts` нь [кэшийн түлхүүр, объектууд] (нэгдэлд давхардал арилгана) */
async function gather(sources: Src[], wkid: number): Promise<{ parts: Array<[string, Feat[]]>; failed: string[] }> {
  const settled = await Promise.allSettled(sources.map((s) => layerFeats(s, wkid)));
  const parts: Array<[string, Feat[]]> = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'rejected') failed.push(s.layerId);
    else parts.push([geomKey(s.layerId, srcWhere(s), wkid), r.value]);
  });
  return { parts, failed };
}

/**
 * Бүх багцын геометр нь ~8,000 хэсэгтэй (голдуу шугам хоолой). Түүнийг НЭГ
 * асуулгаар илгээхэд сервер 2,119 нэгж талбарыг тэр асар том геометртэй
 * тулгаж **57 секунд** боддог байв. 400-аар хувааж ЗЭРЭГ асуухад ижил үр дүн
 * **1.8 секундэд** гарна (хэмжсэн). Геометр татах нь ердөө 1.1 сек тул гацаа
 * нь ЗӨВХӨН энд байсан.
 */
const CHUNK = 400;
const cutByFeat = (parts: number[][][][]): number[][][][] => {
  const out: number[][][][] = [];
  let cur: number[][][] = [];
  for (const p of parts) {
    if (cur.length && cur.length + p.length > CHUNK) {
      out.push(cur);
      cur = [];
    }
    cur.push(...p);
  }
  if (cur.length) out.push(cur);
  return out;
};
function shapesOf(fs: readonly Feat[], wkid: number): Array<[string, string]> {
  const ringFeats: number[][][][] = [];
  const pathFeats: number[][][][] = [];
  const pts: number[][] = [];
  const distinct = (p: number[][]) => new Set(p.map((c) => `${c[0]},${c[1]}`)).size;
  for (const f of fs) {
    if (f.rings) {
      const ok = f.rings.filter((r) => distinct(r) >= 3);
      for (const r of f.rings) if (distinct(r) < 3 && r.length) pts.push(r[0]);
      if (ok.length) ringFeats.push(ok);
    } else if (f.paths) {
      const ok = f.paths.filter((p) => distinct(p) >= 2);
      for (const p of f.paths) if (distinct(p) < 2 && p.length) pts.push(p[0]);
      if (ok.length) pathFeats.push(ok);
    } else if (f.pt) pts.push(f.pt);
  }
  const ptChunks: number[][][] = [];
  for (let i = 0; i < pts.length; i += CHUNK) ptChunks.push(pts.slice(i, i + CHUNK));
  return [
    ...cutByFeat(ringFeats).map(
      (c) => ['esriGeometryPolygon', JSON.stringify({ rings: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...cutByFeat(pathFeats).map(
      (c) => ['esriGeometryPolyline', JSON.stringify({ paths: c, spatialReference: { wkid } })] as [string, string],
    ),
    ...ptChunks.map(
      (c) => ['esriGeometryMultipoint', JSON.stringify({ points: c, spatialReference: { wkid } })] as [string, string],
    ),
  ];
}


/** Серверийн огтлолцол — хэлбэр бүртэй огтлолцох ҮЛДСЭН нэгж талбарын OID-ууд */
async function askLeft(shapes: Array<[string, string]>, wkid: number): Promise<Set<number>> {
  const leftWhere = parcelLeftWhere();
  const res = await Promise.all(shapes.map(([geometryType, geometry]) => post(PARCEL_LEFT.url, {
    geometry,
    geometryType,
    spatialRel: 'esriSpatialRelIntersects',
    inSR: String(wkid),
    where: leftWhere,
    returnIdsOnly: 'true',
  })));
  if (res.some((r) => r?.exceededTransferLimit)) {
    throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
  }
  const left = new Set<number>();
  for (const r of res) for (const id of (r.objectIds ?? []) as number[]) left.add(id);
  return left;
}

/**
 * ХУУЧИН ЗАМ — нэг дуудлага: серверийн огтлолцол (дэвшигч) → дэвшигчдийн геометр → ДОТООД огтлолцол (клиент).
 */
async function overlapSingle(sources: Src[]): Promise<Overlap> {
  const wkid = await parcelSR();
  const { parts, failed } = await gather(sources, wkid);
  if (failed.length === sources.length) throw allFailed(failed.length);
  const feats = parts.flatMap(([, fs]) => fs);
  const shapes = shapesOf(feats, wkid);
  if (!shapes.length) return withFailed([], failed);
  const cand = await askLeft(shapes, wkid);
  if (!cand.size) return withFailed([], failed);
  const parcels = await parcelRings([...cand], wkid);
  return withFailed(hitParcels(parcels, feats), failed);
}

/** Дэвшигч нэгж талбаруудаас эх объектуудын аль нэгтэй ДОТООД огтлолцолтой (`interiorHit`) нь — OID-ууд */
function hitParcels(parcels: Map<number, number[][][]>, feats: readonly Feat[]): number[] {
  const pList = [...parcels].map(([id, rings]) => ({ id, rings, bb: bboxOf(rings) }));
  if (!pList.length || !feats.length) return [];
  const { eps, tol } = tolOf(pList[0].rings);
  const fx = feats.map((f) => ({ f, bb: featBox(f) }));
  return pList
    .filter((q) => fx.some(({ f, bb }) => boxHit(q.bb, bb, eps) && interiorHit(q.rings, q.bb, f, eps, tol)))
    .map((q) => q.id);
}

/**
 * Хүлцэл — координатаас (сервер `outSR`-оор буцаасан): проекцтой (метр) бол `eps` 1 мм (ArcGIS-ийн анхдагч XY tolerance),
 * `tol` = `GEN_M` (0.1 м — ерөнхийлөлтийн шуугиан); градусад 1e-8 ба 1e-6.
 */
function tolOf(rings: number[][][]): { eps: number; tol: number } {
  const deg = Math.abs(rings[0]?.[0]?.[0] ?? 1e6) <= 360;
  return deg ? { eps: 1e-8, tol: 1e-6 } : { eps: 1e-3, tol: GEN_M };
}

/**
 * Дэвшигч нэгж талбаруудын БҮТЭН геометр (ерөнхийлөлтгүй — сервер ч бүтнээр тулгадаг).
 */
async function parcelRings(ids: number[], wkid: number): Promise<Map<number, number[][][]>> {
  const oidF = PARCEL_LEFT.oid;
  const out = new Map<number, number[][][]>();
  const cleared = new Set<number>();
  const STEP = 500;
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += STEP) pages.push(ids.slice(i, i + STEP));
  const res = await Promise.all(pages.map((p) => post(PARCEL_LEFT.url, {
    objectIds: p.join(','),
    outFields: `${oidF},${PARCEL_LEFT.fields.status}`,
    returnGeometry: 'true',
    outSR: String(wkid),
  })));
  for (const j of res) {
    if (j.exceededTransferLimit) throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
    for (const f of (j.features ?? []) as { attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } }[]) {
      const id = Number(f.attributes?.[oidF]);
      if (!Number.isFinite(id)) continue;
      if (isClearedStatus(f.attributes?.[PARCEL_LEFT.fields.status])) cleared.add(id);
      else if (f.geometry?.rings?.length) out.set(id, f.geometry.rings);
    }
  }
  if (ids.some((id) => !out.has(id) && !cleared.has(id))) throw new Error(tr('ArcGIS: нэгж талбарын давхцлын жагсаалт бүрэн ирсэнгүй'));
  return out;
}

async function overlapBatch(b: Ask[]): Promise<Array<{ ok: Overlap } | { err: unknown }>> {
  const wkid = await parcelSR();
  await prefetchOidSubsets(b, wkid);
  const per = await Promise.all(b.map((a) => gather(a.sources, wkid)));
  /* НЭГДЭЛ — ижил давхарга/шүүлт олон дуудлагад байвал нэг л удаа */
  const uniq = new Map<string, Feat[]>();
  for (const p of per) for (const [k, fs] of p.parts) uniq.set(k, fs);
  const shapes = shapesOf([...uniq.values()].flat(), wkid);
  const cand = shapes.length ? await askLeft(shapes, wkid) : new Set<number>();
  const parcels = cand.size ? await parcelRings([...cand], wkid) : new Map<number, number[][][]>();
  return b.map((a, i) => {
    const p = per[i];
    if (p.failed.length === a.sources.length) return { err: allFailed(p.failed.length) };
    return { ok: withFailed(hitParcels(parcels, p.parts.flatMap(([, fs]) => fs)), p.failed) };
  });
}

/* ══════════════ Клиент талын ДОТООД огтлолцол — серверийн дэвшигчдийг шүүх ба багцын хуваарилалт ══════════════ */

type Box = [number, number, number, number];

function bboxOf(rings: number[][][]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [x0, y0, x1, y1];
}

const featBox = (f: Feat): Box => (f.rings ? bboxOf(f.rings) : f.paths ? bboxOf(f.paths) : f.pt ? [f.pt[0], f.pt[1], f.pt[0], f.pt[1]] : [Infinity, Infinity, -Infinity, -Infinity]);

const boxHit = (a: Box, b: Box, e: number) => a[0] <= b[2] + e && b[0] <= a[2] + e && a[1] <= b[3] + e && b[1] <= a[3] + e;


/** p цэг [a,b] хэрчмээс ≤ e зайд уу (хүрэлцэх = огтлолцох) */
function nearSeg(ax: number, ay: number, bx: number, by: number, px: number, py: number, e: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy <= e * e;
}


/** Цэг полигон ДОТОР уу — бүх цагиргаар even-odd (нүх зөв тооцогдоно) */
function inRings(rings: number[][][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Хэрчим [a,b]-г `rings`-ийн ирмэгүүдтэй огтлолцох/хүрэлцэх цэгүүдээр ТАСЛААД дэд хэрчим бүрийн ДУНД цэгийг буцаана
 * (`e`-ээс богино дэд хэрчим алгасна). Дунд цэгүүд нь нөгөө дүрсийн хилтэй ЗӨВХӨН дэд хэрчмийн төгсгөлд таарна — тиймээс
 * «дунд цэг дотор уу» гэдэг нь «хэрчмийн тэр хэсэг дотор уу» гэсэн үг.
 */
function splitMids(a: number[], b: number[], rings: number[][][], e: number): number[][] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (!L2) return [];
  const ts = [0, 1];
  const x0 = Math.min(a[0], b[0]) - e, x1 = Math.max(a[0], b[0]) + e;
  const y0 = Math.min(a[1], b[1]) - e, y1 = Math.max(a[1], b[1]) + e;
  for (const r of rings) {
    for (let k = 1; k < r.length; k += 1) {
      const c = r[k - 1], d = r[k];
      if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const den = dx * ey - dy * ex;
      if (den !== 0) {
        const wx = c[0] - a[0], wy = c[1] - a[1];
        const t = (wx * ey - wy * ex) / den;
        const u = (wx * dy - wy * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
      for (const p of [c, d]) {
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
        if (t <= 0 || t >= 1) continue;
        const qx = a[0] + t * dx - p[0], qy = a[1] + t * dy - p[1];
        if (qx * qx + qy * qy <= e * e) ts.push(t);
      }
    }
  }
  ts.sort((p, q) => p - q);
  const len = Math.sqrt(L2);
  const out: number[][] = [];
  for (let i = 1; i < ts.length; i += 1) {
    if ((ts[i] - ts[i - 1]) * len <= e) continue;
    const t = (ts[i] + ts[i - 1]) / 2;
    out.push([a[0] + t * dx, a[1] + t * dy]);
  }
  return out;
}

function onBoundary(rings: number[][][], x: number, y: number, e: number): boolean {
  for (const r of rings) for (let k = 1; k < r.length; k += 1) {
    if (nearSeg(r[k - 1][0], r[k - 1][1], r[k][0], r[k][1], x, y, e)) return true;
  }
  return false;
}

/** Цэг дүрсийн ДОТОР, хилээс `tol`-оос илүү зайтай уу */
const strictlyIn = (rings: number[][][], p: number[], tol: number): boolean =>
  inRings(rings, p[0], p[1]) && !onBoundary(rings, p[0], p[1], tol);

/** Нэгж талбарын ДОТООД цэг — хамгийн урт ирмэгийн дундаас дотогш `2·tol` (нимгэн бол null) */
function interiorPoint(rings: number[][][], tol: number): number[] | null {
  let best: [number[], number[]] | null = null;
  let bl = 0;
  for (const r of rings) {
    for (let k = 1; k < r.length; k += 1) {
      const l = Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]);
      if (l > bl) { bl = l; best = [r[k - 1], r[k]]; }
    }
  }
  if (!best || !bl) return null;
  const [a, b] = best;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]) / bl, ny = (b[0] - a[0]) / bl;
  for (const s of [1, -1]) {
    const p = [mx + s * 2 * tol * nx, my + s * 2 * tol * ny];
    if (strictlyIn(rings, p, tol)) return p;
  }
  return null;
}

const distinctN = (p: number[][]) => new Set(p.map((c) => `${c[0]},${c[1]}`)).size;

/**
 * ДОТООД ОГТЛОЛЦОЛ — эх объект нэгж талбарын ДОТОР ТАЛТАЙ (хилээс `tol`-оос гүн) огтлолцох уу.
 */
function interiorHit(parcel: number[][][], pbb: Box, f: Feat, e: number, tol: number): boolean {
  if (f.pt) return strictlyIn(parcel, f.pt, tol);
  const parts = f.rings ?? f.paths ?? [];
  const minN = f.rings ? 3 : 2;
  const solid: number[][][] = [];
  for (const p of parts) {
    if (!p.length) continue;
    if (distinctN(p) < minN) { if (strictlyIn(parcel, p[0], tol)) return true; continue; }
    solid.push(p);
    for (let i = 1; i < p.length; i += 1) {
      const a = p[i - 1], b = p[i];
      if (Math.max(a[0], b[0]) < pbb[0] - e || Math.min(a[0], b[0]) > pbb[2] + e
        || Math.max(a[1], b[1]) < pbb[1] - e || Math.min(a[1], b[1]) > pbb[3] + e) continue;
      for (const m of splitMids(a, b, parcel, e)) if (strictlyIn(parcel, m, tol)) return true;
    }
  }
  if (!f.rings || !solid.length) return false;
  const sbb = bboxOf(solid);
  for (const r of parcel) {
    for (let k = 1; k < r.length; k += 1) {
      const a = r[k - 1], b = r[k];
      if (Math.max(a[0], b[0]) < sbb[0] - e || Math.min(a[0], b[0]) > sbb[2] + e
        || Math.max(a[1], b[1]) < sbb[1] - e || Math.min(a[1], b[1]) > sbb[3] + e) continue;
      for (const m of splitMids(a, b, solid, e)) if (strictlyIn(solid, m, tol)) return true;
    }
  }
  const ip = interiorPoint(parcel, tol);
  return !!ip && strictlyIn(solid, ip, tol);
}
