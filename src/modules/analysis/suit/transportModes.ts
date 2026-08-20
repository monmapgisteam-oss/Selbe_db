/**
 * ТЭЭВЭР-ИДЭВХИЙН ДҮРСЛЭЛҮҮД — «Симуляц» табын зүүн талын самбарын цөм.
 *
 * ⚠️ Одоо байгаа `simulation.ts` нь БҮСЭЭР (`Zone`) тооцдог; энэ модуль
 * БАРИЛГА БҮРЭЭР ажиллана. Тиймээс `simMetric`-ийг өргөтгөхгүй, тусад нь
 * бичив — хоёр өөр нэгжийг нэг функцэд шахвал аль аль нь ойлгомжгүй болно.
 *
 * ⚠️ «Замын ачаалал» (`simKind === 'road'`) симуляцыг ЭНД ОГТ ХӨНДӨХГҮЙ —
 * тэр нь машин агентын микросимуляц, энэ нь статик эрэлтийн шинжилгээ.
 */

import {
  CAT_LABEL, BUS_BAND_LABEL, BUS_GOOD_M, BUS_OK_M,
} from '@/lib/analysis/transport';
import { simColor } from './simulation';
import { t as tr } from '@/lib/i18nCore';
import { demandNorm, type RoadDemand } from './roadDemand';
import type { BusAccess, BusStop } from './busAccess';
import type { BuildingPt } from './buildings';
import type { Network } from './traffic';

export type TMode =
  | 'population' | 'capacity' | 'trips' | 'vehicles'
  | 'roadDemand' | 'busAccess';

/** Дүрслэл нь юуг буддаг вэ — самбар ба газрын зураг хоёулаа үүнээс шийднэ */
export type TTarget = 'building' | 'road' | 'stop';

export type TModeDef = {
  key: TMode;
  label: string;
  short: string;
  unit: string;
  icon: string;
  hue: string;
  target: TTarget;
  /**
   * Дулааны гадаргуу утгатай эсэх.
   *
   * ⚠️ Heatmap нь цөмүүдийг НЭМДЭГ тул зөвхөн ХУРИМТЛАГДАХ хэмжигдэхүүнд
   * (хүн, багтаамж, зорчилт, машин/ц) утгатай. ЗАЙД (буудал хүртэлх метр)
   * утгагүй: зайг нэмэх нь ямар ч физик утгагүй бөгөөд «улаан = хол = муу»
   * болж бусад дүрслэлийн «улаан = их» гэсэнтэй зөрчилдөнө.
   */
  heatable: boolean;
};

export const T_MODES: TModeDef[] = [
  {
    key: 'population',
    label: tr('Оршин суугчид'),
    short: tr('Хүн ам'),
    unit: tr('хүн'), icon: 'users', hue: '#f59e0b', target: 'building', heatable: true,
  },
  {
    key: 'capacity',
    label: tr('Үйлчилгээний багтаамж'),
    short: tr('Багтаамж'),
    unit: tr('хүн'), icon: 'building', hue: '#60a5fa', target: 'building', heatable: true,
  },
  {
    key: 'trips',
    label: tr('Хүн-зорчилт'),
    short: tr('Зорчилт'),
    unit: tr('зорчилт/ц'), icon: 'target', hue: '#a78bfa', target: 'building', heatable: true,
  },
  {
    key: 'vehicles',
    label: tr('Машин-зорчилт'),
    short: tr('Машин'),
    unit: tr('машин/ц'), icon: 'car', hue: '#fb923c', target: 'building', heatable: true,
  },
  {
    key: 'roadDemand',
    label: tr('Замын эрэлт'),
    short: tr('Зам'),
    unit: tr('машин/ц'), icon: 'road', hue: '#f87171', target: 'road', heatable: true,
  },
  {
    key: 'busAccess',
    label: tr('Автобусны хүртээмж'),
    short: tr('Автобус'),
    // ⚠️ `heatable: false` — жин нь ЗАЙ; дулаан гадаргуу зайг нэмэх нь утгагүй
    unit: tr('м'), icon: 'bus', hue: '#38bdf8', target: 'stop', heatable: false,
  },
];

export const tModeDef = (m: TMode): TModeDef => T_MODES.find((x) => x.key === m) ?? T_MODES[0];

/** Тооцооны БҮХ үр дүн нэг дор — самбар, газрын зураг, KPI гурав үүнээс уншина. */
export type TransportCtx = {
  buildings: BuildingPt[];
  demand: RoadDemand;
  bus: BusAccess;
  stops: BusStop[];
  net: Network;
};

/* ══════════════════ Барилгын утга ══════════════════ */

