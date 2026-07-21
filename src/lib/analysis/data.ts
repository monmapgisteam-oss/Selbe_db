'use client';

/**
 * АНАЛИЗ — өгөгдөл татах, бүс тус бүрээр нэгтгэх давхарга.
 *
 * Бүх орон зайн тооцоо UTM 48N (метр) дээр ПЛАНАРААР хийгдэнэ — геодезик
 * тооцоо энэ хэмжээний талбайд ялгаа өгөхгүй бөгөөд хамаагүй удаан.
 *
 * ⚠️ Энэ модуль ГЕОМЕТР татдаг цорын ганц газар. Тоо, өртгийг `lib/totals.ts`
 * сервер тал дээр бодуулдаг; энд зөвхөн орон зайн харьцаа (зай, огтлолцол,
 * агуулагдал) шаардсан зүйлийг л татна.
 */

import Query from '@arcgis/core/rest/support/Query';
import * as query from '@arcgis/core/rest/query';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import type Geometry from '@arcgis/core/geometry/Geometry';
import type Polygon from '@arcgis/core/geometry/Polygon';
import { layerUrl, LAYER_BY_ID } from '@/lib/services';
import {
  WKID, SRC, ENGINEERING_IDS, SOCIAL_FACILITIES, GREEN_CATEGORIES,
  BF, isResidential, isSellable,
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
  for (let start = 0; ; start += PAGE) {
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
  }
  return out;
}

/* ══════════════════ Бүсийн бичлэг ══════════════════ */

