/**
 * АНАЛИЗ модулийн форматлагчид — mn-MN, эх аппын хэлбэрээр.
 *
 * ⚠️ `lib/format.ts`-ээс ЯЛГААТАЙ: тэр нь en-US бүлгийн тусгаарлагчтай, портал
 * даяар хэрэглэгддэг. Анализ модуль нь эх Suitability аппын дизайныг хадгалдаг
 * тул mn-MN бүлэглэл, «тэрбум₮/сая₮» богиносголтой. Хоёр модуль тусдаа
 * форматтай байх нь санаатай — гэхдээ анализ ДОТРОО ганц эх сурвалжтай байх
 * ёстой тул эдгээрийг НЭГ л газар (энд) тодорхойлж, Suitability/SuitDetail
 * хоёулаа эндээс уншина.
 */

import { DENSITY_BY_TYPE, type Indicator } from '@/lib/analysis/config';
import { normText } from '@/lib/analysis/score';

export const nf = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('mn-MN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Нэгж үнэ — товчлолгүй, бүтэн тоогоор (2,500,000,000 ₮) */
export const unitMoney = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${nf(v)} ₮`;

/** Мөнгөн дүнг уншихад ойлгомжтой нэгжээр */
export function money(v: number | null | undefined, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${nf(a / 1e9, d)} тэрбум₮`;
  if (a >= 1e6) return `${sign}${nf(a / 1e6, d)} сая₮`;
  if (a >= 1e3) return `${sign}${nf(a / 1e3, 0)} мянга₮`;
  return `${sign}${nf(a, 0)}₮`;
}

/** HTML-д шингээхэд аюулгүй болгох — hover панелийг гараар угсрахад заавал */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Нормын шаардлагыг нэг мөрөнд — FAR/BCR нь бүсийн төрлөөр өөр */
export function normLine(ind: Indicator): string {
  if (ind.byType) {
    const vals = Object.values(DENSITY_BY_TYPE).map((v) => v[ind.byType!]);
    const u = ind.unit ? ` ${ind.unit}` : '';
    return `бүсийн төрлөөр ≤ ${nf(Math.min(...vals), ind.decimals)} … ${nf(Math.max(...vals), ind.decimals)}${u}`;
  }
  return normText(ind, nf);
}
