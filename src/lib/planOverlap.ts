import { t as tr } from '@/lib/i18nCore';
import * as query from '@arcgis/core/rest/query';
import Query from '@arcgis/core/rest/support/Query';
import esriRequest from '@arcgis/core/request';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryEngineAsync from '@arcgis/core/geometry/geometryEngineAsync';
import { fromJSON as geomFromJSON } from '@arcgis/core/geometry/support/jsonUtils';
import { LAYERS, LAYER_BY_ID, layerUrl, oidOf, INFRA_SVC } from '@/lib/services';
import { num, km } from '@/lib/format';
import { register } from '@/lib/dataBus';
import { subscribeTotals } from '@/lib/totals';
import { overlapScopeFocus, visibleOverlapItems, type OverlapFocus } from './planOverlapSelection';
import { buildOverlapDisplay, individualZoneIdentity, type OverlapDisplay, type ZoneBoundary } from './planOverlapZones';

/**
 * «ЕРӨНХИЙ ТӨЛӨВЛӨГӨӨ» → «Detail»: ИНЖЕНЕРИЙН ШУГАМ СҮЛЖЭЭ ↔ ФИЗИК ОБЪЕКТЫН ДАВХЦАЛ
 * (2026-10-13, хэрэглэгчийн заавар).
 *
 *   Pro скрипт Барилга (REBUILDING) ба Зам (1006_GUDAMJ_MERGE)-аар бодсон; энд ижил аргаар
 *   5 ангилал × 2 тал (одоогийн `sb:*` / шинэчлэгдсэн `rd:*`).
 */

export type OverlapSide = 'now' | 'next';
export type OverlapCat = 'build' | 'road' | 'bike' | 'walk' | 'green';

const WKID = 3857;

/**
 * Ангилал → хоёр талын давхарга(ууд). ГАНЦ ЭХ СУРВАЛЖ — Portal.tsx §DETAIL_* эндээс уншина.
 *   · `now`  — одоогийн ерөнхий төлөвлөгөө (`sb:*`, план 2D webmap);
 *   · `next` — шинэчлэгдсэн (`rd:*` — `Redesign` FeatureServer, `layers.ts` §REDESIGN_LAYERS).
 *     Ангилал нэгээс олон давхаргатай байж болно (ногоон = 6 давхарга) — полигонууд нь нэг олонлог.
 */
export const OVERLAP_CATS: { key: OverlapCat; title: () => string; hue: string; now: string[]; next: string[] }[] = [
  { key: 'build', title: () => tr('Барилга'),           hue: '#e11d48', now: ['sb:4'],  next: ['rd:1'] },
  { key: 'road',  title: () => tr('Автозам'),           hue: '#64748b', now: ['sb:2'],  next: ['rd:0'] },
  { key: 'bike',  title: () => tr('Дугуйн зам'),        hue: '#2563eb', now: ['sb:15'], next: ['rd:18'] },
  { key: 'walk',  title: () => tr('Явган зам'),         hue: '#d97706', now: ['sb:3'],  next: ['rd:11'] },
  { key: 'green', title: () => tr('Ногоон байгууламж'), hue: '#16a34a', now: ['sb:1'],  next: ['rd:6', 'rd:7', 'rd:8', 'rd:9', 'rd:12', 'rd:13'] },
];

/**
 * Инженерийн ТӨРӨЛ — Pro скриптийн `TYPES` (дараалал ЧУХАЛ: эхэлж таарсан нь ялна —
 * жиш. «халуун_ус» нь «ус_хангамж»-аас өмнө). Түлхүүр үг нь давхаргын НЭРЭНД (жижиг үсгээр).
 */
