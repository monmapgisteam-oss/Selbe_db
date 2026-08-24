/**
 * БАРИЛГЫН ЦЭГҮҮД — тээвэр-идэвхийн шинжилгээний эх өгөгдөл.
 *
 * ⚠️ `transport.ts` (lib/analysis) нь ЦЭВЭР математик — ангилал ба коэффициент;
 * энэ файл нь түүнд ӨГӨГДӨЛ бэлтгэнэ: ArcGIS-ийн `et:24` «Барилга» давхаргаас
 * атрибут + ЦЕНТРОИД татаж, барилга бүрийн оргил цагийн зорчилтыг бодно.
 *
 * ⚠️ ТӨВ ЦЭГ ба ПОЛИГОН хоёулаа НЭГ хүсэлтээр ирнэ: төв цэгээр замд хуваарилж,
 * полигоноор газрын зурагт буддаг. `maxAllowableOffset=1` ерөнхийлөлттэйгээр
 * 363 барилга 98 кБ — түүхий полигоны 175 кБ-аас хямд, харагдацын ялгаагүй.
 *
 * ⚠️ `outSR=3857` (Web Mercator) — `roadNet.ts`-ийн замын сүлжээ ба `SuitMap`-ийн
 * 2D харагдацтай НЭГ координатын систем. Зайг метр болгоход `WM_UNITS_PER_M`.
 */

import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { agsToken } from '@/lib/agsToken';
import { t as tr } from '@/lib/i18nCore';
import {
  TRANSPORT_FIELDS, classifyBuilding, buildingTrips, vehicleTrips,
  type BuildingCat,
} from '@/lib/analysis/transport';

/** Каталог дахь эх давхарга — «Барилга» (`Selbe_ET_20260721`/24) */
const BUILDING_LAYER_ID = 'et:24';

/** Нэг хүсэлтэд авах бичлэгийн тоо (үйлчилгээний `maxRecordCount` = 2000) */
const PAGE = 2000;

/** Нэг барилга — ангилал, хүн ам/багтаамж, зорчилт ба Web Mercator төв цэг. */
export type BuildingPt = {
  oid: number;
  /** `Зориулалт_m` — түүхий утга (tooltip, шалгалтад) */
  purpose: string;
  cat: BuildingCat;
  /** ⚠️ ЗӨВХӨН орон сууцны барилгад утгатай */
  population: number;
  /** ⚠️ ЗӨВХӨН орон сууц БУС барилгад утгатай */
  capacity: number;
  /** Өглөөний оргил цагийн ХҮН-зорчилт */
  trips: number;
  /** Түүнээс гарах МАШИН-зорчилт (`MODE_SPLIT.car` ÷ `CAR_OCCUPANCY`) */
  vehTrips: number;
  /** Төв цэг, Web Mercator (EPSG:3857) */
  x: number;
  y: number;
  /** Полигоны цагиргууд, Web Mercator — газрын зурагт будахад */
  rings: number[][][];
  zone: string | null;
  block: number | null;
};

type QueryResp = {
  features?: {
    attributes?: Record<string, unknown>;
    centroid?: { x: number; y: number };
    geometry?: { rings?: number[][][] };
  }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

const F = TRANSPORT_FIELDS;

const pageQuery = (offset: number) => new URLSearchParams({
  where: '1=1',
  outFields: [F.purpose, F.population, F.capacity, F.zone, F.block].join(','),
  returnGeometry: 'true',
  // ⚠️ Төв цэг нь `features[].centroid`-д ТУСДАА ирнэ (`geometry` дотор БИШ)
  returnCentroid: 'true',
  // Ерөнхийлөлт — 175 кБ → 98 кБ, барилгын хэлбэр нүдэнд ижил
  maxAllowableOffset: '1',
  geometryPrecision: '1',
  outSR: '3857',
  resultOffset: String(offset),
  resultRecordCount: String(PAGE),
  f: 'json',
});

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * «Барилга» давхаргыг татаж, барилга бүрийн зорчилтыг бодно.
 *
 * ⚠️ ТӨВ ЦЭГГҮЙ бичлэгийг ХАЯНА: замд хуваарилах боломжгүй тул шинжилгээнд
 * хэрэггүй бөгөөд (0, 0) координаттай орвол сүлжээнээс хэдэн мянган км зайд
 * унаж, «замд холбогдоогүй» тоог худал өсгөнө.
 */
export async function loadBuildings(signal?: AbortSignal): Promise<BuildingPt[]> {
  const def = LAYER_BY_ID[BUILDING_LAYER_ID];
  if (!def) throw new Error(tr('Барилгын давхарга каталогт алга: {0}', BUILDING_LAYER_ID));
  const url = layerUrl(def);

  // ⚠️ 2026-08-24 «Organization» хуваалцалт — нэвтэрсэн бол token нэмнэ (нэг л удаа)
  const tok = await agsToken();
  const auth = tok ? `&token=${encodeURIComponent(tok)}` : '';

  const out: BuildingPt[] = [];
  // ⚠️ 363 барилга нэг хуудсанд багтдаг ч давхарга өсөж болно — `exceededTransferLimit`
  //    дуустал үргэлжлүүлнэ (хязгааргүй давталтаас хамгаалж 20 хуудсаар таслав).
  for (let page = 0; page < 20; page++) {
    const r: QueryResp = await fetch(`${url}/query?${pageQuery(page * PAGE)}${auth}`, { signal })
      .then((x) => x.json());
    if (r.error) throw new Error(r.error.message ?? tr('ArcGIS query алдаа'));

    for (const f of r.features ?? []) {
      const c = f.centroid;
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
      const a = f.attributes ?? {};
      const purpose = String(a[F.purpose] ?? '').trim();
      const cat = classifyBuilding(purpose);
      const population = num(a[F.population]);
      const capacity = num(a[F.capacity]);
      const trips = buildingTrips(cat, population, capacity);
      out.push({
        oid: num(a.OBJECTID),
        purpose,
        cat,
        population,
        capacity,
        trips,
        vehTrips: vehicleTrips(trips),
        x: c.x,
        y: c.y,
        rings: f.geometry?.rings ?? [],
        zone: a[F.zone] == null ? null : String(a[F.zone]),
        block: a[F.block] == null ? null : num(a[F.block]),
      });
    }
    if (!r.exceededTransferLimit) break;
  }
  return out;
}

/* ══════════════════ Кэш ══════════════════ */

let cache: Promise<BuildingPt[]> | null = null;

/**
 * Барилгуудыг НЭГ УДАА татаж кэшлэнэ (симуляцын горим сэлгэх бүрд дахин татахгүй).
 * ⚠️ Алдаа гарвал кэшийг цэвэрлэнэ — эс бөгөөс түр зуурын сүлжээний саатал
 * бүхэл сессийн турш «өгөгдөлгүй» болж хатна.
 */
export function loadBuildingsCached(): Promise<BuildingPt[]> {
  if (!cache) {
    cache = loadBuildings().catch((e) => { cache = null; throw e; });
  }
  return cache;
}
