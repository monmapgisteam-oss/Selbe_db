/**
 * АВТОБУСНЫ ХҮРТЭЭМЖ — буудал хүртэлх зай, үйлчилгээ дутмаг хүн ам, буудлын эрэлт.
 *
 * ⚠️ Зай нь ШУУД (Евклид) зай — гудамжаар алхах БОДИТ зам БИШ. Бодит алхалт
 * блокоор тойрдог тул энэ нь ҮРГЭЛЖ өөдрөг тал руугаа алдана; 400/800 м-ийн
 * босго (`transport.ts`) нь салбарын жишиг тул харьцуулалт хэвээр утгатай.
 *
 * ⚠️ `PopulationUnserved` нь ЗӨВХӨН ОРОН СУУЦНЫ хүн амыг тоолно — сургууль,
 * оффисын багтаамжийг «үйлчилгээгүй үлдсэн оршин суугч» гэж нэрлэх нь буруу
 * (тэд тэнд амьдардаггүй). `[[capacity-vs-population-fields]]`-ийн дүрэм.
 */

import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { agsToken } from '@/lib/agsToken';
import { t as tr } from '@/lib/i18nCore';
import { MODE_SPLIT, busBand, type BusBand } from '@/lib/analysis/transport';
import type { BuildingPt } from './buildings';

/** Каталог дахь эх давхарга — «Автобус_буудал» (`Selbe_ET_20260721`/2) */
const BUS_LAYER_ID = 'et:2';

/** Автобусны буудал — Web Mercator цэг */
export type BusStop = { oid: number; x: number; y: number };

type QueryResp = {
  features?: { attributes?: Record<string, unknown>; geometry?: { x: number; y: number } }[];
  error?: { message?: string };
};

/** Буудлуудыг Web Mercator цэг болгож татна (`buildings.ts`-тэй нэг систем). */
export async function loadBusStops(signal?: AbortSignal): Promise<BusStop[]> {
  const def = LAYER_BY_ID[BUS_LAYER_ID];
  if (!def) throw new Error(tr('Автобусны давхарга каталогт алга: {0}', BUS_LAYER_ID));

  const q = new URLSearchParams({
    where: '1=1', outFields: 'OBJECTID', returnGeometry: 'true',
    outSR: '3857', resultRecordCount: '2000', f: 'json',
  });
  // ⚠️ 2026-08-24 «Organization» хуваалцалт — нэвтэрсэн бол token нэмнэ
  const tok = await agsToken();
  const auth = tok ? `&token=${encodeURIComponent(tok)}` : '';
  const r: QueryResp = await fetch(`${layerUrl(def)}/query?${q}${auth}`, { signal }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message ?? tr('ArcGIS query алдаа'));

  const out: BusStop[] = [];
  for (const f of r.features ?? []) {
    const g = f.geometry;
    if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) continue;
    out.push({ oid: Number(f.attributes?.OBJECTID ?? 0), x: g.x, y: g.y });
  }
  return out;
}

let stopCache: Promise<BusStop[]> | null = null;

/** Буудлуудыг НЭГ УДАА татаж кэшлэнэ (`buildings.loadBuildingsCached`-тай ижил зарчим). */
export function loadBusStopsCached(): Promise<BusStop[]> {
  if (!stopCache) {
    stopCache = loadBusStops().catch((e) => { stopCache = null; throw e; });
  }
  return stopCache;
}

/* ══════════════════ Хүртээмжийн тооцоо ══════════════════ */

/** Нэг барилгын хүртээмж — ойрын буудал, зай, зурвас */
export type BuildingAccess = {
  /** Ойрын буудлын индекс (`stops` дотор); буудал огт байхгүй бол −1 */
  stop: number;
  /** Тэр буудал хүртэлх ШУУД зай, БОДИТ метр */
  distM: number;
  band: BusBand;
};

export type BusAccess = {
  /** Барилга бүрийн хүртээмж (индекс = `buildings`-ийн индекс) */
  access: BuildingAccess[];
  /** Зурвас бүрд ногдох ОРОН СУУЦНЫ хүн ам (good / ok / poor) */
  popByBand: Record<BusBand, number>;
  /** ⚠️ 800 м-ээс ХОЛ орон сууцны хүн ам — `popByBand.poor`-ын нэр томьёо */
  popUnserved: number;
  /** Буудал бүрийн эрэлт — ойрын барилгуудын зорчилт × нийтийн тээврийн хувь */
  stopDemand: Float64Array;
  /** Хамгийн ачаалалтай буудлын эрэлт (нормчилол, KPI) */
  maxStopDemand: number;
};

/**
 * Барилга бүрийг ХАМГИЙН ОЙРЫН буудалд оноож, хүртээмж ба эрэлтийг бодно.
 *
 * ⚠️ Буудлын эрэлтэд ЗАЙН босго тавихгүй: 800 м-ээс хол барилга ч тухайн буудлыг
 * л ашиглана (өөр сонголт байхгүй). Босго нь ХҮРТЭЭМЖИЙН чанарыг ангилахад л
 * хэрэглэгдэнэ — эрэлтийг таславал нийт зорчигчийн тоо алдагдана.
 */
export function busAccess(
  buildings: BuildingPt[],
  stops: BusStop[],
  unitsPerMeter: number,
): BusAccess {
  const access: BuildingAccess[] = new Array(buildings.length);
  const stopDemand = new Float64Array(stops.length);
  const popByBand: Record<BusBand, number> = { good: 0, ok: 0, poor: 0 };
  const upm = unitsPerMeter || 1;

  for (let b = 0; b < buildings.length; b++) {
    const bld = buildings[b];
    let bestI = -1;
    let bestD = Infinity;
    for (let s = 0; s < stops.length; s++) {
      const d = Math.hypot(bld.x - stops[s].x, bld.y - stops[s].y);
      if (d < bestD) { bestD = d; bestI = s; }
    }

    if (bestI < 0) {
      // Буудал огт байхгүй — бүх орон сууц «үйлчилгээ дутмаг»
      access[b] = { stop: -1, distM: Infinity, band: 'poor' };
      if (bld.cat === 'residential') popByBand.poor += bld.population;
      continue;
    }

    const distM = bestD / upm;
    const band = busBand(distM);
    access[b] = { stop: bestI, distM, band };
    // ⚠️ ЗӨВХӨН орон сууц — багтаамжийг хүн ам гэж тоолохгүй
    if (bld.cat === 'residential') popByBand[band] += bld.population;
    stopDemand[bestI] += bld.trips * MODE_SPLIT.transit;
  }

  let maxStopDemand = 0;
  for (const v of stopDemand) if (v > maxStopDemand) maxStopDemand = v;
  return { access, popByBand, popUnserved: popByBand.poor, stopDemand, maxStopDemand };
}