export const OVERLAP_TYPES: { key: string; title: () => string; hue: string; keys: string[] }[] = [
  { key: 'sewer',  title: () => tr('Бохир ус'),   hue: '#7c3aed', keys: ['бохир', 'ариутгах', 'татуург'] },
  { key: 'heat',   title: () => tr('Дулаан'),     hue: '#dc2626', keys: ['дулаан', 'дхт'] },
  { key: 'hot',    title: () => tr('Халуун ус'),  hue: '#f97316', keys: ['халуун_ус', 'халуун ус'] },
  { key: 'water',  title: () => tr('Цэвэр ус'),   hue: '#0891b2', keys: ['хүйтэн', 'ус_хангамж', 'усан_сан', 'цагираг', 'насос'] },
  { key: 'power',  title: () => tr('Цахилгаан'),  hue: '#f59e0b', keys: ['цахилгаан', 'хтп', 'рп_'] },
  { key: 'comm',   title: () => tr('Холбоо'),     hue: '#0ea5e9', keys: ['холбоо'] },
  { key: 'lotki',  title: () => tr('Лотки'),      hue: '#64748b', keys: ['лотки'] },
  { key: 'ground', title: () => tr('Хөрсний ус'), hue: '#a16207', keys: ['хөрсний'] },
  { key: 'other',  title: () => tr('Бусад'),      hue: '#94a3b8', keys: [] },
];
const classify = (name: string): string => {
  const low = name.toLowerCase();
  return OVERLAP_TYPES.find((x) => x.keys.some((k) => low.includes(k)))?.key ?? 'other';
};

/**
 * Нэг мөр = инженерийн ДАВХАРГА (багц ажлын давхарга, жиш. «Багц5_1_Дулааны_өгөх») × ангилал.
 */
export type OverlapCell = { type: string; layer: string; cat: OverlapCat; lengthM: number; count: number };
/**
 * Огтлолцлын НЭГ хэсэг (инженерийн объект × полигон). `feature` нь эх давхарга + OBJECTID.
 * Бүсийн нийлбэрт нэг объектын олон ангилалтай давхцсан геометрийг нэгтгэж давхардлыг арилгана.
 */
export type OverlapPiece = { feature: string; type: string; layer: string; cat: OverlapCat; poly: number; lengthM: number; geometry: __esri.GeometryUnion };
export type OverlapZone = ZoneBoundary<__esri.GeometryUnion>;
export type OverlapMapDisplay = OverlapDisplay<__esri.GeometryUnion>;
export type OverlapResult = {
  side: OverlapSide;
  cells: OverlapCell[];
  /** Зураг дээр тодруулах огтлолцлууд (хос бүр нэг; бүх геометрийн төрөл) */
  pieces: OverlapPiece[];
  /** Хэсэгчилсэн ЕТ-ийн бүсийн полигон БҮР — төрөл/нэр давтагдсан ч тусдаа OID-той. */
  zones: OverlapZone[];
  /** Татагдаагүй давхаргууд (нэрээр) — хагас үр дүнг ил тэмдэглэнэ */
  failed: string[];
};

type Geom = __esri.GeometryUnion;

/**
 * НЭГ ХУУДАСНЫ УНШИЛТ — PBF, бүтэлгүйдвэл JSON; ХОЁУЛАА хугацаатай, нэвтрэх цонхгүй.
 */
const PAGE_TIMEOUT_MS = 45_000;
export function queryPageSafe(u: string, q: Query): Promise<__esri.FeatureSet> {
  const target = u;
  const run = (fn: typeof query.executeQueryPBF): Promise<__esri.FeatureSet> => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ac.abort(); reject(new Error(`timeout ${PAGE_TIMEOUT_MS / 1000}s: ${target}`)); }, PAGE_TIMEOUT_MS);
    });
    return Promise.race([fn(target, q, { signal: ac.signal, authMode: 'no-prompt' }), late]).finally(() => clearTimeout(timer));
  };
  return run(query.executeQueryJSON);
}

/** Давхаргын бүх геометрийг ХУУДАСЛАЖ татна (`analysis/data.ts` §fetchAll — OID эрэмбэ заавал) */
async function fetchObjects(u: string, oid: string, outFields = [oid]): Promise<{ geometry: Geom; attributes: Record<string, unknown> }[]> {
  const out: { geometry: Geom; attributes: Record<string, unknown> }[] = [];
  for (let start = 0; ; ) {
    const q = new Query({
      where: '1=1',
      outFields,
      returnGeometry: true,
      outSpatialReference: { wkid: WKID },
      orderByFields: [`${oid} ASC`],
      start,
      num: 2000,
    });
    /* PBF (JSON-оос ~6 дахин жижиг) — дэмжихгүй үйлчилгээнд JSON руу буцна (`queryPageSafe`) */
    const res = await queryPageSafe(u, q);
    for (const f of res.features) if (f.geometry) out.push({ geometry: f.geometry as Geom, attributes: f.attributes ?? {} });
    if (!res.features.length) break;
    if (res.features.length < 2000 && !res.exceededTransferLimit) break;
    start += res.features.length;
  }
  return out;
}

