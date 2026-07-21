/**
 * АНАЛИЗ — оноолтын логик: түүхий үзүүлэлт → 0..100 оноо → жигнэсэн нийлбэр.
 */

import {
  SCORE_LEVELS, levelOf, NO_DATA_COLOR, STRICT_NORM, NORM_FAIL_MAX,
  densityNormOf, type Indicator,
} from './config';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (v: number, a: number, b: number) => (b === a ? 1 : (v - a) / (b - a));

/**
 * Бүсийн ТӨРЛӨӨС хамаарах норм (Хүснэгт 6.1) — FAR, BCR-д.
 * `byType` байвал `best`-ийг тухайн бүсийн `TOROL`-ын дээд хязгаараар солино.
 */
export function normFor(ind: Indicator, torol?: string | null): Indicator {
  if (!ind.byType || !torol) return ind;
  const max = densityNormOf(torol)[ind.byType];
  if (max == null) return ind;
  return { ...ind, best: max, hardMax: max * 2 };
}

/**
 * Нэг үзүүлэлтийн утгыг 0..100 оноо болгоно. `null` = өгөгдөл дутуу.
 *
 * ⚠️ `STRICT_NORM` үед норм зөрчсөн утга 100 биш, дээд тал нь `NORM_FAIL_MAX`
 * (44) авна — «Дунд»-ын босго (45)-аас доогуур тул шууд улаан бүсэд унана.
 * Энэ нь 100 → 44 гэсэн 56 онооны ҮСРЭЛТ үүсгэдэг: норм хангасан ба зөрчсөн
 * хоёрын хооронд завсрын байдал байхгүй гэсэн САНААТАЙ шийдэл.
 */
export function scoreIndicator(value: number | null | undefined, ind: Indicator): number | null {
  if (value == null || !Number.isFinite(value)) return null;

  const fail = STRICT_NORM ? NORM_FAIL_MAX : 100;

  switch (ind.mode) {
    case 'higher': {
      const target = ind.target ?? 100;
      if (value >= target) return 100;         // норм хангасан
      return clamp(lerp(value, ind.hardMin ?? 0, target), 0, 1) * fail;
    }
    case 'lower': {
      const best = ind.best ?? 0;
      const hardMax = ind.hardMax ?? best * 2;
      if (value <= best) return 100;           // норм хангасан
      if (value >= hardMax) return 0;
      return (1 - lerp(value, best, hardMax)) * fail;
    }
    default: {
      const { optMin = 0, optMax = 0, hardMin = 0, hardMax = 0 } = ind;
      if (value >= optMin && value <= optMax) return 100;
      if (value < optMin) return clamp(lerp(value, hardMin, optMin), 0, 1) * fail;
      return clamp(1 - lerp(value, optMax, hardMax), 0, 1) * fail;
    }
  }
}

export type Part = {
  value: number | null;
  score: number | null;
  weight: number;
  norm: Indicator;
};

/**
 * Хот төлөвлөлтийн нийлмэл оноо.
 * ⚠️ Өгөгдөлгүй үзүүлэлтийг жингээс ХАСААД үлдсэнийг дахин нормчилно — эс
 * бөгөөс мэдээлэл дутуу бүс зүгээр л бага оноо авч, «муу» мэт харагдана.
 */
export function urbanScore(
  raw: Record<string, number | null>,
  indicators: Indicator[],
  torol?: string | null,
): { score: number | null; parts: Record<string, Part> } {
  let sum = 0, wsum = 0;
  const parts: Record<string, Part> = {};

  for (const ind of indicators) {
    const eff = normFor(ind, torol);
    if (ind.weight <= 0) {
      parts[ind.id] = { value: raw[ind.id] ?? null, score: null, weight: 0, norm: eff };
      continue;
    }
    const s = scoreIndicator(raw[ind.id], eff);
    parts[ind.id] = { value: raw[ind.id] ?? null, score: s, weight: ind.weight, norm: eff };
    if (s !== null) { sum += s * ind.weight; wsum += ind.weight; }
  }

  return { score: wsum ? sum / wsum : null, parts };
}

/**
 * Оноо → HEX өнгө. ТАСРАЛТГҮЙ градиент БИШ, 5 түвшний дискрет өнгө —
 * газрын зураг, эрэмбэ, дэлгэрэнгүй гурав үргэлж нэг л шатлалыг харуулна.
 */
export function scoreColor(score: number | null | undefined): string {
  const i = levelOf(score);
  return i < 0 ? NO_DATA_COLOR : SCORE_LEVELS[i].color;
}

/** Оноог үгээр */
export function scoreLabel(score: number | null | undefined): string {
  const i = levelOf(score);
  return i < 0 ? 'Өгөгдөлгүй' : SCORE_LEVELS[i].label;
}

/** Норм хангасан эсэх — оноо биш, ТҮҮХИЙ утгаар шалгана */
export function passesNorm(value: number | null | undefined, ind: Indicator): boolean | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (ind.mode === 'band') return value >= (ind.optMin ?? 0) && value <= (ind.optMax ?? 0);
  if (ind.mode === 'higher') return value >= (ind.target ?? 0);
  return value <= (ind.best ?? 0);
}

/** Нормын шаардлагыг нэг мөрөнд — дагаврын эгшиг зохицол тул ≥ / ≤ тэмдгээр */
export function normText(ind: Indicator, fmt: (v: number, d: number) => string): string {
  const u = ind.unit ? ` ${ind.unit}` : '';
  if (ind.mode === 'band') {
    return `${fmt(ind.optMin ?? 0, ind.decimals)} – ${fmt(ind.optMax ?? 0, ind.decimals)}${u}`;
  }
  if (ind.mode === 'higher') return `≥ ${fmt(ind.target ?? 0, ind.decimals)}${u}`;
  return `≤ ${fmt(ind.best ?? 0, ind.decimals)}${u}`;
}
