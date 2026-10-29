/**
 * АНАЛИЗ — загварын хуваалцсан төрөл ба оноо нэгтгэх функцууд.
 */

import type { MapRow } from '../SuitMap';
import type { Indicator } from '@/lib/analysis/config';
import { scoreIndicator, normFor, type Part } from '@/lib/analysis/score';

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
