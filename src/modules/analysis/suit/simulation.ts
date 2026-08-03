/**
 * СИМУЛЯЦ — хүн амын төвлөрөл, тээврийн хүртээмж, замын ачааллын загвар.
 *
 * ⚠️ Тохиромжтой байдлын ОНОО (`valueOf`) нь «сайн ↔ муу» гэсэн 0–100 утга бөгөөд
 * ногоон↔улаанаар будагддаг. Симуляц нь ӨӨР семантик: «эрчим» (нягтрал, зай,
 * ачаалал) — их нь сайн ч муу ч биш, зүгээр л ЭРЧИМ. Тиймээс энд тусдаа хэмжүүр
 * (`simMetric`) ба тусдаа өнгөний шатлал (`simColor`, YlOrRd дулааны шатлал)
 * ашиглана, оноололын ногоон↔улаантай хольж болохгүй.
 *
 * ⚠️ Зам/тээврийн давхаргад эгнээ · багтаамж · давтамжийн атрибут БАЙХГҮЙ тул
 * «ачаалал» нь бодит машины урсгал биш, ХҮН АМД суурилсан ХАРЬЦАНГУЙ индекс.
 */

import type { Zone } from '@/lib/analysis/data';

export type SimKind = 'density' | 'transit' | 'road';

export type SimDef = {
  key: SimKind;
  label: string;
  short: string;
  /** Панелийн доор гарах тайлбар */
  desc: string;
  /** Хэмжүүрийн нэгж (легенд, tooltip-д) */
  unit: string;
  /**
   * Симуляцын АКЦЕНТ өнгө — сонгогч, гулсуур, эрэмбийн баар энэ өнгийг авна.
   * ⚠️ Дулааны шатлал (`simColor`) БИШ: тэр нь утгын ЭРЧМИЙГ заадаг бөгөөд
   * гурван симуляцад ижил. Энэ нь ямар симуляц идэвхтэйг заана — нүд табыг
   * уншихаас өмнө өнгөөр нь таньдаг.
   */
  hue: string;
  /** `components/Icon.tsx`-ийн нэр — сонгогчид */
  icon: string;
  /** Одоо тооцоологддог эсэх — `false` бол «удахгүй» гэж харагдана */
  ready: boolean;
};

export const SIM_KINDS: SimDef[] = [
  {
    key: 'density',
    label: 'Хүн амын төвлөрөл',
    short: 'Төвлөрөл',
    desc: 'Бүс бүрийн оршин суугчийн нягтрал — хүн ÷ полигоны талбай (га). Хүн шигүү суусан бүсийг дулаан өнгөөр.',
    unit: 'хүн/га',
    hue: '#a78bfa',
    icon: 'flame',
    ready: true,
  },
  {
    key: 'transit',
    label: 'Тээврийн хүртээмж',
    short: 'Хүртээмж',
    desc: 'Бүсээс хамгийн ойрын автобусны буудал / LRT·BRT зогсоол хүрэх зай (м). Хол зайтай (муу хүртээмжтэй) бүсийг дулаан өнгөөр.',
    unit: 'м',
    hue: '#38bdf8',
    icon: 'bus',
    ready: true,
  },
  {
    key: 'road',
    label: 'Замын ачаалал',
    short: 'Ачаалал',
    desc: 'Бүсийн аялал үүсгэлт → замын сүлжээнд машин агентууд. Цагийн гулсуурыг хөдөлгөж өдрийн ачааллыг хараарай.',
    unit: 'аялал/ц',
    hue: '#f59e0b',
    icon: 'road',
    ready: true,
  },
];

/** БНБД 30-01-24, 10.22 — ойрын буудал хүртэл 500 м-ээс ихгүй */
export const TRANSIT_NORM_M = 500;

export const simDef = (kind: SimKind): SimDef =>
  SIM_KINDS.find((s) => s.key === kind) ?? SIM_KINDS[0];

/**
 * Хүн амын ХОЁР төрөл — өгөгдөлд `Total_population` нь зориулалтаар хуваагддаг:
 *   · `resident` — орон сууцны барилгын оршин суугч (өрхөөс). Аялал ҮҮСГЭНЭ.
 *   · `capacity` — орон сууц бус барилгын хүчин чадал (сургууль/оффис). Аялал ТАТНА.
 *   · `total`    — хоёрын нийлбэр.
 * «Хүн амын төвлөрөл» симуляц энэ гурвын алийг тоолохыг сонгуулна.
 */
export type PopBasis = 'resident' | 'capacity' | 'total';

export const POP_BASES: { key: PopBasis; label: string; short: string }[] = [
  { key: 'resident', label: 'Оршин суугч (өрхөөс)', short: 'Оршин суугч' },
  { key: 'capacity', label: 'Хүчин чадал (барилга)', short: 'Хүчин чадал' },
  { key: 'total', label: 'Нийт хүн ам', short: 'Нийт' },
];

const popOf = (z: Zone, basis: PopBasis): number =>
  basis === 'resident' ? z.residentPop : basis === 'capacity' ? z.capacityPop : z.population;

/* ══════════════════ Аялал үүсгэлт (замын ачаалал) ══════════════════ */

