import { t as tr } from '@/lib/i18nCore';
/**
 * АНАЛИЗ — оноолтын логик: түүхий үзүүлэлт → 0..100 оноо → жигнэсэн нийлбэр.
 */

import {
  SCORE_LEVELS, levelOf, NO_DATA_COLOR, NO_DATA_TONE, STRICT_NORM, NORM_FAIL_MAX,
  densityNormOf, ASSUME_MET, MIN_MEASURED_SHARE, type Indicator,
} from './config';
import { SCORE_HEX, SCORE_INK, SCORE_NODATA_INK } from '@/lib/chartStyle';

/** `SCORE_LEVELS[i].tone` (`var(--score-N)`) → `SCORE_HEX`/`SCORE_INK`-ийн индекс (N-1).
 *  ⚠️ 2026-10-09 (аудит №3): индексийг токены НЭРЭЭС уншина — шатны дараалал (сайн→муу)
 *  ба токены дугаар (муу→сайн) урвуу тул `4 - i` гэж таамаглахгүй. */
const TOKEN_IX: readonly number[] = SCORE_LEVELS.map((L) => Number(/--score-(\d)/.exec(L.tone)?.[1] ?? 0) - 1);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/**
 * Шугаман интерполяц `a`→`b` дээр.
 *
 * ⚠️ `b === a` (норм нурсан) үед `v`-ийн БАЙРЛАЛААР шийднэ, тогтмол `1` БИШ
 *    (2026-09-15-ны аудит). Урьд нь үргэлж `1` буцаадаг байсан тул `band`
 *    горимд `hardMin === optMin` тохируулсан үзүүлэлтэд хамаагүй бага утга
 *    ч `clamp(1,0,1) * fail` = 44 оноо авч, «маш муу» нь «дунд»-ын хилд
 *    шахагддаг байв; `lower` горимд `best === hardMax` үед эсрэг талдаа
 *    хазайдаг байлаа.
 */
const lerp = (v: number, a: number, b: number) => (b === a ? (v >= a ? 1 : 0) : (v - a) / (b - a));

/**
 * Бүсийн ТӨРЛӨӨС хамаарах норм (Хүснэгт 6.1) — FAR, BCR-д.
 * `byType` байвал `best`-ийг тухайн бүсийн `TOROL`-ын дээд хязгаараар солино.
 */
export function normFor(ind: Indicator, torol?: string | null): Indicator {
  if (!ind.byType || !torol) return ind;
  /* ⚠️ 2026-10-22 (аудит): Хүснэгт 6.1-д ангилалгүй төрөл — норм ХАМААРАХГҮЙ (`na`), орон сууцны нормыг далд тулгахгүй
     (`config.densityNormOf`-ийн ⚠️). */
  const d = densityNormOf(torol);
  if (!d) return { ...ind, na: true };
  const max = d[ind.byType];
  if (max == null) return ind;
  return { ...ind, best: max, hardMax: max * 2 };
}

/**
 * ДЭЛГЭЦИЙН НАРИЙВЧЛАЛААР бүхэлчилнэ (`ind.decimals`).
 * ⚠️ 2026-10-22 (аудит): нормтой ДЭЛГЭЦЭД ХАРАГДАХ утгаар харьцуулна — E-5-ийн FAR 1.2017 нь «1.20 ≤ 1.20» гэж харагдаад
 *    100 → 44 (56 оноо) алддаг байв. Хэрэглэгч харж буй тоо ба дүгнэлт зөрөх ёсгүй.
 */
export const atPrecision = (v: number, decimals: number): number => {
  const k = 10 ** Math.max(0, Math.min(6, decimals));
  return Math.round(v * k) / k;
};

/**
 * Нэг үзүүлэлтийн утгыг 0..100 оноо болгоно. `null` = өгөгдөл дутуу.
 *
 * ⚠️ `STRICT_NORM` үед норм зөрчсөн утга 100 биш, дээд тал нь `NORM_FAIL_MAX`
 * (44) авна — «Дунд»-ын босго (45)-аас доогуур тул шууд улаан бүсэд унана.
 * Энэ нь 100 → 44 гэсэн 56 онооны ҮСРЭЛТ үүсгэдэг: норм хангасан ба зөрчсөн
 * хоёрын хооронд завсрын байдал байхгүй гэсэн САНААТАЙ шийдэл.
 */
