'use client';

/**
 * АНАЛИЗ — өгөгдөл татах, бүс тус бүрээр нэгтгэх давхарга.
 *
 * Бүх орон зайн тооцоо UTM 48N (метр) дээр ПЛАНАРААР хийгдэнэ — геодезик
 * тооцоо энэ хэмжээний талбайд ялгаа өгөхгүй бөгөөд хамаагүй удаан.
 *
 * ⚠️ Энэ модуль ГЕОМЕТР татдаг цорын ганц газар. Давхаргын тоо, хэмжээг
 * `lib/totals.ts` сервер тал дээр бодуулдаг; энд зөвхөн орон зайн харьцаа
 * (зай, огтлолцол, агуулагдал) шаардсан зүйлийг л татна.
 */

import Query from '@arcgis/core/rest/support/Query';
import { t as tr } from '@/lib/i18nCore';
import * as query from '@arcgis/core/rest/query';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import * as geometryEngineAsync from '@arcgis/core/geometry/geometryEngineAsync';
import type Geometry from '@arcgis/core/geometry/Geometry';

/**
 * ⚠️ ArcGIS 4.34-д `geometryEngine` нь хийсвэр `Geometry`-г БИШ, тодорхой
 * төрлүүдийн НЭГДЛИЙГ (`GeometryUnion`) хүлээж авдаг болсон. Асуулгаас ирэх
 * геометр нь ажиллах үедээ яг тэдгээрийн нэг тул хөрвүүлэлт нь аюулгүй.
 */
type GeomArg = __esri.GeometryUnion;
import type Polygon from '@arcgis/core/geometry/Polygon';
import { layerUrl, LAYER_BY_ID, ZONE_FIELDS, zoneCanon, zoneRefValues, zoneType } from '@/lib/services';
import { classifyBuilding, buildingTrips } from './transport';
import {
  WKID, SRC, ENGINEERING_IDS, SOCIAL_FACILITIES, GREEN_CATEGORIES,
  BF, isResidential, EXCLUDED_ZONE_TYPES,
  BUILDING_PURPOSES, BUILDING_PURPOSE_OTHER, buildingPurposeKey, ASSUME_MET,
  type ParkingOpt,
} from './config';

type Attrs = Record<string, unknown>;
type Feat = { attributes: Attrs; geometry?: Geometry | null };

const url = (id: string) => layerUrl(LAYER_BY_ID[id]);
const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

/**
 * Давхаргын БҮХ объектыг татна.
 *
 * ⚠️ Үйлчилгээний `maxRecordCount` (2000) дээр таслагдахаас сэргийлж ХУУДАСЛАНА.
 * Үгүй бол 3,200 объекттой «Гадна дулаан» дутуу ирж, инженерийн хүртээмжийн
 * тооцоо чимээгүй буруу гарна.
 */