async function fetchGeoms(u: string, oid: string): Promise<Geom[]> {
  return (await fetchObjects(u, oid)).map((feature) => feature.geometry);
}

async function loadZones(): Promise<OverlapZone[]> {
  const def = LAYER_BY_ID['rd:2'];
  if (!def) throw new Error('rd:2 давхарга бүртгэлгүй');
  const oid = oidOf(def);
  return (await fetchObjects(layerUrl(def), oid, ['*']))
    .filter((feature) => feature.geometry.type === 'polygon')
    .map((feature) => ({ ...individualZoneIdentity(feature.attributes, oid), geometry: feature.geometry }));
}

const lengthM = (g: Geom) => Math.max(0, geometryEngine.geodesicLength(g as __esri.Polyline, 'meters'));

/** Огтлолцол ХООСОН эсэх (Pro: гаралтын объект үүсээгүй) */
const isEmpty = (g: Geom | null | undefined): boolean => {
  if (!g) return true;
  if (g.type === 'polyline') return !g.paths.some((p) => p.length >= 2);
  if (g.type === 'polygon') return !g.rings.length;
  if (g.type === 'multipoint') return !g.points.length;
  return false;
};

export type InfraFeat = { feature: string; type: string; layer: string; geom: Geom; ext: __esri.Extent | null | undefined };

/**
 * Инженерийн БҮХ давхаргын объектууд (төрөлтэй) — ХОЁР ТАЛД ИЖИЛ тул нэг удаа татаж кэшлэнэ.
 * Давхаргын нэрсийг үйлчилгээний метадатаас (Pro скрипт шиг НЭРЭЭР ангилна).
 */
let infraCache: Promise<{ feats: InfraFeat[]; failed: string[] }> | null = null;
register(() => { infraCache = null; resultCache.clear(); displayCache = new WeakMap(); }, []);
subscribeTotals(() => { infraCache = null; resultCache.clear(); displayCache = new WeakMap(); });
/**
 * Инженерийн давхарга (`infra:N`) → төрөл (`OVERLAP_TYPES` түлхүүр) — `loadInfra` ачаалсны дараа дүүрнэ.
 * Газрын зургийг төрлөөр шүүхэд (03-ийн төрөл сонголт, `Portal`) ашиглана.
 */
const infraTypeById = new Map<string, string>();
export const infraIdsOfType = (type: string): string[] =>
  [...infraTypeById].filter(([, t]) => t === type).map(([id]) => id);

export function loadInfra() {
  infraCache ??= (async () => {
    const infraByEnt = new Map<number, { id: string; url: string }>();
    for (const d of LAYERS) {
      if (!d.id.startsWith('infra:')) continue;
      const url = layerUrl(d);
      infraByEnt.set(Number(url.slice(url.lastIndexOf('/') + 1)), { id: d.id.slice('infra:'.length), url });
    }
    const meta = await esriRequest(INFRA_SVC, { query: { f: 'json' }, responseType: 'json' });
    const layers = ((meta.data as { layers?: { id: number; name: string }[] }).layers ?? [])
      .flatMap((l) => { const d = infraByEnt.get(l.id); return d ? [{ id: d.id, url: d.url, name: l.name }] : []; });
    const failed: string[] = [];
    const parts = await Promise.all(layers.map(async (l) => {
      const type = classify(l.name);
      infraTypeById.set(`infra:${l.id}`, type);
      try {
        /* OID — бүртгэлтэй бол `infra:N`-ийн `oidOf`, үгүй бол үйлчилгээний анхдагч */
        const def = LAYER_BY_ID[`infra:${l.id}`];
        const oid = def ? oidOf(def) : 'objectid';
        return (await fetchObjects(l.url, oid)).map(({ geometry: geom, attributes }) => {
          const objectId = Object.entries(attributes).find(([key]) => key.toLowerCase() === oid.toLowerCase())?.[1];
          if (objectId == null) throw new Error(`${l.name}: OBJECTID олдсонгүй`);
          return { feature: `infra:${l.id}:${objectId}`, type, layer: l.name, geom, ext: geom.extent };
        });
      } catch (e) {
        console.warn(`[selbe] давхцал: «${l.name}» татагдсангүй:`, e);
        failed.push(l.name);
        return [] as InfraFeat[];
      }
    }));
    return { feats: parts.flat(), failed };
  })().catch((e) => { infraCache = null; throw e; });
  const mine = infraCache;
  void mine.then((r) => { if (r.failed.length && infraCache === mine) infraCache = null; }, () => {});
  return mine;
}

