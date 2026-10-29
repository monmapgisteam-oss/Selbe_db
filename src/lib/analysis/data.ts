'use client';

/**
 * АНАЛИЗ — өгөгдөл татах, бүс тус бүрээр нэгтгэх давхарга.
 *
 * Бүх орон зайн тооцоо UTM 48N (метр) дээр ПЛАНАРААР хийгдэнэ — геодезик
 * тооцоо энэ хэмжээний талбайд ялгаа өгөхгүй бөгөөд хамаагүй удаан.
 */

import Query from '@arcgis/core/rest/support/Query';
import { t as tr } from '@/lib/i18nCore';
import * as query from '@arcgis/core/rest/query';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryEngineAsync from '@arcgis/core/geometry/geometryEngineAsync';
import type Geometry from '@arcgis/core/geometry/Geometry';

type GeomArg = __esri.GeometryUnion;
import type Polygon from '@arcgis/core/geometry/Polygon';
import { layerUrl, LAYER_BY_ID, ZONE_FIELDS, zoneCanon, zoneRefValues, zoneType, SELBE_ET } from '@/lib/services';
import { register } from '@/lib/dataBus';
import { classifyBuilding, buildingTrips } from './transport';
import {
  WKID, SRC, ENGINEERING_IDS, SOCIAL_FACILITIES, GREEN_CATEGORIES,
  BF, isResidential, EXCLUDED_ZONE_TYPES,
  BUILDING_PURPOSES, BUILDING_PURPOSE_OTHER, buildingPurposeKey, ASSUME_MET,
  type ParkingOpt, type Indicator,
} from './config';

type Attrs = Record<string, unknown>;
type Feat = { attributes: Attrs; geometry?: Geometry | null };

const url = (id: string) => layerUrl(LAYER_BY_ID[id]);
const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/**
 * Давхаргын БҮХ объектыг татна.
 */
const PAGE = 2000;
async function fetchAll(u: string, outFields: string[], returnGeometry = false): Promise<Feat[]> {
  const out: Feat[] = [];
  for (let start = 0; ; ) {
    const q = new Query({
      where: '1=1',
      outFields,
      returnGeometry,
      outSpatialReference: { wkid: WKID },
      orderByFields: ['objectid ASC'],
      start,
      num: PAGE,
    });
    const res = await query.executeQueryJSON(u, q);
    out.push(...(res.features as unknown as Feat[]));
    if (res.features.length === 0) break;
    if (res.features.length < PAGE && !res.exceededTransferLimit) break;
    start += res.features.length;
  }
  return out;
}

/* ══════════════════ Бүсийн бичлэг ══════════════════ */

export type Zone = {
  id: string;
  type: string;
  /**
   * ОНООЛОЛД ОРОХГҮЙ бүс (ногоон байгууламж, одоо байгаа барилга). Тооцоо,
   * эрэмбэ, дундажаас ХАСНА; газрын зурагт «өгөгдөлгүй» саараар харагдана.
   */
  excluded: boolean;
  geometry: Polygon | null;
  /** Албан ёсны талбай (га) — САНХҮҮД. `Area` талбар. */
  areaHa: number;
  /** Полигоны бодит талбай (га) — ХОТ ТӨЛӨВЛӨЛТӨД (нягтшил). */
  polyHa: number;
  zoneFar: number | null;
  zoneBcr: number | null;

  normParking: number;
  etIl: number;
  etDald: number;
  etNiit: number;

  /* Барилгаас нэгтгэсэн */
  population: number;
  residentPop: number;
  capacityPop: number;
  buildingCount: number;
  households: number;
  gfaM2: number;
  /** Барилгын ХӨЛ талбайн нийлбэр (м²) — полигоны бодит талбай, давхаргүй */
  builtM2: number;

  greenByCat: Record<string, number>;
  greenM2: number;
  /**
   * НӨЛӨӨЛЛИЙН БҮС — бүсийн ОРОН СУУЦНЫ барилга бүрээс хамгийн ойрын ногоон
   * байгууламж хүртэлх зай (м) ба тэнд оршин суудаг хүний тоо.
   */
  greenDist: { pop: number; d: number }[];

  /* Орон зайн түүхий утга */
  transitM: number | null;
  engDistM: number | null;
  social: SocialResult | null;

  parkingSupply: number;
  parkingNeed: number | null;
  parkingGap: number | null;

  raw: Record<string, number | null>;
  /**
   * `ASSUME_MET`-ээр ДАРАГДАХААС ӨМНӨХ бодит утгууд.
   */
  rawActual: Record<string, number | null>;
};