/**
 * Дүрслэлд ОРОЛЦОХ барилгын утга; оролцохгүй бол `null`.
 *
 * ⚠️ `null` ба `0` нь ӨӨР: `null` = «энэ дүрслэлд хамаарахгүй» (орон сууц бус
 * барилга «Хүн ам» дүрслэлд) → газрын зурагт бүдэг саарал; `0` = «хамаарна ч
 * утга нь тэг» → шатлалын хамгийн доод өнгө.
 */
export function buildingValue(b: BuildingPt, mode: TMode, ctx: TransportCtx, i: number): number | null {
  switch (mode) {
    case 'population':
      return b.cat === 'residential' ? b.population : null;
    case 'capacity':
      // ⚠️ «Бусад» (зогсоол, дэд станц, УДДП…) нь ҮЙЛЧИЛГЭЭНИЙ барилга БИШ —
      //    багтаамж нь 0 тул шатлалын хамгийн доод өнгөөр будвал жинхэнэ
      //    үйлчилгээний барилгуудтай нэг зэрэгт орж, дүрслэл бохирдоно.
      return b.cat === 'residential' || b.cat === 'other' ? null : b.capacity;
    case 'trips':
      return b.trips > 0 ? b.trips : null;
    case 'vehicles':
      return b.vehTrips > 0 ? b.vehTrips : null;
    case 'busAccess': {
      const a = ctx.bus.access[i];
      return a && Number.isFinite(a.distM) ? a.distM : null;
    }
    default:
      // Замын дүрслэлүүд барилга буддаггүй
      return null;
  }
}

/** Дүрслэлийн утгын хязгаар (нормчилол ба легендэд) */
export type TRange = { min: number; max: number };

export function tRange(mode: TMode, ctx: TransportCtx): TRange {
  if (mode === 'roadDemand') return { min: 0, max: ctx.demand.max };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < ctx.buildings.length; i++) {
    const v = buildingValue(ctx.buildings[i], mode, ctx, i);
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : { min: 0, max: 0 };
}

export function tNorm(v: number | null, r: TRange): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const span = r.max - r.min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (v - r.min) / span));
}

/* ══════════════════ Өнгө ══════════════════ */

/**
 * Хүртээмжийн шатлалын тулгуур өнгө — 0 м, 400 м (`BUS_GOOD_M`), 800 м (`BUS_OK_M`).
 * ⚠️ Тулгуур цэгүүд нь НОРМ дээр суусан тул өнгө нь «хэр хол вэ» гэдгийг ч,
 * «нормын аль зурваст байна вэ» гэдгийг ч нэгэн зэрэг хэлнэ.
 */
export const BUS_RAMP = ['#15803d', '#f59e0b', '#ef4444'] as const;

/** Зурвасын нэрлэсэн өнгө — легенд ба KPI-д (шатлалын тулгуур цэгүүдтэй ижил) */
export const BUS_BAND_COLOR = { good: BUS_RAMP[0], ok: BUS_RAMP[1], poor: BUS_RAMP[2] } as const;

/** Дүрслэлд хамаарахгүй объект — бүдэг саарал */
export const T_NO_DATA = '#94a3b8';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Гурван тулгуур өнгөний хооронд шугаман интерполяци (t: 0..1, дунд нь 0.5) */
function rampColor(t: number, stops: readonly string[]): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const rd = (h: string, k: number) => parseInt(h.slice(1 + k * 2, 3 + k * 2), 16);
  return `#${[0, 1, 2].map((k) => hex2(rd(stops[i], k) + (rd(stops[i + 1], k) - rd(stops[i], k)) * f)).join('')}`;
}

/**
 * Утгыг өнгө болгоно.
 *
 * ⚠️ ХҮРТЭЭМЖ нь бусдаас ЭСРЭГ утгатай: бага зай = САЙН. Тиймээс YlOrRd дулааны
 * шатлал БИШ, ногоон→шар→улаан.
 *
 * ⚠️ Урьд нь 3 ДИСКРЕТ зурвас байсныг ТАСРАЛТГҮЙ шатлал болгов: живэ өгөгдөл
 * дээр 363 барилгын 361 нь ≤400 м-т байдаг тул дискрет өнгөөр зураг БҮХЭЛДЭЭ
 * нэг ногоон болж, ямар ч мэдээлэл өгөхгүй байв. Тасралтгүй шатлал нь 0–400 м
 * дотор ч ялгааг харуулна (50 м vs 380 м).
 */
export function tColor(mode: TMode, t: number | null): string {
  if (t == null) return T_NO_DATA;
  if (mode === 'busAccess') return rampColor(t, BUS_RAMP);
  return simColor(t);
}