export function scoreIndicator(raw: number | null | undefined, ind: Indicator): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  /* ⚠️ 2026-10-22 (аудит): норм хамаарахгүй → оноогүй; харьцуулалт дэлгэцийн нарийвчлалаар (`atPrecision`-ийн ⚠️) */
  if (ind.na) return null;
  const value = atPrecision(raw, ind.decimals);

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

/**
 * НОРМЫН ЗАСВАРЫГ ХЯЗГААРЛАНА — Жингийн тохиргооны талбар (`Urban.Weights`) үүгээр бичнэ.
 *
 * ⚠️ 2026-10-09: урьд нь оролтыг ШАЛГАЛТГҮЙ бичдэг байсан тул «Нормын доод» > «Нормын дээд»,
 *    эсвэл «0 оноо (доош)» > «Нормын доод» гэх мэт урвуу муж оноолтыг чимээгүй эвдэж
 *    (`lerp`-ийн хуваагч сөрөг → норм хангасан утга 0, зөрчсөн нь 44) байв. Дүрэм:
 *      band   — hardMin ≤ optMin ≤ optMax ≤ hardMax
 *      higher — hardMin ≤ target
 *      lower  — best ≤ hardMax
 *      жин    — ≥ 0
 *    Хөршөөсөө давсан утгыг ХӨРШИЙН утга руу хумина (нөгөө талбарыг ХӨДӨЛГӨХГҮЙ — хэрэглэгч
 *    засаагүй тоог чимээгүй өөрчлөхгүй); `clamped` нь UI-д тайлбар гаргахад.
 * ⚠️ Тодорхойгүй (`undefined`) хөрш хязгаар болохгүй.
 */