/** Цэг нь extent-гүй — координатаар шалгана */
const touches = (f: InfraFeat, e: __esri.Extent) => {
  if (f.ext) return f.ext.intersects(e);
  const p = f.geom as __esri.Point;
  return p.type === 'point' && p.x >= e.xmin && p.x <= e.xmax && p.y >= e.ymin && p.y <= e.ymax;
};

const resultCache = new Map<OverlapSide, Promise<OverlapResult>>();

/* ══════════ ХӨТӨЧИЙН ХАДГАЛАЛТ (IndexedDB) ══════════
 */
const STORE_DB = 'selbe-overlap';
const STORE_VER = 4; // 4: эх объектын OID болон хэсэгчилсэн ЕТ-ийн тусдаа бүсүүд.
const PERSIST_TTL = 24 * 3600_000;
type Stored = {
  v: number; at: number; cells: OverlapCell[];
  pieces: { feature: string; type: string; layer: string; cat: OverlapCat; poly: number; lengthM: number; g: object }[];
  zones: { id: string; oid: string; label: string; g: object }[]; failed: string[];
};

function idb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(STORE_DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('r'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function readStored(side: OverlapSide): Promise<OverlapResult | null> {
  const db = await idb();
  if (!db) return null;
  const v = await new Promise<Stored | undefined>((res) => {
    try {
      const q = db.transaction('r').objectStore('r').get(side);
      q.onsuccess = () => res(q.result as Stored | undefined);
      q.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
  db.close();
  if (!v || v.v !== STORE_VER || Date.now() - v.at > PERSIST_TTL) return null;
  return {
    side,
    cells: v.cells,
    pieces: v.pieces.map((p) => ({ feature: p.feature, type: p.type, layer: p.layer, cat: p.cat, poly: p.poly, lengthM: p.lengthM, geometry: geomFromJSON(p.g) as Geom })),
    zones: v.zones.map((zone) => ({ id: zone.id, oid: zone.oid, label: zone.label, geometry: geomFromJSON(zone.g) as Geom })),
    failed: v.failed,
  };
}
async function writeStored(r: OverlapResult): Promise<void> {
  if (r.failed.length) return;
  const db = await idb();
  if (!db) return;
  const v: Stored = {
    v: STORE_VER, at: Date.now(), cells: r.cells, failed: r.failed,
    pieces: r.pieces.map((p) => ({ feature: p.feature, type: p.type, layer: p.layer, cat: p.cat, poly: p.poly, lengthM: p.lengthM, g: p.geometry.toJSON() })),
    zones: r.zones.map((zone) => ({ id: zone.id, oid: zone.oid, label: zone.label, g: zone.geometry.toJSON() })),
  };
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction('r', 'readwrite');
      tx.objectStore('r').put(v, r.side);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch { res(); }
  });
  db.close();
}
/** Хадгалсан үр дүнг устгана (дараагийн нээлтэд дахин бодно) */
export async function clearOverlapStore(): Promise<void> {
  resultCache.clear();
  displayCache = new WeakMap();
  const db = await idb();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction('r', 'readwrite');
      tx.objectStore('r').clear();
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch { res(); }
  });
  db.close();
}

/** Зэрэгцээ гүйцэтгэл — `n` ажлыг нэг дор (worker-ийн дараалал хоосон зогсохгүй) */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * ЯВЦЫН ТЕКСТ — нэг талын тооцоог хүлээж буй БҮХ дуудагчид (зургийн давхарга · самбар).
 */
type StepGen = { subs: Set<(msg: string) => void>; last: string };
const stepGens = new Map<number, StepGen>();
const genOf = new WeakMap<Promise<OverlapResult>, number>();
let genSeq = 0;
/** Тал бүрийн ЯВАГДАЖ буй (хамгийн сүүлд эхэлсэн) тооцооны үе — дууссан талд явцын захиалга нэмэхгүй */
const running = new Map<OverlapSide, number>();
const OVERLAP_TIMEOUT_MS = 4 * 60_000;

/**
 * ЯВЦЫН ТЕКСТИЙГ ЗАХИАЛНА — буцаасан функцээр цуцална (бүрэлдэхүүн unmount-д).
 */
export function onOverlapStep(side: OverlapSide, fn: (msg: string) => void, p?: Promise<OverlapResult>): () => void {
  /* `p` өгвөл ЗӨВХӨН тэр тооцооны явц (`computeOverlap`-ийн буцаасан амлалт); өгөөгүй бол тэр талын явагдаж буйнх */
  const gen = p ? genOf.get(p) : running.get(side);
  const g = gen == null ? undefined : stepGens.get(gen);
  if (!g) return () => {};
  g.subs.add(fn);
  if (g.last) fn(g.last);
  return () => { g.subs.delete(fn); };
}

/**
 * Нэг талын давхцлыг бодно (санах ой → хөтчийн хадгалалт → тооцоо). `onStep` — самбарт явцын текст (тооцоо дуусахад
 * автоматаар цуцлагдана; бүрэлдэхүүн `onOverlapStep`-ийг шууд хэрэглэвэл unmount-д ч цуцална).
 */
export function computeOverlap(side: OverlapSide, onStep?: (msg: string) => void): Promise<OverlapResult> {
  const hit = resultCache.get(side);
  if (hit) {
    if (onStep) { const off = onOverlapStep(side, onStep, hit); void hit.then(off, off); }
    return hit;
  }
  const gen = ++genSeq;
  const sg: StepGen = { subs: new Set(), last: '' };
  stepGens.set(gen, sg);
  running.set(side, gen);
  const step = (msg: string) => {
    if (!stepGens.has(gen)) return;
    sg.last = msg;
    for (const fn of sg.subs) fn(msg);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(tr('Тооцоо хэт удаж байна ({0} мин) — дахин нээж оролдоно уу.', OVERLAP_TIMEOUT_MS / 60_000))), OVERLAP_TIMEOUT_MS);
  });
  const work = (async (): Promise<OverlapResult> => {
    const stored = await readStored(side).catch(() => null);
    if (stored) return stored;
    step(tr('Инженерийн шугам татаж байна…'));
    const zoneFailed: string[] = [];
    const [{ feats, failed: infraFailed }, zones, cats] = await Promise.all([
      loadInfra(),
      loadZones().catch((error: unknown) => {
        console.warn('[selbe] давхцал: бүсүүд татагдсангүй:', error);
        zoneFailed.push(LAYER_BY_ID['rd:2']?.title ?? 'rd:2');
        return [] as OverlapZone[];
      }),
      Promise.all(OVERLAP_CATS.map(async (c) => {
        const failed: string[] = [];
        const parts = await Promise.all(c[side].map((id) => {
          const def = LAYER_BY_ID[id];
          if (!def) { failed.push(id); return Promise.resolve([] as Geom[]); }
          return fetchGeoms(layerUrl(def), oidOf(def)).catch((e) => {
            console.warn(`[selbe] давхцал: «${id}» татагдсангүй:`, e);
            failed.push(def.title ?? id);
            return [] as Geom[];
          });
        }));
        return { c, polys: parts.flat(), failed };
      })),
    ]);
    const acc = new Map<string, OverlapCell>();
    const pieces: OverlapPiece[] = [];
    const jobs = cats.flatMap(({ c, polys }) => polys.map((poly, pi) => ({ c, poly, pi })));
    let done = 0;
    step(tr('Давхцлыг тооцоолж байна… {0}%', 0));
    await pool(jobs, 4, async ({ c, poly, pi }) => {
      const e = poly.extent;
      const cand = e ? feats.filter((f) => touches(f, e)) : [];
      if (cand.length) {
        const res = (await geometryEngineAsync.intersect(cand.map((f) => f.geom), poly)) as unknown as (Geom | null)[];
        res.forEach((g, i) => {
          if (isEmpty(g)) return;
          const { feature, type, layer } = cand[i];
          const k = `${layer}|${c.key}`;
          const cell = acc.get(k) ?? { type, layer, cat: c.key, lengthM: 0, count: 0 };
          cell.count += 1;
          const m = g!.type === 'polyline' ? lengthM(g!) : 0;
          cell.lengthM += m;
          pieces.push({ feature, type, layer, cat: c.key, poly: pi, lengthM: m, geometry: g! });
          acc.set(k, cell);
        });
      }
      done += 1;
      if (done % 10 === 0) step(tr('Давхцлыг тооцоолж байна… {0}%', Math.round((done / jobs.length) * 100)));
    });
    const out: OverlapResult = { side, cells: [...acc.values()], pieces, zones, failed: [...infraFailed, ...zoneFailed, ...cats.flatMap((x) => x.failed)] };
    void writeStored(out).catch(() => {});
    return out;
  })();
  const p = Promise.race([work, late]).finally(() => clearTimeout(timer));
  genOf.set(p, gen);
  resultCache.set(side, p);
  if (onStep) { const off = onOverlapStep(side, onStep, p); void p.then(off, off); }
  /* Дууссаны дараа явцын бүртгэлийг цэвэрлэнэ */
  const end = () => { stepGens.delete(gen); if (running.get(side) === gen) running.delete(side); };
  p.then((r) => { end(); if (r.failed.length && resultCache.get(side) === p) resultCache.delete(side); },
    () => { end(); if (resultCache.get(side) === p) resultCache.delete(side); });
  return p;
}