/**
 * Дүрслэлийн утгыг 0..1 болгоно.
 *
 * ⚠️ ХҮРТЭЭМЖ нь өгөгдлийн min..max-аар БИШ, НОРМООР нормчилогдоно
 * (0 м → 0, `BUS_OK_M` = 800 м → 1). Шалтгаан: өгөгдлийн хамгийн холыг «1.0»
 * гэвэл хамгийн хол барилга ҮРГЭЛЖ улаан болно — бүх барилга буудлын дэргэд
 * байсан ч. Нормоор бэхэлснээр өнгө нь өөрөө «энэ 800 м-ийн хэдэн хувь вэ»
 * гэсэн ТОГТМОЛ утгатай болно.
 */
export function tNormFor(mode: TMode, v: number | null, r: TRange): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (mode === 'busAccess') return Math.max(0, Math.min(1, v / BUS_OK_M));
  return tNorm(v, r);
}

/* ══════════════════ Эрэмбийн жагсаалт ══════════════════ */

/** Самбарын эрэмбийн нэг мөр — барилга, зам, буудал гурвуулаа ижил хэлбэрээр */
export type TItem = {
  key: string;
  /**
   * Эх массив дахь ИНДЕКС — барилгын дүрслэлд `buildings[]`-ийн, замынхад
   * `net.edges[]`-ийн. ⚠️ Газрын зургийн hover нь ЭНЭ индексээр эрэмбийг хайдаг
   * тул `tPaint`-ийн индекстэй ЗААВАЛ ижил утгатай байх ёстой.
   */
  idx: number;
  name: string;
  sub: string;
  value: number;
  text: string;
  t: number | null;
  color: string;
};

const nf0 = (v: number) => Math.round(v).toLocaleString('mn-MN');

/** Дүрслэлийн эрэмбэ — их→бага (хүртээмжид хол→ойр, өөрөөр хэлбэл МУУ→сайн). */
export function tItems(mode: TMode, ctx: TransportCtx): TItem[] {
  const r = tRange(mode, ctx);
  const def = tModeDef(mode);

  if (def.target === 'road') {
    const out: TItem[] = [];
    for (let i = 0; i < ctx.demand.edgeDemand.length; i++) {
      const v = ctx.demand.edgeDemand[i];
      if (v <= 0) continue;
      const t = demandNorm(v, ctx.demand.max);
      out.push({
        key: `e${i}`,
        idx: i,
        name: tr('Хэрчим #{0}', i),
        sub: tr('{0} м', Math.round(ctx.net.edges[i].length / ctx.net.unitsPerMeter)),
        value: v,
        text: tr('{0} машин/ц', nf0(v)),
        t,
        color: tColor(mode, t),
      });
    }
    return out.sort((a, b) => b.value - a.value);
  }

  const out: TItem[] = [];
  for (let i = 0; i < ctx.buildings.length; i++) {
    const b = ctx.buildings[i];
    const v = buildingValue(b, mode, ctx, i);
    if (v == null) continue;
    const t = tNormFor(mode, v, r);
    const band = mode === 'busAccess' ? ctx.bus.access[i].band : null;
    out.push({
      key: `b${b.oid}`,
      idx: i,
      name: b.purpose || CAT_LABEL[b.cat],
      sub: band ? BUS_BAND_LABEL[band] : CAT_LABEL[b.cat],
      value: v,
      text: mode === 'busAccess' ? tr('{0} м', Math.round(v)) : `${nf0(v)} ${def.unit}`,
      t,
      color: tColor(mode, t),
    });
  }
  // ⚠️ Хүртээмжид ч ИХ→БАГА: хамгийн ХОЛ (муу хүртээмжтэй) барилга дээр гарна
  return out.sort((a, b) => b.value - a.value);
}

/* ══════════════════ Газрын зургийн будалт ══════════════════ */

/**
 * Газрын зурагт зурах бэлэн өгөгдөл.
 * ⚠️ `SuitMap` нь ArcGIS-ийн Graphic болгож л хөрвүүлнэ — ЯМАР өнгө, ЯМАР
 * өргөн болохыг ЭНД шийднэ. Ингэснээр самбарын жагсаалт ба зураг хоёр НЭГ
 * эх сурвалжтай болж, өнгө нь хэзээ ч зөрөхгүй.
 */
export type TPaint = {
  /** ⚠️ `idx` нь `TransportCtx.buildings`-ийн индекс — hover нь үүгээр хайна */
  buildings: { idx: number; rings: number[][][]; color: string; on: boolean }[];
  /** ⚠️ `idx` нь `TransportCtx.net.edges`-ийн индекс */
  roads: { idx: number; pts: [number, number][]; color: string; width: number }[];
  /** ⚠️ `idx` нь `TransportCtx.stops`-ийн индекс */
  stops: { idx: number; x: number; y: number; size: number }[];
};