export type SocialPart = {
  key: string;
  label: string;
  radius: number;
  weight: number;
  /** Хамрах хувь 0..100 (орон сууцны хүн амаар жигнэсэн), өгөгдөлгүй бол null */
  cover: number | null;
  /** Тухайн төрлийн байгууламжийн тоо (төсөл даяар) */
  count: number;
  /** Хүрээнд багтсан оршин суугч */
  covered: number;
  /** Бүсийн нийт оршин суугч */
  pop: number;
  /** Бүсийн орон сууцнаас байгууламж хүртэлх ХАМГИЙН ойр зай (м) */
  nearest: number | null;
};

export type SocialResult = { parts: SocialPart[]; score: number | null };

/* `Econ` төрөл мөн устгагдав (2026-08-24). */

export type AnalysisData = {
  zones: Zone[];
  /** Ногоон байгууламжийн `Layer` талбарт бодитоор байсан ангиллууд */
  greenCats: string[];
  /** Барилгын зориулалтын бүлгүүд — «Барилгын ангилал» карт */
  buildingCats: BuildingPurposeStat[];
  /** Барилгын цэгүүд — «Байршил» картын шинжилгээ */
  bldPts: LocationPt[];
  failed: string[];
};

/**
 * БАРИЛГЫН ЦЭГ — «Байршил» картын шинжилгээний нэгж.
 */
export type LocationPt = {
  oid: number;
  purpose: string;
  /** Зориулалтын БҮЛЭГ (`BUILDING_PURPOSES`) — өнгө, шүүлтэд */
  group: string;
  zone: string | null;
  pop: number;
  /** Оргил цагийн хүн-зорчилт (`transport.ts`-ийн загвар) */
  trips: number;
  x: number;
  y: number;
};

/** Нэг зориулалтын бүлгийн нэгтгэл */
export type BuildingPurposeStat = {
  key: string;
  label: string;
  color: string;
  count: number;
  /** Барилгын нийт талбай (м²) */
  gfaM2: number;
  /** Оршин суугч (орон сууцны бүлэгт) эсвэл хүчин чадал (бусад бүлэгт) */
  pop: number;
  /**
   * Бүлэгт бодитоор багтсан `Зориулалт_m`-ийн ТҮҮХИЙ утгууд.
   */
  values: string[];
  /** Бүлэгт зориулалт нь ХООСОН/NULL бичлэг оров уу */
  hasBlank: boolean;
};

/* ══════════════════ Ачаалалт ══════════════════ */

export type Progress = (msg: string, pct: number) => void;

/**
 * Ногоон байгууламжийн `RefName_12` → бүсийн код тааруулах.
 * «Багц-2.1» гэх мэт дэд дугаарыг эцэг бүс рүү нь буулгана.
 */
function resolveZoneId(raw: unknown, ids: Set<string>): string | null {
  const id = zoneCanon(raw);
  if (!id) return null;
  if (ids.has(id)) return id;
  const split = zoneRefValues(id).map(zoneCanon).find((c) => ids.has(c));
  if (split) return split;
  const parent = id.replace(/\.\d+$/, '');
  return ids.has(parent) ? parent : null;
}

/**
 * БҮСИЙН ДАВХАРДСАН КОД — нэг кодтой олон мөрөөс НЭГИЙГ үлдээнэ; байрлал нь эхний мөрийнх (цэвэр функц —
 * `zoneDedupe.check`). Кодгүй (хоосон) мөр хөндөгдөхгүй. Сонголтын дараалал:
 *   1. бусад кодын бүстэй ДАВХЦАЛ хамгийн бага (`overlapOf`, м²; 1 м²-аас бага зөрүү тэнцүү);
 *   2. дотоод цагираг (НҮХ) олон (`holesOf`);
 *   3. талбай (`areaOf`) том; 4. тэнцвэл эхнийх.
 */