/** Ангилал/давхаргын хүрээ бүрийг нэг удаа бодно; бүс сонголт зөвхөн бэлэн үр дүнг шүүнэ. */
let displayCache = new WeakMap<OverlapResult, Map<string, Promise<OverlapMapDisplay>>>();
export function overlapScopeKey(shown: readonly OverlapCat[], selected: OverlapFocus) {
  return JSON.stringify([[...shown].sort(), selected?.side ?? null, selected?.cat ?? null, selected?.layer ?? null, selected?.type ?? null]);
}
export function computeOverlapDisplay(result: OverlapResult, shown: readonly OverlapCat[], selected: OverlapFocus): Promise<OverlapMapDisplay> {
  const key = overlapScopeKey(shown, selected);
  const cache = displayCache.get(result) ?? new Map<string, Promise<OverlapMapDisplay>>();
  displayCache.set(result, cache);
  const hit = cache.get(key);
  if (hit) return hit;
  const input = visibleOverlapItems(result.pieces, result.side, shown, overlapScopeFocus(selected));
  const work = buildOverlapDisplay(input, result.zones, {
    union: async (geometries) => geometries[0]?.type === 'point' ? geometries[0]
      : await geometryEngineAsync.union(geometries) as Geom | null,
    intersectMany: async (geometries, boundary) => await geometryEngineAsync.intersect(geometries, boundary) as unknown as (Geom | null)[],
    touches: (geometry, boundary) => {
      const extent = boundary.extent;
      return !extent || touches({ feature: '', type: '', layer: '', geom: geometry, ext: geometry.extent }, extent);
    },
    isEmpty,
    lengthM: (geometry) => geometry.type === 'polyline' ? lengthM(geometry) : 0,
  });
  // Олон давхаргаар дараалан шүүсэн ч геометрийн кэшийг хязгаартай байлгана.
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(key, work);
  work.catch(() => cache.delete(key));
  return work;
}

/** Метрийг уншигдахуйц: < 1 км → «420 м», ≥ 1 км → «1.24 км» (`format.ts` — хэлний тоон хэлбэр) */
export const fmtLen = (m: number) => (m >= 1000 ? `${km(m, 2)} ${tr('км')}` : `${num(m)} ${tr('м')}`);
