/**
 * Оноолтын логик — түүхий үзүүлэлт → 0..100 оноо → жигнэсэн нийлбэр.
 */
import { SCORE_LEVELS, levelOf, NO_DATA_COLOR, STRICT_NORM, NORM_FAIL_MAX,
         densityNormOf } from "./config.js";

/**
 * Бүсийн төрлөөс хамаарах норм (Хүснэгт 6.1) — FAR, BCR-д хэрэглэнэ.
 * ind.byType байвал best-ийг тухайн бүсийн TOROL-ын дээд хязгаараар солино.
 */
export function normFor(ind, torol) {
  if (!ind.byType || !torol) return ind;
  const max = densityNormOf(torol)[ind.byType];
  if (max == null) return ind;
  return { ...ind, best: max, hardMax: max * 2 };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (v, a, b) => (b === a ? 1 : (v - a) / (b - a));

/**
 * Нэг үзүүлэлтийн утгыг 0..100 оноо болгоно.
 * @param {number|null} value түүхий утга
 * @param {object} ind INDICATORS-ийн бичлэг (UI-аас засварласан хувилбар)
 * @returns {number|null} null бол өгөгдөл дутуу
 */
export function scoreIndicator(value, ind) {
  if (value === null || value === undefined || !isFinite(value)) return null;

  // Норм хангасан бол 100. Зөрчсөн бол STRICT_NORM үед оноо 44-ээс хэтрэхгүй тул
  // "Дунд"-ын босгоос (45) доогуур буюу улаан бүсэд шууд унана.
  const fail = STRICT_NORM ? NORM_FAIL_MAX : 100;

  switch (ind.mode) {
    case "higher": {
      // target-аас дээш → норм хангасан
      if (value >= ind.target) return 100;
      return clamp(lerp(value, ind.hardMin ?? 0, ind.target), 0, 1) * fail;
    }
    case "lower": {
      // best-ээс дотогш → норм хангасан
      if (value <= ind.best) return 100;
      if (value >= ind.hardMax) return 0;
      return (1 - lerp(value, ind.best, ind.hardMax)) * fail;
    }
    case "band":
    default: {
      if (value >= ind.optMin && value <= ind.optMax) return 100;
      if (value < ind.optMin) return clamp(lerp(value, ind.hardMin, ind.optMin), 0, 1) * fail;
      return clamp(1 - lerp(value, ind.optMax, ind.hardMax), 0, 1) * fail;
    }
  }
}

/**
 * Хот төлөвлөлтийн нийлмэл оноо.
 * Өгөгдөлгүй үзүүлэлтийг жингээс хасаад үлдсэнийг дахин нормчилно.
 */
export function urbanScore(raw, indicators, torol) {
  let sum = 0, wsum = 0;
  const parts = {};
  for (const ind of indicators) {
    if (ind.weight <= 0) { parts[ind.id] = { value: raw[ind.id] ?? null, score: null, weight: 0 }; continue; }
    const eff = normFor(ind, torol);   // бүсийн төрлийн норм
    const s = scoreIndicator(raw[ind.id], eff);
    parts[ind.id] = { value: raw[ind.id] ?? null, score: s, weight: ind.weight, norm: eff };
    if (s !== null) { sum += s * ind.weight; wsum += ind.weight; }
  }
  return { score: wsum ? sum / wsum : null, parts };
}

/**
 * Бүх бүсийн эцсийн оноог тооцно.
 * @returns {Array} бүс бүрд { ...zone, urbanParts, urban }
 */
export function computeAll(zones, indicators) {
  return zones.map((z) => {
    const u = urbanScore(z.raw, indicators, z.type);
    return { ...z, urbanParts: u.parts, urban: u.score };
  });
}

/**
 * Оноо → HEX өнгө. ТАСРАЛТГҮЙ градиент биш, донат диаграмтай ижил
 * 5 ТҮВШНИЙ дискрет өнгө буцаана — газрын зураг, эрэмбэ, тайлбар гурав
 * үргэлж нэг л шатлалыг харуулна.
 */
export function scoreColor(score) {
  const i = levelOf(score);
  return i < 0 ? NO_DATA_COLOR : SCORE_LEVELS[i].color;
}

/** Оноог үгээр ангилах */
export function scoreLabel(score) {
  if (score === null || !isFinite(score)) return "Өгөгдөлгүй";
  if (score >= 85) return "Маш сайн";
  if (score >= 65) return "Сайн";
  if (score >= 45) return "Дунд";
  if (score >= 25) return "Муу";
  return "Маш муу";
}
