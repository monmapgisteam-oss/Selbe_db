/**
 * АНАЛИЗ — загварын хуваалцсан төрөл ба оноо нэгтгэх функцууд.
 *
 * ⚠️ Suitability-ийн олон дэд компонент (эрэмбэ, газрын зураг, нийлмэл карт) нь
 * бүсийн оноог НЭГ ижил аргаар бодох ёстой. Тус тусдаа бичвэл нэг горим засахад
 * нөгөө нь хоцорч, эрэмбэ ба будалт зөрнө — тиймээс `valueOf` энд ганц эх
 * үүсвэртэй.
 */

import type { MapRow } from '../SuitMap';
import { profitScore, type Indicator } from '@/lib/analysis/config';
import { scoreIndicator, normFor, type Part } from '@/lib/analysis/score';

/**
 * ⚠️ `blend` нь НИЙЛМЭЛ үнэлгээ бөгөөд аппын НЭЭГДЭХ горим: хот төлөвлөлт ба
 * эдийн засаг хоёрын аль нэгийг дангаар нь харах нь дүгнэлтийг тал болгодог.
 */
export type Mode = 'blend' | 'urban' | 'indicator' | 'econ';
export type Row = MapRow & { parts: Record<string, Part> };

/**
 * Эдийн засгийн оноо — АШГИЙН МАРЖААР.
 * Тэнцүү (0%) = Дунд · алдагдалтай = Муу · өндөр алдагдалтай = Маш муу ·
 * ашигтай = Сайн · өндөр ашигтай = Маш сайн.
 */
export const econScore = (r: Row) => profitScore(r.econ?.margin);

/**
 * Нийлмэл оноо — хот төлөвлөлт × (100−e)% + эдийн засаг × e%.
 * ⚠️ Аль нэг нь өгөгдөлгүй бол нөгөөг нь БҮТНЭЭР авна: `?? 0` хийвэл мэдээлэл
 * дутуу бүс автоматаар хагас оноотой болж, «муу» мэт харагдана.
 */
export function blendScore(r: Row, econShare: number): number | null {
  const u = r.urban;
  const e = econScore(r);
  if (u == null && e == null) return null;
  if (u == null) return e;
  if (e == null) return u;
  return u * (1 - econShare / 100) + e * (econShare / 100);
}

export const valueOf = (r: Row, mode: Mode, ind: Indicator, econShare: number): number | null =>
  mode === 'blend' ? blendScore(r, econShare)
    : mode === 'urban' ? r.urban
      : mode === 'econ' ? econScore(r)
        : scoreIndicator(r.raw[ind.id] ?? null, normFor(ind, r.type));

/* ══════════════════ Хадгалагддаг төлөв ══════════════════ */

export const COLLAPSE_KEY = 'selbe.collapsed';
export const PANEL_KEY = 'selbe.panels';

export const readSet = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]') as string[]); }
  catch { return new Set(); }
};