export type Zone = {
  id: string;
  type: string;
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
  gfaSaleM2: number;
  salesValue: number;
  salesValueRes: number;
  usableM2: number;

  greenByCat: Record<string, number>;
  greenM2: number;

  /* Орон зайн түүхий утга */
  transitM: number | null;
  parkPct: number | null;
  engDistM: number | null;
  social: SocialResult | null;

  parkingSupply: number;
  parkingNeed: number | null;
  parkingGap: number | null;

  econ: Econ | null;
  raw: Record<string, number | null>;
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

export type Econ = {
  /** Дэд бүтцийн зардал = 1 га-гийн төсөв × бүсийн талбай */
  infraCost: number;
  /** Барилга угсралтын зардал = борлуулах нийт талбай × 1 м² жишиг өртөг */
  buildCost: number;
  /** Нийт зардал */
  cost: number;
  revenue: number;
  revenueRes: number;
  profit: number;
  /**
   * АШГИЙН МАРЖА (%) = ашиг ÷ орлого × 100 — эдийн засгийн ОНОО үүн дээр тогтоно.
   * ⚠️ Орлогогүй мөртлөө зардалтай бол `-Infinity` = цэвэр алдагдал.
   * Зардал ч орлого ч байхгүй бол `null` = өгөгдөлгүй.
   */
  margin: number | null;
  /** Зардлын эзлэх хувь — зөвхөн ХАРУУЛАХАД (оноололд ордоггүй) */
  costShare: number | null;
  roi: number | null;
};

export type AnalysisData = {
  zones: Zone[];
  /** Ногоон байгууламжийн `Layer` талбарт бодитоор байсан ангиллууд */
  greenCats: string[];
};

/* ══════════════════ Ачаалалт ══════════════════ */

export type Progress = (msg: string, pct: number) => void;

/**
 * Ногоон байгууламжийн `ZONE_ID_1` → бүсийн `ZONE_ID` тааруулах.
 * «Багц-2.1» гэх мэт дэд дугаарыг эцэг бүс рүү нь буулгана.
 */
function resolveZoneId(raw: unknown, ids: Set<string>): string | null {
  const id = String(raw ?? '').trim();
  if (!id) return null;
  if (ids.has(id)) return id;
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
  onProgress('Бүсийн мэдээлэл…', 6);
  const zoneFeats = await fetchAll(url(SRC.zones), [
    'ZONE_ID', 'TOROL', 'Area', 'Shape__Area', 'FAR', 'FAR_HUVI', 'BCR',
    'NORM_ZOGS', 'ET_IL', 'ET_DALD', 'ET_NIIT',
  ], true);

  onProgress('Барилга байгууламж…', 22);
  const buildings = await fetchAll(url(SRC.buildings), [
    'OBJECTID', 'ZONE_ID', BF.population, BF.households, BF.status,
    BF.gfa, BF.usable, BF.purpose, BF.price,
  ], true);

  onProgress('Ногоон байгууламж…', 38);
  const green = await fetchAll(url(SRC.green), ['ZONE_ID_1', 'Layer', 'Shape__Area', 'Area_hec']);

  onProgress('Нийтийн тээврийн зогсоол…', 50);
  const [bus, lrt] = await Promise.all([
    fetchAll(url(SRC.busStops), ['OBJECTID'], true).catch(() => [] as Feat[]),
    fetchAll(url(SRC.lrtStops), ['OBJECTID'], true).catch(() => [] as Feat[]),
  ]);

  onProgress('Алхалтын бүс…', 60);
  const parkWalk = await fetchAll(url(SRC.parkWalk), ['OBJECTID'], true).catch(() => [] as Feat[]);

  onProgress('Инженерийн дэд бүтэц…', 72);
  const engResults = await Promise.all(
    ENGINEERING_IDS.map((id) => fetchAll(url(id), ['OBJECTID'], true).catch(() => [] as Feat[])),
  );

  onProgress('Орон зайн үзүүлэлт…', 84);

  const stopGeoms = [...bus, ...lrt].map((f) => f.geometry).filter(Boolean) as Geometry[];
  const parkGeoms = parkWalk.map((f) => f.geometry).filter(Boolean) as Geometry[];
  const engGeoms = engResults.flat().map((f) => f.geometry).filter(Boolean) as Geometry[];

  // ⚠️ Нэгтгэсэн (union) геометр — эс бөгөөс бүс бүрд 4,000+ шугам тус бүрээр
  //    зай бодох болж, 52 × 4,000 = 200,000 тооцоо явна.
  const parkUnion = parkGeoms.length ? geometryEngine.union(parkGeoms) : null;
  const engUnion = engGeoms.length ? geometryEngine.union(engGeoms) : null;

  /* ── Ногоон байгууламжийг бүс + ангиллаар ── */
  const zoneIds = new Set(zoneFeats.map((f) => String(f.attributes.ZONE_ID ?? '').trim()));
  const greenByZone = new Map<string, Record<string, number>>();
  const greenCats = new Set<string>();
  for (const f of green) {
    const a = f.attributes;
    const zid = resolveZoneId(a.ZONE_ID_1, zoneIds);
    if (!zid) continue;
    const cat = String(a.Layer ?? 'Тодорхойгүй').trim();
    greenCats.add(cat);
    const bucket = greenByZone.get(zid) ?? {};
    bucket[cat] = (bucket[cat] ?? 0) + (n(a.Shape__Area) || n(a.Area_hec) * 10_000);
    greenByZone.set(zid, bucket);
  }

  /* ── Бүс бүрийн бичлэг ── */
  const zones: Zone[] = zoneFeats.map((f) => {
    const a = f.attributes;
    const id = String(a.ZONE_ID ?? '').trim();
    const geom = (f.geometry ?? null) as Polygon | null;

    // ТАЛБАЙ — `Area` (га) нь бүсийн албан ёсны, зам/нийтийн эзэмшил хассан
    // цэвэр талбай. Санхүүд энэ, нягтшилд полигоны БОДИТ талбай хэрэглэнэ:
    // хүн ам бүсийн бүтэн газар нутаг дээр амьдардаг.
    const areaHa = n(a.Area) > 0 ? n(a.Area) : n(a.Shape__Area) / 10_000;
    const polyHa = n(a.Shape__Area) > 0 ? n(a.Shape__Area) / 10_000 : areaHa;

    // ⚠️ `FAR` талбар 52 бүсийн 22-т ЭВДЭРСЭН: утга таслагдаж 1.15-ын оронд
    //    0.01, 8.43-ын оронд 0.08 гэж бичигджээ. `FAR_HUVI` (хувиар) нь бүрэн
    //    бүтэн бөгөөд `BAR_M2/GAZAR_M2`-тай 43/52 бүст таарна — тиймээс
    //    `FAR_HUVI ÷ 100`-г ЗАСВАРЛАСАН утга болгон шууд ашиглана.
    const zoneFar = a.FAR_HUVI != null ? n(a.FAR_HUVI) / 100 : (a.FAR != null ? n(a.FAR) : null);
    // BCR нь эзлэх ХЭСЭГ (0–0.5) тул ×100 хийж хувь болгоно
    const zoneBcr = a.BCR != null ? n(a.BCR) * 100 : null;

    let transitM: number | null = null;
    if (geom && stopGeoms.length) {
      transitM = Math.min(...stopGeoms.map((g) => geometryEngine.distance(geom, g, 'meters')));
    }

    let parkPct: number | null = null;
    if (geom && parkUnion) {
      const inter = geometryEngine.intersect(geom, parkUnion);
      const ia = inter ? Math.abs(geometryEngine.planarArea(inter as Polygon, 'square-meters')) : 0;
      const za = Math.abs(geometryEngine.planarArea(geom, 'square-meters')) || polyHa * 10_000;
      parkPct = za > 0 ? (ia / za) * 100 : null;
    }

    const engDistM = geom && engUnion ? geometryEngine.distance(geom, engUnion, 'meters') : null;

    return {
      id,
      type: String(a.TOROL ?? '—').trim() || '—',
      geometry: geom,
      areaHa, polyHa, zoneFar, zoneBcr,
      normParking: n(a.NORM_ZOGS),
      etIl: n(a.ET_IL), etDald: n(a.ET_DALD), etNiit: n(a.ET_NIIT),
      ...emptyAgg(),
      greenByCat: greenByZone.get(id) ?? {},
      greenM2: 0,
      transitM, parkPct, engDistM,
      social: null,
      parkingSupply: 0, parkingNeed: null, parkingGap: null,
      econ: null,
      raw: {},
    };
  });

  aggregateBuildings(zones, buildings);

  onProgress('Нийгмийн дэд бүтцийн хүртээмж…', 93);
  computeSocialAccess(zones, buildings);

  onProgress('Бэлэн', 100);

  return { zones, greenCats: [...greenCats].sort() };
}

/* ══════════════════ Барилгын нэгтгэлт ══════════════════ */

function emptyAgg() {
  return {
    population: 0, residentPop: 0, capacityPop: 0,
    buildingCount: 0, households: 0,
    gfaM2: 0, gfaSaleM2: 0, usableM2: 0,
    salesValue: 0, salesValueRes: 0,
  };
}

/**
 * Барилгыг бүсэд оноож нэгтгэнэ — SELECT BY LOCATION.
 *
 * ⚠️ `ZONE_ID` талбараар БИШ, барилгын ТӨВ ЦЭГ аль бүсийн дотор байгаагаар.
 * Эх өгөгдөлд 19 барилгын `ZONE_ID` хоосон бөгөөд 6 барилгынх нь бодит
 * байршилтайгаа зөрдөг. Талбараар бодвол 71,048 м² унаж, худалдаалах өртөг
 * 334 тэрбум ₮-өөр дутуу гарна.
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
    const pop = n(a[BF.population]);
    const gfa = n(a[BF.gfa]);
    const res = isResidential(a[BF.purpose]);
    const sell = isSellable(a[BF.status]);
    const value = sell ? gfa * n(a[BF.price]) : 0;

    b.population += pop;
    if (res) b.residentPop += pop; else b.capacityPop += pop;
    b.gfaM2 += gfa;
    b.usableM2 += n(a[BF.usable]);
    if (sell) b.gfaSaleM2 += gfa;
    b.salesValue += value;
    if (res) b.salesValueRes += value;
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
function computeSocialAccess(zones: Zone[], buildings: Feat[]) {
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
 * Бүс бүрийн эдийн засгийн үзүүлэлт.
 *
 *   дэд бүтцийн зардал = 1 га-гийн төсөв × бүсийн талбай (га)
 *   барилгын зардал    = борлуулах нийт талбай × 1 м² БАРИГДАХ жишиг өртөг
 *   орлого             = борлуулах нийт талбай × 1 м² БОРЛУУЛАХ үнэ
 *
 * ⚠️ Барилгын зардлыг оруулах нь ЗААВАЛ. Урьд нь зөвхөн дэд бүтэц зардалд
 * ордог байсан тул ашиг 8.35 их наяд ₮ гэж боломжгүй өндөр гардаг байв —
 * барилгыг үнэгүй босгодог мэт.
 *
 * ⚠️ Хоёр талд НЭГ ижил талбай (`gfaSaleM2` = `Барилгын_нийт_талбай_m2`,
 * «Одоо байгаа» хасагдсан) ашиглана. Зардалд нийт талбай, орлогод ашигтай
 * талбай гэх мэтээр өөр авбал ашиг зохиомлоор өснө.
 */
export function computeEconomics(
  zones: Zone[],
  perHa: number,
  pricePerM2: number | null,
  buildCostPerM2: number,
) {
  for (const z of zones) {
    const infraCost = perHa * z.areaHa;
    const buildCost = z.gfaSaleM2 * buildCostPerM2;
    const cost = infraCost + buildCost;
    const revenue = pricePerM2 == null ? z.salesValue : z.gfaSaleM2 * pricePerM2;
    const revenueRes = pricePerM2 == null ? z.salesValueRes : 0;
    const profit = revenue - cost;
    z.econ = {
      infraCost, buildCost, cost, revenue, revenueRes, profit,
      // ⚠️ Орлогогүй мөртлөө зардалтай бүс нь «өгөгдөлгүй» БИШ, ЦЭВЭР АЛДАГДАЛ.
      //    `null` гэвэл оноололтоос хасагдаж, ашигтай бүстэй адил харагдана.
      margin: revenue > 0 ? (profit / revenue) * 100 : (cost > 0 ? -Infinity : null),
      costShare: revenue > 0 ? (cost / revenue) * 100 : (cost > 0 ? Infinity : null),
      roi: revenue > 0 && cost > 0 ? profit / cost : null,
    };
  }
}

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
export function computeRaw(zones: Zone[], activeGreen: Set<string>, parking: ParkingOpt) {
  for (const z of zones) {
    z.greenM2 = Object.entries(z.greenByCat)
      .filter(([cat]) => activeGreen.has(cat))
      .reduce((a, [, v]) => a + v, 0);

    z.parkingSupply = z.etNiit;
    z.parkingNeed = parkingNeedOf(z, parking);
    z.parkingGap = z.parkingNeed == null ? null : z.parkingSupply - z.parkingNeed;

    z.raw = {
      // ⚠️ FAR/BCR нь 0 бол «норм хангасан» БИШ: барилгажилт төлөвлөөгүй гэсэн үг
      //    тул ӨГӨГДӨЛГҮЙ гэж үзэн оноололтоос хасна.
      far: z.zoneFar && z.zoneFar > 0 ? z.zoneFar : null,
      bcr: z.zoneBcr && z.zoneBcr > 0 ? z.zoneBcr : null,
      parking: z.parkingNeed && z.parkingNeed > 0 ? (z.parkingSupply / z.parkingNeed) * 100 : null,
      // Нягтшил ба ногоон — ЗӨВХӨН оршин суугчаар (үйлчилгээний хүчин чадал орохгүй)
      green: z.residentPop > 0 ? z.greenM2 / z.residentPop : null,
      density: z.polyHa > 0 && z.residentPop > 0 ? z.residentPop / z.polyHa : null,
      transit: z.transitM,
      park: z.parkPct,
      engineering: z.engDistM,
      social: z.social?.score ?? null,
    };
  }
}

/** Барилгын давамгайлах нэгж үнэ (₮/м²) — гулсуурын анхны утга */
export function dominantPrice(zones: Zone[]): number {
  const total = zones.reduce((a, z) => a + z.gfaSaleM2, 0);
  const value = zones.reduce((a, z) => a + z.salesValue, 0);
  return total > 0 ? value / total : 0;
}

/** Анхдагчаар идэвхтэй ногоон ангиллууд */
export const defaultGreenCats = () =>
  new Set(GREEN_CATEGORIES.filter((c) => c.default).map((c) => c.key));
