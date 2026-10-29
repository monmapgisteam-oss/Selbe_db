/**
 * БАРИЛГЫН ЦЭГҮҮД — тээвэр-идэвхийн шинжилгээний эх өгөгдөл.
 */

import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { arcgisPost } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import {
  TRANSPORT_FIELDS, classifyBuilding, buildingTrips, vehicleTrips,
  type BuildingCat,
} from '@/lib/analysis/transport';

/** Каталог дахь эх давхарга — «Барилга» (нэгтгэсэн `data`/108; `layerUrl()` шийднэ) */
const BUILDING_LAYER_ID = 'et:24';

/** Нэг хүсэлтэд авах бичлэгийн тоо (үйлчилгээний `maxRecordCount` = 2000) */
const PAGE = 2000;

/** Нэг барилга — ангилал, хүн ам/багтаамж, зорчилт ба Web Mercator төв цэг. */
export type BuildingPt = {
  oid: number;
  /** `Зориулалт_m` — түүхий утга (tooltip, шалгалтад) */
  purpose: string;
  cat: BuildingCat;
  population: number;
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
  returnCentroid: 'true',
  // Ерөнхийлөлт — 175 кБ → 98 кБ, барилгын хэлбэр нүдэнд ижил
  maxAllowableOffset: '1',
  geometryPrecision: '1',
  outSR: '3857',
  /*
   * ArcGIS нь `orderByFields`-гүй үед мөрийн дарааллыг БАТАЛГААЖУУЛДАГГҮЙ:
   * хуудасны зааг дээр нэг барилга ХОЁР удаа ирэх, эсвэл огт УНАХ
   * боломжтой — тэгэхдээ алдаа гарахгүй тул чимээгүй болно. Барилга
   * давхардвал хүн ам, багтаамж, аяллын тоо ХӨӨРӨГДӨЖ тохиромжтой
   * байдлын үнэлгээ бүхэлдээ худал болно; унавал эсрэгээр.
   */
  orderByFields: 'objectid ASC',
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
 */
export async function loadBuildings(signal?: AbortSignal): Promise<BuildingPt[]> {
  const def = LAYER_BY_ID[BUILDING_LAYER_ID];
  if (!def) throw new Error(tr('Барилгын давхарга каталогт алга: {0}', BUILDING_LAYER_ID));
  const url = layerUrl(def);

  const out: BuildingPt[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const r = await arcgisPost<QueryResp>(`${url}/query`, Object.fromEntries(pageQuery(offset)), { signal });
    if (r.error) throw new Error(r.error.message ?? tr('ArcGIS query алдаа'));
    const got = r.features?.length ?? 0;
    offset += got;

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
        oid: num(a.objectid),
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
    if (!r.exceededTransferLimit || got === 0) break;
  }
  return out;
}

/* ══════════════════ Кэш ══════════════════ */

let cache: Promise<BuildingPt[]> | null = null;

/**
 * Барилгуудыг НЭГ УДАА татаж кэшлэнэ (симуляцын горим сэлгэх бүрд дахин татахгүй).
 */
export function loadBuildingsCached(): Promise<BuildingPt[]> {
  if (!cache) {
    cache = loadBuildings().catch((e) => { cache = null; throw e; });
  }
  return cache;
}