export function dedupeZoneFeats<T extends { attributes: Record<string, unknown> }>(
  feats: readonly T[],
  idOf: (a: Record<string, unknown>) => string,
  areaOf: (a: Record<string, unknown>) => number,
  opts: {
    /** Дотоод цагирагийн (нүхний) тоо */
    holesOf?: (f: T) => number;
    /** Бусад КОДЫН бүсүүдтэй давхцах талбай (м²) — `others` нь өөр кодтой мөрүүд */
    overlapOf?: (f: T, others: readonly T[]) => number;
  } = {},
): { feats: T[]; dups: string[] } {
  const groups = new Map<string, T[]>();
  for (const f of feats) {
    const id = idOf(f.attributes);
    if (!id) continue;
    const g = groups.get(id);
    if (g) g.push(f); else groups.set(id, [f]);
  }
  const best = new Map<string, T>();
  const dups: string[] = [];
  for (const [id, g] of groups) {
    if (g.length === 1) continue;
    dups.push(id);
    const others = opts.overlapOf ? feats.filter((f) => idOf(f.attributes) !== id) : [];
    const rank = g.map((f) => ({
      f,
      ov: opts.overlapOf ? opts.overlapOf(f, others) : 0,
      holes: opts.holesOf ? opts.holesOf(f) : 0,
      area: areaOf(f.attributes),
    }));
    let b = rank[0];
    for (const c of rank.slice(1)) {
      const better = Math.abs(c.ov - b.ov) >= 1 ? c.ov < b.ov
        : c.holes !== b.holes ? c.holes > b.holes
          : c.area > b.area;
      if (better) b = c;
    }
    best.set(id, b.f);
  }
  const out: T[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    const id = idOf(f.attributes);
    if (!id) { out.push(f); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(best.get(id) ?? f);
  }
  return { feats: out, dups };
}

/** Полигоны ДОТООД цагирагийн тоо — ESRI-д гадна цагираг цагийн зүүний дагуу, нүх эсрэг (шулуун тооллын талбай > 0) */
export function interiorRingCount(rings: readonly (readonly (readonly number[])[])[] | null | undefined): number {
  let n = 0;
  for (const r of rings ?? []) {
    let s = 0;
    for (let i = 0; i + 1 < r.length; i += 1) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    if (s > 0) n += 1;
  }
  return n;
}

/**
 * БҮСИЙН ТӨЛӨВЛӨЛТИЙН БИЧЛЭГ ХООСОН эсэх — FAR · BCR · зогсоолын норм · төлөвлөсөн ил/далд зогсоол БҮГД 0/хоосон.
 */
export const planRecordMissing = (z: Pick<Zone, 'zoneFar' | 'zoneBcr' | 'normParking' | 'etIl' | 'etDald'>): boolean =>
  !(z.zoneFar ?? 0) && !(z.zoneBcr ?? 0) && !z.normParking && !z.etIl && !z.etDald;

let cache: Promise<AnalysisData> | null = null;
register(() => { cache = null; }, []);

export function loadAnalysisCached(onProgress: Progress = () => {}): Promise<AnalysisData> {
  if (!cache) {
    cache = loadAnalysis(onProgress)
      .then((d) => { if (d.failed.length) cache = null; return d; })
      .catch((e) => {
        cache = null; // алдаа кэшлэхгүй — дахин оролдох боломжтой байх ёстой
        throw e;
      });
  }
  return cache;
}

export async function loadAnalysis(onProgress: Progress = () => {}): Promise<AnalysisData> {
  onProgress(tr('Бүсийн мэдээлэл…'), 6);
  const Z = ZONE_FIELDS;
  const zoneFeats0 = await fetchAll(url(SRC.zones), [
    Z.id, Z.type, Z.areaHa, 'SHAPE__Area', Z.far, Z.farPct, Z.bcr,
    Z.parkNorm, Z.parkPlanOpen, Z.parkPlanUnder,
  ], true);
  const ringsOf = (f: Feat) => ((f.geometry as Polygon | null)?.rings ?? []) as number[][][];
  const { feats: zoneFeats, dups: zoneDups } = dedupeZoneFeats(zoneFeats0, (a) => zoneCanon(a[Z.id]), (a) => n(a.SHAPE__Area), {
    holesOf: (f) => interiorRingCount(ringsOf(f)),
    overlapOf: (f, others) => {
      const g = f.geometry as GeomArg | null;
      if (!g) return 0;
      let s = 0;
      for (const o of others) {
        const og = o.geometry as GeomArg | null;
        if (!og || !geometryEngine.intersects(g, og)) continue;
        const x = geometryEngine.intersect(g, og) as Polygon | null;
        if (x) s += Math.abs(geometryEngine.planarArea(x, 'square-meters'));
      }
      return s;
    },
  });
  if (zoneDups.length) {
    console.warn(`[selbe] анализ: бүсийн давхаргад давхардсан код — ${zoneDups.join(', ')} (бусад бүстэй давхцалгүй/нүхтэй хуулбарыг үлдээв; давхаргад засах хэрэгтэй)`);
  }

  onProgress(tr('Барилга байгууламж…'), 22);
  const buildings = await fetchAll(url(SRC.buildings), [
    'objectid', 'zone_id', BF.population, BF.capacity, BF.households, BF.status,
    BF.gfa, BF.purpose, BF.foot,
  ], true);

  onProgress(tr('Ногоон байгууламж…'), 38);
  const GREEN_DATA_URL = `${SELBE_ET}/114`;
  const green = await fetchAll(GREEN_DATA_URL, ['refname_12', 'SHAPE__Area'], true);

  onProgress(tr('Нийтийн тээврийн зогсоол…'), 50);
  const failed: string[] = [];
  const soft = (label: string) => (e: unknown): Feat[] => {
    console.warn(`[selbe] анализ: «${label}» татагдсангүй:`, e);
    if (!failed.includes(label)) failed.push(label);
    return [];
  };
  const [bus, lrt] = await Promise.all([
    fetchAll(url(SRC.busStops), ['objectid'], true).catch(soft(tr('Автобусны буудал'))),
    fetchAll(url(SRC.lrtStops), ['objectid'], true).catch(soft(tr('LRT буудал'))),
  ]);

  onProgress(tr('Инженерийн дэд бүтэц…'), 72);
  const engResults = await Promise.all(
    ENGINEERING_IDS.map((id) => fetchAll(url(id), ['objectid'], true).catch(soft(tr('Инженерийн дэд бүтэц')))),
  );

  onProgress(tr('Орон зайн үзүүлэлт…'), 84);

  const stopGeoms = [...bus, ...lrt].map((f) => f.geometry).filter(Boolean) as GeomArg[];
  const engGeoms = engResults.flat().map((f) => f.geometry).filter(Boolean) as GeomArg[];

  const greenGeoms = green.map((f) => f.geometry).filter(Boolean) as GeomArg[];
  const [engUnion, greenUnion] = await Promise.all([
    engGeoms.length ? geometryEngineAsync.union(engGeoms) : Promise.resolve(null),
    greenGeoms.length ? geometryEngineAsync.union(greenGeoms) : Promise.resolve(null),
  ]);

  /* ── Ногоон байгууламжийг бүс + ангиллаар ── */
  const zoneIds = new Set(zoneFeats.map((f) => zoneCanon(f.attributes[Z.id])));
  const greenByZone = new Map<string, Record<string, number>>();
  const greenCats = new Set<string>();
  for (const f of green) {
    const a = f.attributes;
    const zid = resolveZoneId(a.refname_12, zoneIds);
    if (!zid) continue;
    const cat = GREEN_CATEGORIES[0].key;
    greenCats.add(cat);
    const bucket = greenByZone.get(zid) ?? {};
    bucket[cat] = (bucket[cat] ?? 0) + n(a.SHAPE__Area);
    greenByZone.set(zid, bucket);
  }

  /* ── Бүс бүрийн бичлэг ── */
  /** BCR талбарын хэмжээс — бүх бүсийн утгаас НЭГ удаа (`bcrScaleOf`) */
  const bcrFrac = bcrScaleOf(zoneFeats.map((f) => f.attributes[Z.bcr]));
  const zones: Zone[] = zoneFeats.map((f) => {
    const a = f.attributes;
    const id = zoneCanon(a[Z.id]);
    const geom = (f.geometry ?? null) as Polygon | null;

    // ТАЛБАЙ — `Area` (га) нь бүсийн албан ёсны, зам/нийтийн эзэмшил хассан
    // цэвэр талбай. Санхүүд энэ, нягтшилд полигоны БОДИТ талбай хэрэглэнэ:
    // хүн ам бүсийн бүтэн газар нутаг дээр амьдардаг.
    const areaHa = n(a[Z.areaHa]) > 0 ? n(a[Z.areaHa]) : n(a.SHAPE__Area) / 10_000;
    const polyHa = n(a.SHAPE__Area) > 0 ? n(a.SHAPE__Area) / 10_000 : areaHa;

    const zoneFar = a[Z.farPct] != null ? n(a[Z.farPct]) / 100 : (a[Z.far] != null ? n(a[Z.far]) : null);
    // BCR нь эзлэх ХЭСЭГ (0–0.5) тул ×100 хийж хувь болгоно
    const zoneBcr = a[Z.bcr] != null ? bcrToPct(n(a[Z.bcr]), bcrFrac) : null;

    let transitM: number | null = null;
    if (geom && stopGeoms.length) {
      transitM = Math.min(...stopGeoms.map((g) => geometryEngine.distance(geom, g, 'meters')));
    }

    const engDistM = geom && engUnion ? geometryEngine.distance(geom, engUnion, 'meters') : null;

    const type = zoneType(a[Z.type]);
    return {
      id,
      type,
      excluded: EXCLUDED_ZONE_TYPES.has(type),
      geometry: geom,
      areaHa, polyHa, zoneFar, zoneBcr,
      normParking: n(a[Z.parkNorm]),
      etIl: n(a[Z.parkPlanOpen]), etDald: n(a[Z.parkPlanUnder]),
      etNiit: n(a[Z.parkPlanOpen]) + n(a[Z.parkPlanUnder]),
      ...emptyAgg(),
      greenByCat: greenByZone.get(id) ?? {},
      greenM2: 0,
      greenDist: [],
      transitM, engDistM,
      social: null,
      parkingSupply: 0, parkingNeed: null, parkingGap: null,
      raw: {},
      rawActual: {},
    };
  });

  aggregateBuildings(zones, buildings);

  onProgress(tr('Нийгмийн дэд бүтцийн хүртээмж…'), 93);
  computeSocialAccess(zones, buildings, greenUnion);

  onProgress(tr('Бэлэн'), 100);

  return {
    zones,
    greenCats: [...greenCats].sort(),
    buildingCats: groupBuildingPurposes(buildings),
    bldPts: locationPts(buildings),
    failed,
  };
}

/**
 * Барилга бүрийн ТӨВ ЦЭГ + шинжилгээнд хэрэгтэй атрибут.
 */
function locationPts(buildings: Feat[]): LocationPt[] {
  const out: LocationPt[] = [];
  for (const f of buildings) {
    const cen = (f.geometry as Polygon | null)?.centroid;
    if (!cen) continue;
    const a = f.attributes;
    const purpose = String(a[BF.purpose] ?? '').trim();
    const pop = n(a[BF.population]);
    const cap = n(a[BF.capacity]);
    out.push({
      oid: n(a.objectid),
      purpose,
      group: buildingPurposeKey(purpose),
      zone: (a._zone as string | undefined) ?? null,
      pop,
      trips: buildingTrips(classifyBuilding(purpose), pop, cap),
      x: cen.x,
      y: cen.y,
    });
  }
  return out;
}


/**
 * Барилгуудыг ЗОРИУЛАЛТЫН бүлгээр нэгтгэнэ.
 */
function groupBuildingPurposes(buildings: Feat[]): BuildingPurposeStat[] {
  const agg = new Map<string, { count: number; gfaM2: number; pop: number; values: Set<string>; blank: boolean }>();
  for (const f of buildings) {
    const a = f.attributes;
    const raw = String(a[BF.purpose] ?? '').trim();
    const key = buildingPurposeKey(raw);
    const b = agg.get(key) ?? { count: 0, gfaM2: 0, pop: 0, values: new Set<string>(), blank: false };
    b.count += 1;
    b.gfaM2 += n(a[BF.gfa]);
    // Бүлэгт нэг л «хүн» багана — орон сууцны бүлэгт оршин суугч, бусдад хүчин чадал
    b.pop += isResidential(raw) ? n(a[BF.population]) : n(a[BF.capacity]);
    const orig = a[BF.purpose] == null ? null : String(a[BF.purpose]);
    if (orig != null) b.values.add(orig);
    if (!raw) b.blank = true;
    agg.set(key, b);
  }

  const defs = [...BUILDING_PURPOSES.map((g) => ({ key: g.key, label: g.label, color: g.color })),
    { ...BUILDING_PURPOSE_OTHER }];

  return defs
    .filter((d) => agg.has(d.key))
    .map((d) => {
      const b = agg.get(d.key)!;
      return {
        key: d.key, label: d.label, color: d.color,
        count: b.count, gfaM2: b.gfaM2, pop: b.pop,
        values: [...b.values].sort(), hasBlank: b.blank,
      };
    })
    .sort((x, y) => (x.key === BUILDING_PURPOSE_OTHER.key ? 1
      : y.key === BUILDING_PURPOSE_OTHER.key ? -1
        : y.count - x.count));
}

/* ══════════════════ Барилгын нэгтгэлт ══════════════════ */

function emptyAgg() {
  return {
    population: 0, residentPop: 0, capacityPop: 0,
    buildingCount: 0, households: 0,
    gfaM2: 0, builtM2: 0,
  };
}

/**
 * Барилгыг бүсэд оноож нэгтгэнэ — SELECT BY LOCATION.
 */
const SNAP_METERS = 100;

type ZoneGeom = { id: string; g: Polygon };

function aggregateBuildings(zones: Zone[], buildings: Feat[]) {
  const geoms: ZoneGeom[] = zones
    .filter((z) => z.id && z.geometry)
    .map((z) => ({ id: z.id, g: z.geometry! }));
  const byZone = new Map<string, ReturnType<typeof emptyAgg>>();

  for (const f of buildings) {
    const a = f.attributes;
    const c = (f.geometry as Polygon | null)?.centroid;
    if (!c) continue;

    let hit: ZoneGeom | undefined = geoms.find((z) => geometryEngine.contains(z.g, c));
    if (!hit) {
      // Төв цэг ямар ч бүсэд орохгүй бол хамгийн ойрын бүс рүү SNAP_METERS хүртэл наана.
      // (19 хоосон барилгын 14 нь бүсийн дотор, үлдсэн 5 нь 66–83 м зайд байдаг.)
      let best: ZoneGeom | undefined, bd = Infinity;
      for (const z of geoms) {
        const dist = geometryEngine.distance(z.g, c, 'meters');
        if (dist < bd) { bd = dist; best = z; }
      }
      if (bd <= SNAP_METERS) hit = best;
    }
    if (!hit) continue;
    a._zone = hit.id;

    const b = byZone.get(hit.id) ?? emptyAgg();
    const pop = n(a[BF.population]);
    const cap = n(a[BF.capacity]);
    const gfa = n(a[BF.gfa]);

    b.population += pop + cap;
    b.residentPop += pop;
    b.capacityPop += cap;
    b.gfaM2 += gfa;
    b.builtM2 += n(a[BF.foot]);
    b.households += n(a[BF.households]);
    b.buildingCount += 1;
    byZone.set(hit.id, b);
  }

  for (const z of zones) Object.assign(z, emptyAgg(), byZone.get(z.id) ?? {});
}

/* ══════════════════ Нийгмийн дэд бүтцийн хүртээмж ══════════════════ */

/**
 * 500 м BUFFER, ЗӨВХӨН ОРОН СУУЦНЫ хамралт.
 *
 * Байгууламж (сургууль · цэцэрлэг · эмнэлэг) бүрээс 500 м хүрээ татаад, бүсийн
 * ОРОН СУУЦНЫ барилга бүр тэр хүрээнд багтаж байгаа эсэхийг шалгана. Хамрах
 * хувь нь ХҮН АМААР жигнэгдэнэ:
 *
 *     хамрах % = (хүрээнд багтсан орон сууцны хүн ам) ÷ (бүсийн нийт оршин суугч)
 */
function computeSocialAccess(zones: Zone[], buildings: Feat[], greenUnion: GeomArg | null) {
  /** Байгууламжийн төв цэгүүд — төрлөөр */
  const facs: Record<string, __esri.Point[]> = {};
  for (const sf of SOCIAL_FACILITIES) facs[sf.key] = [];

  /** Бүс бүрийн ОРОН СУУЦНЫ барилгууд (төв цэг + хүн ам) */
  const resByZone = new Map<string, { c: __esri.Point; pop: number }[]>();

  for (const f of buildings) {
    const a = f.attributes;
    const c = (f.geometry as Polygon | null)?.centroid;
    if (!c) continue;
    const purpose = String(a[BF.purpose] ?? '').trim();

    for (const sf of SOCIAL_FACILITIES) if (sf.re.test(purpose)) facs[sf.key].push(c);

    if (isResidential(purpose)) {
      const zid = a._zone as string | undefined;
      if (!zid) continue;
      const list = resByZone.get(zid) ?? [];
      list.push({ c, pop: n(a[BF.population]) });
      resByZone.set(zid, list);
    }
  }

  for (const z of zones) {
    const res = resByZone.get(z.id) ?? [];
    const pop = res.reduce((a, b) => a + b.pop, 0);

    /* Ногоон хүртэлх зай — «нөлөөллийн бүс» аргын түүхий өгөгдөл */
    z.greenDist = greenUnion
      ? res.map((b) => ({ pop: b.pop, d: geometryEngine.distance(greenUnion, b.c, 'meters') }))
      : [];

    const parts: SocialPart[] = SOCIAL_FACILITIES.map((sf) => {
      const pts = facs[sf.key];
      let covered = 0;
      let nearest = Infinity;

      for (const b of res) {
        let d = Infinity;
        for (const p of pts) {
          const dd = geometryEngine.distance(b.c, p, 'meters');
          if (dd < d) d = dd;
        }
        if (d <= sf.radius) covered += b.pop;
        if (d < nearest) nearest = d;
      }

      return {
        key: sf.key, label: sf.label, radius: sf.radius, weight: sf.weight,
        // Байгууламж огт байхгүй бол 0% — энэ нь ЖИНХЭНЭ хүртээмжгүй байдал
        cover: pop > 0 ? (covered / pop) * 100 : null,
        count: pts.length,
        covered,
        pop,
        nearest: Number.isFinite(nearest) ? nearest : null,
      };
    });

    let sum = 0, wsum = 0;
    for (const p of parts) {
      if (p.cover !== null) { sum += p.cover * p.weight; wsum += p.weight; }
    }
    z.social = { parts, score: wsum ? sum / wsum : null };
  }

  return zones;
}

/* ══════════════════ Эдийн засаг ══════════════════ */


/**
 * BCR талбар ХЭСЭГ (0–1) үү, ХУВЬ (0–100) уу — БҮХ бүсийн утгын МЕДИАНААР.
 */
export function bcrScaleOf(values: unknown[]): boolean {
  const v = values
    .map((x) => (x == null || x === '' ? NaN : Number(x)))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (!v.length) return true;
  return v[Math.floor(v.length / 2)] <= 1.5;
}

/**
 * Нэг BCR утгыг ХУВЬ болгоно.
 */
export const bcrToPct = (v: number, fraction: boolean): number =>
  (fraction && v <= 1.5 ? v * 100 : v);

/** Зогсоолын хэрэгцээг сонгосон аргаар */
export function parkingNeedOf(z: Zone, p: ParkingOpt): number | null {
  switch (p.source) {
    case 'households': return z.households > 0 ? z.households * p.perHousehold : null;
    case 'population': return z.residentPop > 0 ? (z.residentPop * p.per1000) / 1000 : null;
    default: return z.normParking > 0 ? z.normParking : null;
  }
}

/**
 * `ASSUME_MET` үзүүлэлтийн «норм хангасан» утга — ОДООГИЙН (засагдсан) нормоос.
 */
function assumedValue(id: string, fallback: number, indicators?: readonly Indicator[]): number {
  const ind = indicators?.find((i) => i.id === id);
  if (!ind) return fallback;
  const v = ind.mode === 'higher' ? ind.target : ind.mode === 'lower' ? ind.best : ind.optMin;
  return v != null && Number.isFinite(v) ? v : fallback;
}

/**
 * Сонгосон ногоон ангилал / зогсоолын аргаас хамаарч ТҮҮХИЙ үзүүлэлтийг дахин бодно.
 * (Жин өөрчлөгдөхөд энэ дахин ажиллах шаардлагагүй — зөвхөн оноолт л дахин бодогдоно.
 */
export function computeRaw(
  zones: Zone[],
  activeGreen: Set<string>,
  parking: ParkingOpt,
  // «Бүсийн ангилал» картаас гараар идэвхжүүлсэн (хасагдсан) ангиллууд — оноолд оруулна
  scoreTypes?: Set<string>,
  // Одоогийн (засагдсан) үзүүлэлтүүд — `ASSUME_MET`-ийн утгыг нормд уяна
  indicators?: readonly Indicator[],
) {
  for (const z of zones) {
    /**
     * Урьд нь энэ мөр хасалтын доор байсан тул «Ногоон байгууламж, тохижилт»
     * ангилалтай 10 бүсийн 16.1 га ногоон нь `greenM2 = 0` болж, төслийн ногоон
     * 54 га-гийн оронд 36 га гэж харагддаг байв — яг ногоон байгууламжийн бүсийн
     * ногоон нь тоологдохгүй байсан нь илт буруу.
     */
    z.greenM2 = Object.entries(z.greenByCat)
      .filter(([cat]) => activeGreen.has(cat))
      .reduce((a, [, v]) => a + v, 0);

    // Оноололд орохгүй бүс — түүхий үзүүлэлт бодохгүй (raw хоосон → оноо null → саарал).
    // Гараар идэвхжүүлсэн ангилал бол ХАСАХГҮЙ (доор бодогдоно).
    if (z.excluded && !scoreTypes?.has(z.type)) {
      z.raw = {}; z.rawActual = {};
      z.parkingSupply = 0; z.parkingNeed = null; z.parkingGap = null;
      continue;
    }

    z.parkingSupply = z.etNiit;
    z.parkingNeed = parkingNeedOf(z, parking);
    const planMissing = planRecordMissing(z);
    z.parkingGap = z.parkingNeed == null || planMissing ? null : z.parkingSupply - z.parkingNeed;

    z.raw = {
      far: z.zoneFar && z.zoneFar > 0 ? z.zoneFar : null,
      bcr: z.zoneBcr && z.zoneBcr > 0 ? z.zoneBcr : null,
      parking: !planMissing && z.parkingNeed && z.parkingNeed > 0 ? (z.parkingSupply / z.parkingNeed) * 100 : null,
      /**
       * НОГООН — ХОЁР ТУСДАА үзүүлэлт, нягтшилтай ЯГ ижил хос:
       *   · `green`    — нэг ОРШИН СУУГЧид ногдох м² (БНБД 8.2, жинтэй)
       *   · `greenCap` — нэг ХҮЧИН ЧАДАЛД ногдох м² (лавлагаа, жингүй)
       */
      green: z.residentPop > 0 ? z.greenM2 / z.residentPop : null,
      greenCap: z.capacityPop > 0 ? z.greenM2 / z.capacityPop : null,
      /**
       * НЯГТШИЛ — ХОЁР ТУСДАА үзүүлэлт (хэрэглэгчийн шийдвэр, 2026-08-12).
       */
      density: z.polyHa > 0 && z.residentPop > 0 ? z.residentPop / z.polyHa : null,
      densityCap: z.polyHa > 0 && z.capacityPop > 0 ? z.capacityPop / z.polyHa : null,
      transit: z.transitM,
      engineering: z.engDistM,
      social: z.social?.score ?? null,
    };

    /* ── ТҮР дүгнэлт ── `ASSUME_MET` дэх үзүүлэлтийг «норм хангасан» болгоно. */
    z.rawActual = z.raw;
    const assumed = Object.entries(ASSUME_MET);
    if (assumed.length) {
      z.raw = { ...z.raw };
      for (const [id, v] of assumed) z.raw[id] = assumedValue(id, v, indicators);
    }
  }
}

/** Барилгын давамгайлах нэгж үнэ (₮/м²) — гулсуурын анхны утга */

/** Анхдагчаар идэвхтэй ногоон ангиллууд */
export const defaultGreenCats = () =>
  new Set(GREEN_CATEGORIES.filter((c) => c.default).map((c) => c.key));
