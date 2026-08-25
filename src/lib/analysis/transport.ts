import { t as tr } from '@/lib/i18nCore';
/**
 * ТЭЭВЭР-ИДЭВХИЙН ШИНЖИЛГЭЭ — барилгын ангилал, хүн-зорчилт (trip) үүсгэлт,
 * тээврийн хуваарь, замын эрэлт, автобусны хүртээмж.
 *
 * Эх сурвалж: газрын зураг дээрх «Барилга» давхарга (`et:24`) — 2026-08-24-ээс
 * нэгтгэсэн `data`/108 үйлчилгээнд. Хаягийг ГАРААР бичихгүй: `layerUrl()`
 * каталогоос угсарна.
 *
 * ⚠️ ХОЁР ТУСДАА талбар:
 *   · `Population`    (alias «Хүн ам»)     — орон сууцны оршин суугчийн тоо
 *   · `Huchin_chadal` (alias «Хүчин чадал») — орон сууц БУС барилгын багтаамж
 *   Орон сууц → Population, бусад → Huchin_chadal. Хоёрыг ШУУД нийлүүлэхгүй —
 *   1 оршин суугч ба 1 сургуулийн суудал ижил утгагүй тул зөвхөн хүн-зорчилт
 *   болгосны ДАРАА нэгтгэнэ.
 */

/** et:24 барилгын давхаргын гол талбарууд */
export const TRANSPORT_FIELDS = {
  purpose: 'Зориулалт_m',
  population: 'Population',
  capacity: 'Huchin_chadal',
  block: tr('Блокы'),
  zone: 'ZONE_ID',
} as const;

/* ══════════════════ Барилгын ангилал ══════════════════ */

export type BuildingCat =
  | 'residential' | 'school' | 'kindergarten'
  | 'hospital' | 'office' | 'service' | 'other';

export const CAT_LABEL: Record<BuildingCat, string> = {
  residential: tr('Орон сууц'),
  school: tr('Сургууль'),
  kindergarten: tr('Цэцэрлэг'),
  hospital: tr('Эмнэлэг'),
  office: tr('Оффис'),
  service: tr('Худалдаа, үйлчилгээ'),
  other: tr('Бусад'),
};

/**
 * Зориулалтын утгыг ТҮЛХҮҮР ҮГЭЭР 7 ангилалд буулгана.
 *
 * ⚠️ ДАРААЛАЛ чухал: орон сууц ЭХЭНД (》«Үйлчилгээтэй орон сууц» → орон сууц),
 *    оффис нь худалдаа-үйлчилгээний ӨМНӨ (》«Оффис, үйлчилгээ» → оффис).
 *    Батлагдсан онцгой тохиолдол: спорт·хүүхэд/ахмад → үйлчилгээ; холбоо·цагдаа → оффис.
 */
export function classifyBuilding(purpose: unknown): BuildingCat {
  const s = String(purpose ?? '').toLowerCase().trim();
  if (!s) return 'other';
  if (/орон сууц|house/.test(s)) return 'residential';
  if (/сургууль/.test(s)) return 'school';
  if (/цэцэрлэг/.test(s)) return 'kindergarten';
  if (/эмнэлэг/.test(s)) return 'hospital';
  if (/оффис|цагдаа|холбоо мэдээ|төрийн/.test(s)) return 'office';
  if (/худалдаа|үйлчилгээ|зах|спорт|ахмад|хүүхэд|үзвэр/.test(s)) return 'service';
  return 'other';
}

export const isResidentialCat = (cat: BuildingCat) => cat === 'residential';

/* ══════════════════ Хүн-зорчилт (trip) үүсгэлт ══════════════════ */

/**
 * Ангилал бүрийн өглөөний оргил цагийн ХҮН-ЗОРЧИЛТЫН коэффициент.
 *   · Орон сууц → Population × 0.35
 *   · Бусад     → Capacity × (idэвхжилт × оргил-хувь)
 * Эх ТЗ-ийн томьёо: сургууль 0.90×0.75, цэцэрлэг 0.90×0.80, эмнэлэг 0.75×0.30,
 * оффис 0.80×0.60, үйлчилгээ 0.65×0.45. «Бусад» зорчилт үүсгэхгүй (0).
 */
export const TRIP_COEF: Record<BuildingCat, number> = {
  residential: 0.35,
  school: 0.90 * 0.75,       // 0.675
  kindergarten: 0.90 * 0.80, // 0.72
  hospital: 0.75 * 0.30,     // 0.225
  office: 0.80 * 0.60,       // 0.48
  service: 0.65 * 0.45,      // 0.2925
  other: 0,
};

/**
 * Нэг барилгын өглөөний оргил цагийн хүн-зорчилт.
 * ⚠️ ЧУХАЛ ДҮРЭМ: орон сууц бол ЗӨВХӨН Population, бусад бол ЗӨВХӨН Capacity.
 */
export function buildingTrips(cat: BuildingCat, population: number, capacity: number): number {
  const base = isResidentialCat(cat) ? Math.max(0, population) : Math.max(0, capacity);
  return base * TRIP_COEF[cat];
}

/* ══════════════════ Тээврийн төрлийн хуваарь ══════════════════ */

/** Нийт хүн-зорчилтыг тээврийн төрлөөр (нийлбэр = 1.0) */
export const MODE_SPLIT = {
  car: 0.35,
  transit: 0.40,
  walk: 0.20,
  bike: 0.05,
} as const;

/** Нэг автомашинд ногдох дундаж зорчигч (хүн-зорчилт → машин-зорчилт) */
export const CAR_OCCUPANCY = 1.4;

/** Хүн-зорчилт → автомашины тоо (машин-зорчилт) */
export function vehicleTrips(totalPersonTrips: number): number {
  return (totalPersonTrips * MODE_SPLIT.car) / CAR_OCCUPANCY;
}

/* ══════════════════ Замын эрэлт ба хүчин чадал ══════════════════ */

/** Барилгыг замд холбох дээд зай — үүнээс хол бол «замд холбогдоогүй» */
export const ROAD_MAX_DIST_M = 150;

/** Хамгийн ойрын 3 замд хуваарилах жин (1-р/2-р/3-р ойрын) */
export const ROAD_WEIGHTS = [0.5, 0.3, 0.2] as const;

/* ══════════════════ Автобусны хүртээмж ══════════════════ */

export type BusBand = 'good' | 'ok' | 'poor';

/** Автобусны буудал хүртэлх зайн босго (м) */
export const BUS_GOOD_M = 400; // 0–400 сайн
export const BUS_OK_M = 800;   // 400–800 боломжийн · >800 үйлчилгээ дутмаг

export function busBand(distM: number): BusBand {
  if (distM <= BUS_GOOD_M) return 'good';
  if (distM <= BUS_OK_M) return 'ok';
  return 'poor';
}

export const BUS_BAND_LABEL: Record<BusBand, string> = {
  good: tr('Сайн хүртээмж (≤400 м)'),
  ok: tr('Боломжийн (400–800 м)'),
  poor: tr('Үйлчилгээ дутмаг (>800 м)'),
};