export function patchNorm(
  ind: Indicator, key: keyof Indicator, value: number,
): { ind: Indicator; clamped: boolean } {
  if (!Number.isFinite(value)) return { ind, clamped: false };
  const g = (k: keyof Indicator): number | undefined => {
    const v = ind[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  let lo = -Infinity;
  let hi = Infinity;
  const bound = (k: keyof Indicator, side: 'lo' | 'hi') => {
    const v = g(k);
    if (v == null) return;
    if (side === 'lo') lo = Math.max(lo, v); else hi = Math.min(hi, v);
  };
  if (key === 'weight') lo = 0;
  else if (ind.mode === 'band') {
    const order: (keyof Indicator)[] = ['hardMin', 'optMin', 'optMax', 'hardMax'];
    const at = order.indexOf(key);
    if (at >= 0) order.forEach((k, j) => { if (j < at) bound(k, 'lo'); else if (j > at) bound(k, 'hi'); });
  } else if (ind.mode === 'higher') {
    if (key === 'hardMin') bound('target', 'hi');
    if (key === 'target') bound('hardMin', 'lo');
  } else if (key === 'best') bound('hardMax', 'hi');
  else if (key === 'hardMax') bound('best', 'lo');
  const v = clamp(value, lo, hi);
  return { ind: { ...ind, [key]: v }, clamped: v !== value };
}

export type Part = {
  value: number | null;
  score: number | null;
  weight: number;
  norm: Indicator;
};

export type UrbanScore = {
  score: number | null;
  parts: Record<string, Part>;
  /**
   * ХЭМЖСЭН ЖИН ÷ НИЙТ ЖИН (0–1): оноо бодогдсон, `ASSUME_MET`-ээр ДҮГНЭГДЭЭГҮЙ үзүүлэлтүүдийн жин ÷ оноолдог бүх
   * үзүүлэлтийн жин. Оноолдог үзүүлэлт алга бол `null`. ⚠️ 2026-10-22 (аудит): `MIN_MEASURED_SHARE`-ийн ⚠️.
   */
  coverage: number | null;
  /** `score` null-ийн шалтгаан: `nodata` — нэг ч үзүүлэлт бодогдоогүй; `coverage` — хэмжсэн жин босгоос доош */
  reason: 'nodata' | 'coverage' | null;
};

/**
 * Хот төлөвлөлтийн нийлмэл оноо.
 * ⚠️ Өгөгдөлгүй үзүүлэлтийг жингээс ХАСААД үлдсэнийг дахин нормчилно — эс
 * бөгөөс мэдээлэл дутуу бүс зүгээр л бага оноо авч, «муу» мэт харагдана.
 * ⚠️ 2026-10-22 (аудит): ГЭХДЭЭ хэмжсэн жин (`coverage`) `minShare`-ээс доош бол оноо `null` (`reason: 'coverage'`) —
 *    дахин нормчлол нь цөөн үзүүлэлт (жиш. зөвхөн FAR+BCR) ба `ASSUME_MET`-ийн таамгийн 100-аар бүсийг 100 болгодог байв
 *    (`config.MIN_MEASURED_SHARE`-ийн ⚠️). `ASSUME_MET`-ийн үзүүлэлт оноонд орсоор (хэрэглэгчийн шийдвэр), хэмжсэнд үгүй.
 */
export function urbanScore(
  raw: Record<string, number | null>,
  indicators: Indicator[],
  torol?: string | null,
  minShare: number = MIN_MEASURED_SHARE,
): UrbanScore {
  let sum = 0, wsum = 0, total = 0, measured = 0;
  const parts: Record<string, Part> = {};

  for (const ind of indicators) {
    const eff = normFor(ind, torol);
    // ⚠️ `ref` — БНБД-д норм заагаагүй лавлагааны үзүүлэлт: оноолт БОДОХГҮЙ
    //    (утга нь харагдана). Жин 0 нь мөн адил оноололд ордоггүй.
    if (ind.ref || ind.weight <= 0) {
      parts[ind.id] = { value: raw[ind.id] ?? null, score: null, weight: 0, norm: eff };
      continue;
    }
    total += ind.weight;
    const s = scoreIndicator(raw[ind.id], eff);
    parts[ind.id] = { value: raw[ind.id] ?? null, score: s, weight: ind.weight, norm: eff };
    if (s !== null) {
      sum += s * ind.weight; wsum += ind.weight;
      if (!(ind.id in ASSUME_MET)) measured += ind.weight;
    }
  }

  const coverage = total > 0 ? measured / total : null;
  if (!wsum) return { score: null, parts, coverage, reason: 'nodata' };
  /* 1e-9 — 46/92 гэх мэт яг тал нь хөвөгч цэгийн алдаагаар унахгүй */
  if (coverage == null || coverage + 1e-9 < minShare) return { score: null, parts, coverage, reason: 'coverage' };
  return { score: sum / wsum, parts, coverage, reason: null };
}

/**
 * Оноо → HEX өнгө. ТАСРАЛТГҮЙ градиент БИШ, 5 түвшний дискрет өнгө —
 * газрын зураг, эрэмбэ, дэлгэрэнгүй гурав үргэлж нэг л шатлалыг харуулна.
 *
 * ⚠️ 2026-10-09 (аудит №3): `dark` — порталын горим (`useTheme`). Утга нь `--score-N`
 *    токены ЗАДАРСАН hex (`chartStyle.SCORE_HEX`) тул газрын зураг ба самбар (`scoreTone`)
 *    хоёр горимд ИЖИЛ өнгөтэй. Урьд нь `SCORE_LEVELS.color` (хуучин палитр) — зөрдөг байв.
 *    Өгөгдөлгүйд `NO_DATA_COLOR` хэвээр (`SuitMap` түүгээр «өгөгдөлгүй»-г танина).
 */
export function scoreColor(score: number | null | undefined, dark = false): string {
  const i = levelOf(score);
  return i < 0 ? NO_DATA_COLOR : SCORE_HEX[dark ? 'dark' : 'light'][TOKEN_IX[i]];
}

/**
 * Оноо → CSS ТОКЕН (`var(--score-1..5)`, өгөгдөлгүйд `var(--ink-3)`) — самбар, диаграм, тэмдэгт.
 *
 * ⚠️ 2026-10-09 («бүх графикийн загварыг жигдлэх»): DOM/SVG-д hex биш токен — dark
 *    горимд дагана. `scoreColor` (hex) нь ЗӨВХӨН газрын зураг/PDF-д (var() задалдаггүй).
 *    Хоёулаа `levelOf`-оор нэг түвшинг авна — шатлал зөрөхгүй.
 * ⚠️ SVG-д `fill=`/`stroke=` шинжид бүү өг — `style={{ fill }}`-ээр.
 */
export function scoreTone(score: number | null | undefined): string {
  const i = levelOf(score);
  return i < 0 ? NO_DATA_TONE : SCORE_LEVELS[i].tone;
}

/**
 * `scoreTone` (= `scoreColor(_, dark)`) ДЭВСГЭР дээрх бичгийн өнгө (WCAG ≥ 4.5:1) — 2026-10-09.
 * ⚠️ Тэмдэг/хэмжүүрийн тоог `color: var(--bg)`-оор бичихгүй: цайвар түвшинд цагаан уншигдахгүй.
 * ⚠️ 2026-10-09 (аудит №3): горимоос ХАМААРНА (`dark`) — дэвсгэр нь токен болсон тул хуучин
 *    `SCORE_LEVELS.ink` (горимгүй, хуучин hex-д тааруулсан) цайвар «Маш сайн»-д 3.5:1, dark
 *    «Маш муу»-д 2.8:1 өгч байв. Харьцаанууд `chartStyle.SCORE_INK`-ийн тайлбарт.
 *    Өгөгдөлгүйн дэвсгэр нь `var(--ink-3)` (`NO_DATA_TONE`).
 */
export function scoreInk(score: number | null | undefined, dark = false): string {
  const i = levelOf(score);
  const m = dark ? 'dark' : 'light';
  return i < 0 ? SCORE_NODATA_INK[m] : SCORE_INK[m][TOKEN_IX[i]];
}

/** Оноог үгээр */
export function scoreLabel(score: number | null | undefined): string {
  const i = levelOf(score);
  return i < 0 ? tr('Өгөгдөлгүй') : SCORE_LEVELS[i].label;
}

/** Норм хангасан эсэх — оноо биш, ТҮҮХИЙ утгаар шалгана */
export function passesNorm(raw: number | null | undefined, ind: Indicator): boolean | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  /* ⚠️ 2026-10-22 (аудит): норм хамаарахгүй → дүгнэхгүй; дэлгэцийн нарийвчлалаар (`scoreIndicator`-тэй ижил) */
  if (ind.na) return null;
  const value = atPrecision(raw, ind.decimals);
  if (ind.mode === 'band') return value >= (ind.optMin ?? 0) && value <= (ind.optMax ?? 0);
  if (ind.mode === 'higher') return value >= (ind.target ?? 0);
  return value <= (ind.best ?? 0);
}

/**
 * НОРМООС ХЭР ЗӨРСӨН — үргэлж ЭЕРЭГ тоо (зөрчлийн хэмжээ), хангасан бол 0.
 *
 * ⚠️ Оноо нь шалтгаан хэлдэггүй: «35 оноо» гэдгээс юуг хэдээр засахыг мэдэхгүй.
 * Энэ нь «ногоон 3.9 м²/хүн ДУТУУ» гэсэн үйлдэл болгож болох тоог өгнө.
 *
 * ⚠️ `band` горимд хоёр талдаа зөрч болно (нягтшил хэт бага ч, хэт өндөр ч) —
 * хаана талаас нь давсныг дуудагч тал `value < optMin` гэж өөрөө шалгана.
 */
export function normGap(raw: number | null | undefined, ind: Indicator): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (ind.na) return null;
  const value = atPrecision(raw, ind.decimals);
  if (ind.mode === 'higher') return Math.max(0, (ind.target ?? 0) - value);
  if (ind.mode === 'lower') return Math.max(0, value - (ind.best ?? 0));
  const lo = ind.optMin ?? 0;
  const hi = ind.optMax ?? 0;
  return value < lo ? lo - value : value > hi ? value - hi : 0;
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
