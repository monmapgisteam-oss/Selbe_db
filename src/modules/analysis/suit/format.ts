/**
 * АНАЛИЗ модулийн форматлагчид — mn-MN, эх аппын хэлбэрээр.
 *
 * ⚠️ 2026-09-01: МӨНГӨН дүн портал даяар НЭГ дүрэмтэй боллоо — бүтэн, мянгатын
 * ТАСЛАЛТАЙ (хэрэглэгчийн шийдвэр). Урьд нь энэ модуль mn-MN бүлэглэл ба
 * «тэрбум₮/сая₮» товчлолтой, САНААТАЙ ялгаатай байв; тэр ялгаа ЦУЦЛАГДСАН.
 * Тоон (мөнгө БИШ) `nf` нь mn-MN хэвээр — эх Suitability аппын харагдац.
 * Suitability/SuitDetail хоёул эндээс уншина.
 */

import { DENSITY_BY_TYPE, type Indicator } from '@/lib/analysis/config';
import { t as tr } from '@/lib/i18nCore';
import { normText } from '@/lib/analysis/score';

export const nf = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('mn-MN', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Мөнгөн дүн — БҮТНЭЭР, мянгатын таслалтай. Хасах утгыг `−` (U+2212) тэмдгээр.
 * ⚠️ Товчлолгүй: `lib/format.ts`-ийн `mnt`-тэй ижил дүрэм. Ялгаа нь зөвхөн
 *    хасах тэмдгийн боловсруулалт ба `₮`-г зайгүй наадаг эх аппын хэлбэр.
 */
export function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  return `${sign}${a.toLocaleString('en-US')}₮`;
}

/** HTML-д шингээхэд аюулгүй болгох — hover панелийг гараар угсрахад заавал */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Нормын шаардлагыг нэг мөрөнд — FAR/BCR нь бүсийн төрлөөр өөр */
export function normLine(ind: Indicator): string {
  if (ind.byType) {
    const vals = Object.values(DENSITY_BY_TYPE).map((v) => v[ind.byType!]);
    const u = ind.unit ? ` ${ind.unit}` : '';
    return tr('бүсийн төрлөөр ≤ {0} … {1}{2}', nf(Math.min(...vals), ind.decimals), nf(Math.max(...vals), ind.decimals), u);
  }
  return normText(ind, nf);
}