/**
 * НЭГ ОРШИН СУУГЧ оргил цагт үүсгэх аялал (машин/цаг) — ТААМАГ.
 * ⚠️ Эх өгөгдөлд аялалын судалгаа алга; хотын дундаж 0.3–0.4 гэсэн жишгээс авав.
 */
export const TRIP_PER_RESIDENT = 0.35;
/** Ажлын байр/сургуулийн НЭГ ХҮЧИН ЧАДАЛД ногдох ТАТАХ аялал (машин/цаг) */
export const TRIP_PER_CAPACITY = 0.25;

/**
 * Бүсийн оргил цагийн аялал үүсгэлт (машин/цаг).
 * Замын симуляцын ХОЁР хэрэглээ: бүсийн дулааны будалт ба замын хэрчим бүрийн
 * `baseLoad` (машин хаана олон төрөхийг тодорхойлно — `roadNet.assignLoads`).
 */
export const zoneTrips = (z: { residentPop: number; capacityPop: number }): number =>
  z.residentPop * TRIP_PER_RESIDENT + z.capacityPop * TRIP_PER_CAPACITY;

/**
 * Нэг аялал ТӨСЛИЙН СҮЛЖЭЭНД дунджаар байх хугацаа (цаг).
 * ⚠️ 158 га талбайг 40 км/ц-аар туулахад ~2–3 минут; аялалын ихэнх нь гадагшаа
 * үргэлжлэх тул сүлжээн ДОТОРХ хэсэг нь л энд тоологдоно.
 */
export const TRIP_DURATION_H = 0.05;

/**
 * Оргил цагт сүлжээнд ЗЭРЭГ байх машины тоо (Little-ийн хууль: L = λ × W).
 * Симуляцын «машины тоо» энэ таамгаас гарна — гараар өгсөн дугуй тоо БИШ.
 */
export function peakVehicles(zones: { residentPop: number; capacityPop: number }[]): number {
  const trips = zones.reduce((a, z) => a + zoneTrips(z), 0);
  return Math.round(trips * TRIP_DURATION_H);
}

export type SimMetric = {
  /** Түүхий утга (нэгжтэй) — эрэмбэ ба нормчилолд. Өгөгдөлгүй бол null. */
  value: number | null;
  /** Дэлгэцэд бэлэн текст (нэгжтэй) */
  text: string;
};

/** Бүсийн симуляцын түүхий хэмжүүр — төрлөөр (density-д хүн амын төрлөөр). */
export function simMetric(z: Zone, kind: SimKind, popBasis: PopBasis = 'resident'): SimMetric {
  if (kind === 'density') {
    const v = z.polyHa > 0 ? popOf(z, popBasis) / z.polyHa : null;
    return { value: v, text: v == null ? '—' : `${Math.round(v)} хүн/га` };
  }
  if (kind === 'transit') {
    const v = z.transitM;
    return { value: v, text: v == null ? '—' : `${Math.round(v)} м` };
  }
  // Замын ачаалал — бүсийн ОРГИЛ ЦАГИЙН аялал үүсгэлт (машин/цаг)
  const t = zoneTrips(z);
  return { value: t > 0 ? t : null, text: t > 0 ? `${Math.round(t)} аялал/ц` : '—' };
}

/** Нормчлолын хязгаар — харагдаж буй бүсүүдийн хамгийн бага/их утга. */
export type SimRange = { min: number; max: number };

export function simRange(zones: Zone[], kind: SimKind, popBasis: PopBasis = 'resident'): SimRange {
  let min = Infinity;
  let max = -Infinity;
  for (const z of zones) {
    const v = simMetric(z, kind, popBasis).value;
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

/** Утгыг 0..1 болгож нормчилно (хязгаар нурсан бол 0). */
export function simNorm(v: number | null, r: SimRange): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const span = r.max - r.min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (v - r.min) / span));
}

/* ── Дулааны шатлал (YlOrRd) — бага=цайвар шар, их=тод улаан ── */
const HEAT: [number, [number, number, number]][] = [
  [0, [255, 255, 178]],   // #ffffb2
  [0.5, [253, 141, 60]],  // #fd8d3c
  [1, [189, 0, 38]],      // #bd0026
];

/** Өгөгдөлгүй бүс — саарал (оноололтой ижил семантик). */
export const SIM_NO_DATA = '#94a3b8';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const toHex = (c: [number, number, number]) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;

/**
 * Нормчилсон 0..1 → дулааны өнгө «#rrggbb». null бол саарал.
 *
 * ⚠️ ЗААВАЛ hex (`#rrggbb`) буцаана — `SuitMap`-ийн будалт `hexToRgba(col)`
 * нь өнгийг `#rrggbb` гэж задалдаг тул `rgb(...)` бичвэл NaN болж бүс будагдахгүй.
 */
export function simColor(t: number | null): string {
  if (t == null) return SIM_NO_DATA;
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < HEAT.length; i++) {
    const [p1, c1] = HEAT[i - 1];
    const [p2, c2] = HEAT[i];
    if (x <= p2) {
      const f = (x - p1) / (p2 - p1 || 1);
      return toHex([0, 1, 2].map((k) => c1[k] + (c2[k] - c1[k]) * f) as unknown as [number, number, number]);
    }
  }
  return toHex(HEAT[HEAT.length - 1][1]);
}