/** Замын шугамын өргөн (пиксель) — эрэлт багатай нь нарийн, ихтэй нь бүдүүн */
const ROAD_W_MIN = 1.2;
const ROAD_W_MAX = 7;

/** Буудлын тэмдэглэгээний хэмжээ (пиксель) — эрэлтээр */
const STOP_SIZE_MIN = 7;
const STOP_SIZE_MAX = 20;

export function tPaint(mode: TMode, ctx: TransportCtx): TPaint {
  const def = tModeDef(mode);
  const r = tRange(mode, ctx);
  const out: TPaint = { buildings: [], roads: [], stops: [] };

  /* ── Барилга ── */
  for (let i = 0; i < ctx.buildings.length; i++) {
    const b = ctx.buildings[i];
    if (!b.rings.length) continue;
    // Замын дүрслэлд барилга нь ЗӨВХӨН контекст — бүгд бүдэг саарал
    if (def.target === 'road') {
      out.buildings.push({ idx: i, rings: b.rings, color: T_NO_DATA, on: false });
      continue;
    }
    const v = buildingValue(b, mode, ctx, i);
    const t = tNormFor(mode, v, r);
    out.buildings.push({
      idx: i,
      rings: b.rings,
      color: tColor(mode, t),
      on: v != null,
    });
  }

  /* ── Зам ── */
  if (def.target === 'road') {
    for (let i = 0; i < ctx.demand.edgeDemand.length; i++) {
      const v = ctx.demand.edgeDemand[i];
      if (v <= 0) continue;
      const t = demandNorm(v, ctx.demand.max);
      out.roads.push({
        idx: i,
        pts: ctx.net.edges[i].pts,
        color: tColor(mode, t),
        width: ROAD_W_MIN + (ROAD_W_MAX - ROAD_W_MIN) * t,
      });
    }
  }

  /* ── Буудал ── */
  if (def.target === 'stop') {
    const max = ctx.bus.maxStopDemand || 1;
    for (let s = 0; s < ctx.stops.length; s++) {
      const t = Math.max(0, Math.min(1, ctx.bus.stopDemand[s] / max));
      out.stops.push({
        idx: s,
        x: ctx.stops[s].x,
        y: ctx.stops[s].y,
        size: STOP_SIZE_MIN + (STOP_SIZE_MAX - STOP_SIZE_MIN) * t,
      });
    }
  }

  return out;
}

/* ══════════════════ Тоон уншилт ══════════════════ */

export type TCell = { k: string; v: string; unit?: string; color?: string };

/** Дүрслэл бүрийн ГУРВАН гол тоо — байрлал нь тогтмол (нүд ижил газраас уншина). */
export function tReadout(mode: TMode, ctx: TransportCtx): TCell[] {
  const { buildings, demand, bus } = ctx;

  if (mode === 'roadDemand') {
    let loaded = 0;
    for (const v of demand.edgeDemand) if (v > 0) loaded++;
    return [
      { k: tr('Ачаалалтай зам'), v: nf0(loaded) },
      { k: tr('Хамгийн өндөр'), v: nf0(demand.max), unit: tr('машин/ц') },
      {
        k: tr('Замд холбогдоогүй'),
        v: nf0(demand.unlinked.length),
        unit: tr('барилга'),
        color: demand.unlinked.length ? '#f87171' : '#4ade80',
      },
    ];
  }

  if (mode === 'busAccess') {
    const resPop = buildings.reduce((a, b) => a + (b.cat === 'residential' ? b.population : 0), 0);
    const pct = (v: number) => (resPop > 0 ? Math.round((v / resPop) * 100) : 0);
    const good = pct(bus.popByBand.good);
    return [
      { k: tr('≤{0} м доторх', BUS_GOOD_M), v: `${good}%`, color: good > 70 ? '#4ade80' : good > 40 ? '#fbbf24' : '#f87171' },
      { k: tr('>{0} м (дутмаг)', BUS_OK_M), v: nf0(bus.popUnserved), unit: tr('хүн') },
      { k: tr('Ачаалалтай буудал'), v: nf0(bus.maxStopDemand), unit: tr('зорчигч/ц') },
    ];
  }

  const items = tItems(mode, ctx);
  if (!items.length) return [];
  const sum = items.reduce((a, x) => a + x.value, 0);
  const def = tModeDef(mode);
  return [
    { k: tr('Нийт'), v: nf0(sum), unit: def.unit },
    { k: tr('Хамгийн өндөр'), v: nf0(items[0].value), unit: def.unit },
    { k: tr('Барилга'), v: nf0(items.length) },
  ];
}