const PAGE = 2000;
async function fetchAll(u: string, outFields: string[], returnGeometry = false): Promise<Feat[]> {
  const out: Feat[] = [];
  // ⚠️ Дараагийн хуудсыг ИРСЭН бичлэгийн тоогоор ахиулна (PAGE-ээр НЕ).
  // Сервер хариуны хэмжээгээр таслахад 2000-аас цөөн ирж, exceededTransferLimit
  // үнэн байдаг — PAGE-ээр ахиулбал дундах бичлэгүүд чимээгүй алдагдана.
  for (let start = 0; ; ) {
    const q = new Query({
      where: '1=1',
      outFields,
      returnGeometry,
      outSpatialReference: { wkid: WKID },
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
   *
   * ⚠️ Радиусыг гулсуураар өөрчилдөг тул ЗАЙГ нэг удаа бодоод хадгална —
   * хамралт нь дараа нь энгийн шүүлт (`d <= R`) болно. Эс бөгөөс гулсуур
   * хөдлөх бүрд 800 полигоны union ба 368 зайн тооцоо дахин явна.
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
   * ⚠️ Тооцоо зогсоогүй гэдгийн баталгаа: дарагдсан үзүүлэлтийн жинхэнэ утга
   * энд бүтнээрээ хадгалагдана (`ASSUME_MET` хоосон бол `raw`-тай ижил).
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
};

/**
 * БАРИЛГЫН ЦЭГ — «Байршил» картын шинжилгээний нэгж.
 *
 * ⚠️ Зайг УРЬДЧИЛАН бодохгүй: хэрэглэгч ЯМАР Ч барилгыг сонгож болох тул бүх
 * хосын зай (368² ≈ 135,000) хэрэг болно. Оронд нь координатыг өгөөд UI тал
 * дээр сонгосон барилгаас нь л (368 тооцоо) бодуулна.
 *
 * ⚠️ Координат нь UTM 48N (метр, `WKID`) тул зай нь ШУУД метрээр гарна.
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
   * ⚠️ Газрын зургийн шүүлтэд (SQL `NOT IN`) хэрэгтэй: ArcGIS-д кирилл regex
   * байхгүй тул бүлгийн хэв шинжийг тэнд давтаж чадахгүй.
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
  // ⚠️ Ногоон байгууламж ХУУЧИН кодтой: «D-8» нь одоо `D-8.1`/`D-8.2` болсон.
  //    Хуваагдсан бүсийн эхнийхэд нь оноож, талбайг нь алдахгүй байна.
  const split = zoneRefValues(id).map(zoneCanon).find((c) => ids.has(c));
  if (split) return split;
  const parent = id.replace(/\.\d+$/, '');
  return ids.has(parent) ? parent : null;
}

/**
 * ⚠️ Модулийн түвшний КЭШ. Энэ ачаалалт нь 4,000+ шугамын union, 368×52
 * `contains` тест хийдэг тул хэдэн секунд авна. Харагдац солих бүрд дахин
 * ажиллуулбал хэрэглэгч буцаж ирэх бүрдээ хүлээх болно. Өгөгдөл нь сесс дотор
 * өөрчлөгддөггүй тул амлалтыг нь хадгалж дахин ашиглана.
 */
let cache: Promise<AnalysisData> | null = null;

export function loadAnalysisCached(onProgress: Progress = () => {}): Promise<AnalysisData> {
  if (!cache) {
    cache = loadAnalysis(onProgress).catch((e) => {
      cache = null; // алдаа кэшлэхгүй — дахин оролдох боломжтой байх ёстой
      throw e;
    });
  }
  return cache;
}

export async function loadAnalysis(onProgress: Progress = () => {}): Promise<AnalysisData> {
  onProgress(tr('Бүсийн мэдээлэл…'), 6);
  // ⚠️ Талбарын нэрийг ЭНД бичихгүй — бүсийн давхарга солигдоход (`ZONE_ID` →
  //    `RefName_1`, `TOROL` → `Angilal`) энэ жагсаалт чимээгүй хоосон утга буцаана.
  const Z = ZONE_FIELDS;
  const zoneFeats = await fetchAll(url(SRC.zones), [
    Z.id, Z.type, Z.areaHa, 'Shape__Area', Z.far, Z.farPct, Z.bcr,
    Z.parkNorm, Z.parkPlanOpen, Z.parkPlanUnder,
  ], true);

  onProgress(tr('Барилга байгууламж…'), 22);
  const buildings = await fetchAll(url(SRC.buildings), [
    'OBJECTID', 'ZONE_ID', BF.population, BF.capacity, BF.households, BF.status,
    BF.gfa, BF.purpose, BF.foot,
  ], true);

  onProgress(tr('Ногоон байгууламж…'), 38);
  // ⚠️ `nogoon_baiguulamj/0` (`..._intersect`): бүсийн полигонтой огтлолцуулсан тул
  //    бүсийн код `RefName_12`-д БҮГД бичигдсэн (кодгүй объект байхгүй), талбай
  //    `Shape__Area` (м²) нь бүсийн хилээр тайрагдсан. Ангилалгүй — бүх объект
  //    `GREEN_CATEGORIES`-ийн ганц түлхүүрт нэгдэнэ.
  // ⚠️ ГЕОМЕТРТЭЙ: «нөлөөллийн бүс» арга нь ногооноос барилга хүртэлх ЗАЙГ
  //    хэмждэг тул зөвхөн талбайн тоо хангалтгүй.
  // ⚠️ ЗУРГИЙН давхаргаас (`data`/35, `sb:1`) ӨӨР эх сурвалж — тэр нь 807
  //    хэсгийг НЭГТГЭСЭН ганц полигон, атрибутгүй тул бүс тус бүрийн ногоон
  //    талбай тэндээс бодогдохгүй. Тиймээс ТООЦООНД зориулсан тусдаа
  //    үйлчилгээ: нэрийн ард `_analysis` гэж ялгасан.
  // ⚠️ 2026-08-24: monmap-ын `nogoon_baiguulamj`-аас MUST-ын
  //    `nogoon_baiguulamj_analysis`/118 руу шилжив. Обьект 807 = 807, талбай
  //    55 га = 55 га, `RefName_12`/`Angilal`/`Area_hec` талбар бүрэн адил.
  const GREEN_DATA_URL =
    'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services/nogoon_baiguulamj_analysis/FeatureServer/118';
  const green = await fetchAll(GREEN_DATA_URL, ['RefName_12', 'Shape__Area'], true);

  onProgress(tr('Нийтийн тээврийн зогсоол…'), 50);
  const [bus, lrt] = await Promise.all([
    fetchAll(url(SRC.busStops), ['OBJECTID'], true).catch(() => [] as Feat[]),
    fetchAll(url(SRC.lrtStops), ['OBJECTID'], true).catch(() => [] as Feat[]),
  ]);

  onProgress(tr('Инженерийн дэд бүтэц…'), 72);
  const engResults = await Promise.all(
    ENGINEERING_IDS.map((id) => fetchAll(url(id), ['OBJECTID'], true).catch(() => [] as Feat[])),
  );

  onProgress(tr('Орон зайн үзүүлэлт…'), 84);

  const stopGeoms = [...bus, ...lrt].map((f) => f.geometry).filter(Boolean) as GeomArg[];
  const engGeoms = engResults.flat().map((f) => f.geometry).filter(Boolean) as GeomArg[];

  // ⚠️ Нэгтгэсэн (union) геометр — эс бөгөөс бүс бүрд 4,000+ шугам тус бүрээр
  //    зай бодох болж, 52 × 4,000 = 200,000 тооцоо явна.
  //    async хувилбар (2026-08-21 гүйцэтгэлийн аудит): 4,000+ хэсгийн union нь
  //    синхроноор main thread-ийг хэдэн секунд царцаадаг байв — worker-т бодно.
  //    (Хоёр union зэрэг — нэг нь нөгөөгөө хүлээхгүй.)
  const greenGeoms = green.map((f) => f.geometry).filter(Boolean) as GeomArg[];
  const [engUnion, greenUnion] = await Promise.all([
    engGeoms.length ? geometryEngineAsync.union(engGeoms) : Promise.resolve(null),
    /**
     * ⚠️ Ногоон байгууламжийн НЭГТГЭСЭН геометр — «нөлөөллийн бүс» аргад.
     * 807 полигон тус бүрээр зай бодвол 368 × 807 = 297,000 тооцоо явна.
     */
    greenGeoms.length ? geometryEngineAsync.union(greenGeoms) : Promise.resolve(null),
  ]);

  /* ── Ногоон байгууламжийг бүс + ангиллаар ── */
  const zoneIds = new Set(zoneFeats.map((f) => zoneCanon(f.attributes[Z.id])));
  const greenByZone = new Map<string, Record<string, number>>();
  const greenCats = new Set<string>();
  for (const f of green) {
    const a = f.attributes;
    const zid = resolveZoneId(a.RefName_12, zoneIds);
    if (!zid) continue;
    // ⚠️ Ангилалгүй эх сурвалж — бүгд `GREEN_CATEGORIES`-ийн ганц түлхүүрт нэгдэнэ
    //    (ЯГ таарах ёстой, эс бөгөөс `computeRaw`-ын `activeGreen` шүүлт 0 болгоно).
    //    `tr()` ХЭРЭГЛЭХГҮЙ: `defaultGreenCats()` орчуулгагүй түүхий key өгдөг тул
    //    EN хэлэнд tr()-тэй түлхүүр («Green space») таарахгүй, бүх бүсийн ногоон
    //    0 болдог байв. Энэ түлхүүр дэлгэцэд хэзээ ч гардаггүй — нэр нь `short`-оос.
    const cat = GREEN_CATEGORIES[0].key;
    greenCats.add(cat);
    const bucket = greenByZone.get(zid) ?? {};
    bucket[cat] = (bucket[cat] ?? 0) + n(a.Shape__Area);
    greenByZone.set(zid, bucket);
  }

  /* ── Бүс бүрийн бичлэг ── */
  const zones: Zone[] = zoneFeats.map((f) => {
    const a = f.attributes;
    const id = zoneCanon(a[Z.id]);
    const geom = (f.geometry ?? null) as Polygon | null;

    // ТАЛБАЙ — `Area` (га) нь бүсийн албан ёсны, зам/нийтийн эзэмшил хассан
    // цэвэр талбай. Санхүүд энэ, нягтшилд полигоны БОДИТ талбай хэрэглэнэ:
    // хүн ам бүсийн бүтэн газар нутаг дээр амьдардаг.
    const areaHa = n(a[Z.areaHa]) > 0 ? n(a[Z.areaHa]) : n(a.Shape__Area) / 10_000;
    const polyHa = n(a.Shape__Area) > 0 ? n(a.Shape__Area) / 10_000 : areaHa;

    // ⚠️ `FAR` талбар 52 бүсийн 22-т ЭВДЭРСЭН: утга таслагдаж 1.15-ын оронд
    //    0.01, 8.43-ын оронд 0.08 гэж бичигджээ. `FAR_HUVI` (хувиар) нь бүрэн
    //    бүтэн бөгөөд `BAR_M2/GAZAR_M2`-тай 43/52 бүст таарна — тиймээс
    //    `FAR_HUVI ÷ 100`-г ЗАСВАРЛАСАН утга болгон шууд ашиглана.
    const zoneFar = a[Z.farPct] != null ? n(a[Z.farPct]) / 100 : (a[Z.far] != null ? n(a[Z.far]) : null);
    // BCR нь эзлэх ХЭСЭГ (0–0.5) тул ×100 хийж хувь болгоно
    const zoneBcr = a[Z.bcr] != null ? n(a[Z.bcr]) * 100 : null;

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
      // ⚠️ Шинэ бүсийн давхаргад ЗӨВХӨН төлөвлөсөн зогсоол (ил/далд) бий —
      //    «одоо байгаа» (ET_NIIT) талбар байхгүй тул нийлбэрийг өөрсдөө угсарна.
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
  };
}

/**
 * Барилга бүрийн ТӨВ ЦЭГ + шинжилгээнд хэрэгтэй атрибут.
 *
 * ⚠️ Төв цэггүй бичлэгийг алгасна — зайн тооцоонд оруулах боломжгүй.
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
      oid: n(a.OBJECTID),
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
 *
 * ⚠️ Бодитоор БАЙГАА бүлгийг л буцаана — хоосон мөр жагсаалтыг сунгаад
 * «энэ төрлийн барилга байхгүй» гэдгийг тоогоор нь давхар хэлэхгүй.
 * Эрэмбэ нь тоогоор буурах, «Бусад» ямагт СҮҮЛД (үлдэгдлийн бүлэг).
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
    b.pop += n(a[BF.population]) + n(a[BF.capacity]);
    if (raw) b.values.add(raw); else b.blank = true;
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
 *
 * ⚠️ `ZONE_ID` талбараар БИШ, барилгын ТӨВ ЦЭГ аль бүсийн дотор байгаагаар.
 * Эх өгөгдөлд 19 барилгын `ZONE_ID` хоосон бөгөөд 6 барилгынх нь бодит
 * байршилтайгаа зөрдөг. Талбараар бодвол 71,048 м² шалны талбай унаж, бүсийн
 * FAR/BCR, нягтшил бүгд дутуу гарна.
 *
 * ⚠️ Төв цэгээр авснаар барилга ЯГ НЭГ бүсэд ороод, зааг дээрх барилга давхар
 * тоологдохгүй — бүсүүдийн нийлбэр эх өгөгдөлтэй яг тэнцэнэ.
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
    // ⚠️ Оноосон бүсийг бичлэг дээр нь ТЭМДЭГЛЭНЭ: нийгмийн хүртээмжийг бүсийн
    //    ОРОН СУУЦНЫ барилгуудаар бодох тул тэр холбоо дараа хэрэгтэй.
    a._zone = hit.id;

    const b = byZone.get(hit.id) ?? emptyAgg();
    // ⚠️ ЭХ ТАЛБАРУУДААС шууд: `Population` = оршин суугч, `Huchin_chadal` =
    //    хүчин чадал. Урьд нь `Total_population`-ыг зориулалтын regex-ээр
    //    хуваадаг байсныг орлов (тоо ижил, ангилал нь эх өгөгдлийнх болов).
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
 *
 * ⚠️ БАРИЛГЫН түвшинд хэмжинэ, бүсийн полигоноос БИШ. Полигоноос зай бодвол том
 * бүсийн нэг булан хүрээнд орсон л бол бүхэлдээ «хүртээмжтэй» гэж тоологдоно —
 * хэдэн га бүсэд энэ нь бүтэн худал болно.
 *
 * ⚠️ Оршин суугчгүй бүсэд утга ГАРАХГҮЙ (null): үйлчилгээ, оффисын бүсэд
 * «сургууль хүрэхгүй байна» гэж дүгнэх нь утгагүй. `0%` гэж бичвэл тэр бүс
 * оноололд ХУДЛАА торох болно.
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

/* ⚠️ 2026-08-24: `computeEconomics` УСТГАГДАВ. Дэд бүтцийн зардлыг
   ЗОХИОМОЛ `negj_une` (нэгж үнэ) талбараас бодож, түүн дээрээ ашиг/маржин
   тооцдог байсан. Эзэмшигчийн шийдвэрээр эдийн засгийн загвар бүрмөсөн
   хасагдсан — бүсийн оноо одоо ЗӨВХӨН хот төлөвлөлтийн нормоор бодогдоно. */

/** Зогсоолын хэрэгцээг сонгосон аргаар */
export function parkingNeedOf(z: Zone, p: ParkingOpt): number | null {
  switch (p.source) {
    case 'households': return z.households > 0 ? z.households * p.perHousehold : null;
    case 'population': return z.population > 0 ? (z.population * p.per1000) / 1000 : null;
    default: return z.normParking > 0 ? z.normParking : null;
  }
}

/**
 * Сонгосон ногоон ангилал / зогсоолын аргаас хамаарч ТҮҮХИЙ үзүүлэлтийг дахин бодно.
 * (Жин өөрчлөгдөхөд энэ дахин ажиллах шаардлагагүй — зөвхөн оноолт л дахин бодогдоно.)
 */
export function computeRaw(
  zones: Zone[],
  activeGreen: Set<string>,
  parking: ParkingOpt,
  // «Бүсийн ангилал» картаас гараар идэвхжүүлсэн (хасагдсан) ангиллууд — оноолд оруулна
  scoreTypes?: Set<string>,
) {
  for (const z of zones) {
    /**
     * ⚠️ НОГООН ТАЛБАЙГ БҮХ БҮСЭД бодно — оноололоос хассан бүсэд ч.
     *
     * Урьд нь энэ мөр хасалтын доор байсан тул «Ногоон байгууламж, тохижилт»
     * ангилалтай 10 бүсийн 16.1 га ногоон нь `greenM2 = 0` болж, төслийн ногоон
     * 54 га-гийн оронд 36 га гэж харагддаг байв — яг ногоон байгууламжийн бүсийн
     * ногоон нь тоологдохгүй байсан нь илт буруу.
     *
     * ⚠️ ОНООЛОЛТ хэвээр хасагдана: `raw` хоосон үлдэх тул тэр бүс саараар
     * харагдаж, эрэмбэ/дундажид орохгүй. Энд зөвхөн НЭГТГЭЛ бодогдоно.
     */
    z.greenM2 = Object.entries(z.greenByCat)
      .filter(([cat]) => activeGreen.has(cat))
      .reduce((a, [, v]) => a + v, 0);

    // Оноололд орохгүй бүс — түүхий үзүүлэлт бодохгүй (raw хоосон → оноо null → саарал).
    // Гараар идэвхжүүлсэн ангилал бол ХАСАХГҮЙ (доор бодогдоно).
    if (z.excluded && !scoreTypes?.has(z.type)) { z.raw = {}; z.rawActual = {}; continue; }

    z.parkingSupply = z.etNiit;
    z.parkingNeed = parkingNeedOf(z, parking);
    z.parkingGap = z.parkingNeed == null ? null : z.parkingSupply - z.parkingNeed;

    z.raw = {
      // ⚠️ FAR/BCR нь 0 бол «норм хангасан» БИШ: барилгажилт төлөвлөөгүй гэсэн үг
      //    тул ӨГӨГДӨЛГҮЙ гэж үзэн оноололтоос хасна.
      far: z.zoneFar && z.zoneFar > 0 ? z.zoneFar : null,
      bcr: z.zoneBcr && z.zoneBcr > 0 ? z.zoneBcr : null,
      parking: z.parkingNeed && z.parkingNeed > 0 ? (z.parkingSupply / z.parkingNeed) * 100 : null,
      /**
       * НОГООН — ХОЁР ТУСДАА үзүүлэлт, нягтшилтай ЯГ ижил хос:
       *   · `green`    — нэг ОРШИН СУУГЧид ногдох м² (БНБД 8.2, жинтэй)
       *   · `greenCap` — нэг ХҮЧИН ЧАДАЛД ногдох м² (лавлагаа, жингүй)
       *
       * ⚠️ Хуваарийг НИЙЛҮҮЛЖ БОЛОХГҮЙ (`z.population`): сургуулийн сурагч
       * ойролцоох орон сууцны оршин суугчтай давхардаж тоологдох тул нэг хүнд
       * ногдох ногоон хиймлээр буурна.
       *
       * ⚠️ Хоёуланг нь ЖИНЛЭВЭЛ нэг ногоон талбай оноонд ХОЁР удаа тоологдоно —
       * тиймээс `greenCap` нь `ref` (оноололд орохгүй).
       */
      green: z.residentPop > 0 ? z.greenM2 / z.residentPop : null,
      greenCap: z.capacityPop > 0 ? z.greenM2 / z.capacityPop : null,
      /**
       * НЯГТШИЛ — ХОЁР ТУСДАА үзүүлэлт (хэрэглэгчийн шийдвэр, 2026-08-12).
       *
       * ⚠️ Хоёрыг НИЙЛҮҮЛЖ БОЛОХГҮЙ: сургуулийн суудал зэрэг хүчин чадал нь
       * ойролцоох орон сууцны оршин суугчтай ДАВХАРДДАГ (сурагч гэртээ ч,
       * сургууль дээрээ ч тоологддог) тул нийлбэр нь бодит ачааллыг хөөрөгдөнө.
       *
       * ⚠️ Зөвхөн оршин суугчаар бодвол орон сууцгүй атлаа барилгатай 27 бүс
       * «өгөгдөлгүй» болж саарлаар харагддаг байсан — тэрхүү хоосон зайг
       * `densityCap` нөхнө (жин нь 0 тул оноог хөндөхгүй).
       */
      density: z.polyHa > 0 && z.residentPop > 0 ? z.residentPop / z.polyHa : null,
      densityCap: z.polyHa > 0 && z.capacityPop > 0 ? z.capacityPop / z.polyHa : null,
      // ⚠️ `transit` үзүүлэлт ОНООЛОЛООС хасагдсан (`INDICATORS`-ыг үз) ч түүхий
      //    утгыг нь үлдээв: буцаахад ганц мөр (үзүүлэлтийн тодорхойлолт) л хэрэгтэй.
      transit: z.transitM,
      engineering: z.engDistM,
      social: z.social?.score ?? null,
    };

    /* ── ТҮР дүгнэлт ── `ASSUME_MET` дэх үзүүлэлтийг «норм хангасан» болгоно.
       ⚠️ Бодит утгыг УСТГАХГҮЙ — `rawActual`-д бүтнээрээ үлдэнэ. Өгөгдөлгүй
       (`null`) бүсэд ч хангасан гэж үзнэ: зорилго нь тэр үзүүлэлтийг оноололд
       нөлөөлүүлэхгүй байх (эс бөгөөс жин нь дахин хуваарилагдаж, өөр
       үзүүлэлтийн эзлэх хувийг чимээгүй өсгөнө). */
    z.rawActual = z.raw;
    const assumed = Object.entries(ASSUME_MET);
    if (assumed.length) {
      z.raw = { ...z.raw };
      for (const [id, v] of assumed) z.raw[id] = v;
    }
  }
}

/** Барилгын давамгайлах нэгж үнэ (₮/м²) — гулсуурын анхны утга */

/** Анхдагчаар идэвхтэй ногоон ангиллууд */
export const defaultGreenCats = () =>
  new Set(GREEN_CATEGORIES.filter((c) => c.default).map((c) => c.key));
