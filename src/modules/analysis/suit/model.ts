/**
 * АНАЛИЗ — загварын хуваалцсан төрөл ба оноо нэгтгэх функцууд.
 *
 * ⚠️ Suitability-ийн олон дэд компонент (эрэмбэ, газрын зураг, нийлмэл карт) нь
 * бүсийн оноог НЭГ ижил аргаар бодох ёстой. Тус тусдаа бичвэл нэг горим засахад
 * нөгөө нь хоцорч, эрэмбэ ба будалт зөрнө — тиймээс `valueOf` энд ганц эх
 * үүсвэртэй.
 */

import type { MapRow } from '../SuitMap';
import type { Indicator } from '@/lib/analysis/config';
import { scoreIndicator, normFor, type Part } from '@/lib/analysis/score';

/**
 * ⚠️ `blend` нь НИЙЛМЭЛ үнэлгээ бөгөөд аппын НЭЭГДЭХ горим: хот төлөвлөлт ба
 * эдийн засаг хоёрын аль нэгийг дангаар нь харах нь дүгнэлтийг тал болгодог.
 */
/* ⚠️ 2026-08-24: 'blend' ба 'econ' горимууд УСТГАГДАВ — зохиомол нэгж үнэ
   дээр тогтсон эдийн засгийн загвар бүрмөсөн хасагдсан. */
export type Mode = 'urban' | 'indicator' | 'simulation';
export type Row = MapRow & { parts: Record<string, Part> };

export const valueOf = (r: Row, mode: Mode, ind: Indicator): number | null =>
  mode === 'urban' ? r.urban
    : scoreIndicator(r.raw[ind.id] ?? null, normFor(ind, r.type));

/* ══════════════════ Хадгалагддаг төлөв ══════════════════ */

export const COLLAPSE_KEY = 'selbe.collapsed';
export const PANEL_KEY = 'selbe.panels';

export const readSet = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]') as string[]); }
  catch { return new Set(); }
};
